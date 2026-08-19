import { CosmosClient } from "@azure/cosmos";
import { QueueServiceClient } from "@azure/storage-queue";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const containerName = process.env.AZURE_COSMOS_BACKGROUND_JOBS_CONTAINER || "background-jobs";
const queueName = process.env.AZURE_STORAGE_BACKGROUND_JOBS_QUEUE || "background-jobs";
const localPath = path.join(process.env.ATG_STATE_ROOT || path.join(process.env.ATG_DATA_ROOT || process.cwd(), ".atg"), "background-jobs.json");
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];
const MAX_ATTEMPTS = 3;
let localWrite = Promise.resolve();

/** Public, creator-safe projection. Never add provider payloads, leases, ETags, or credentials here. */
export function projectBackgroundJob(job) {
  return {
    id: job.id, kind: job.kind, projectId: job.projectId, status: job.status,
    attempt: job.attempt, maxAttempts: MAX_ATTEMPTS, retryable: Boolean(job.retryable),
    progress: job.progress || { phase: "queued", completed: 0, total: 1, message: "Queued" },
    error: job.error ? { code: job.error.code, message: job.error.message } : undefined,
    artifacts: job.artifacts || [], createdAt: job.createdAt, updatedAt: job.updatedAt
  };
}

export async function createBackgroundJob(input) {
  const now = new Date().toISOString();
  const job = {
    id: input.id || randomUUID(), projectId: input.projectId, kind: input.kind,
    payload: input.payload || {}, status: "queued", attempt: 0, retryable: true,
    progress: { phase: "queued", completed: 0, total: 1, message: "Queued" },
    artifacts: [], createdAt: now, updatedAt: now
  };
  const existing = await getBackgroundJob(job.id);
  if (existing) return existing;
  await save(job);
  await enqueue(job.id);
  return job;
}

export async function getBackgroundJob(id) {
  if (useAzure()) {
    try { const { resource } = await container().item(id, id).read(); return resource || null; }
    catch (error) { if (error?.code === 404) return null; throw error; }
  }
  return (await readLocal()).records[id] || null;
}

export async function listRunnableBackgroundJobs() {
  const now = Date.now();
  if (useAzure()) {
    const { resources } = await container().items.query({ query: "SELECT * FROM c WHERE (c.status = 'queued' AND (NOT IS_DEFINED(c.availableAt) OR c.availableAt <= @now)) OR (c.status = 'running' AND c.leaseExpiresAt <= @now)", parameters: [{ name: "@now", value: new Date(now).toISOString() }] }).fetchAll();
    return resources;
  }
  return Object.values((await readLocal()).records).filter((job) => (job.status === "queued" && (!job.availableAt || Date.parse(job.availableAt) <= now)) || (job.status === "running" && Date.parse(job.leaseExpiresAt || 0) <= now));
}

export async function claimBackgroundJob(id, owner, leaseMs = 120_000) {
  const now = Date.now();
  if (!useAzure()) return updateLocal(id, (job) => claim(job, owner, now, leaseMs));
  for (let retry = 0; retry < 3; retry += 1) {
    const job = await getBackgroundJob(id);
    if (!job) return null;
    const claimed = claim({ ...job }, owner, now, leaseMs);
    if (!claimed) return null;
    try { await container().item(id, id).replace(claimed, { accessCondition: { type: "IfMatch", condition: job._etag } }); return claimed; }
    catch (error) { if (error?.code !== 412) throw error; }
  }
  return null;
}

export async function heartbeatBackgroundJob(id, owner, progress) {
  return updateClaimed(id, owner, (job) => {
    job.leaseExpiresAt = new Date(Date.now() + 120_000).toISOString();
    if (progress) job.progress = safeProgress(progress);
  });
}

export async function requestBackgroundJobCancellation(id) {
  return updateAny(id, (job) => {
    if (!["queued", "running"].includes(job.status)) return;
    job.cancellationRequested = true;
    job.progress = { phase: "cancelling", completed: job.progress?.completed || 0, total: job.progress?.total || 1, message: "Cancellation requested" };
  });
}

export async function completeBackgroundJob(id, owner, outcome = {}) {
  return updateClaimed(id, owner, (job) => {
    job.status = outcome.cancelled || job.cancellationRequested ? "cancelled" : "completed";
    job.retryable = false; job.progress = safeProgress(outcome.progress || { phase: job.status, completed: 1, total: 1, message: job.status === "completed" ? "Complete" : "Cancelled" });
    job.artifacts = Array.isArray(outcome.artifacts) ? outcome.artifacts.map(safeArtifact) : [];
    delete job.leaseOwner; delete job.leaseExpiresAt;
  });
}

export async function failBackgroundJob(id, owner, error) {
  let delayed = 0;
  const result = await updateClaimed(id, owner, (job) => {
    const safeError = redactError(error);
    if (job.cancellationRequested) { job.status = "cancelled"; job.retryable = false; }
    else if (job.attempt >= MAX_ATTEMPTS) { job.status = "failed"; job.retryable = false; job.error = safeError; }
    else { delayed = RETRY_DELAYS_MS[Math.max(0, job.attempt - 1)] || RETRY_DELAYS_MS.at(-1); job.status = "queued"; job.retryable = true; job.availableAt = new Date(Date.now() + delayed).toISOString(); job.error = safeError; }
    delete job.leaseOwner; delete job.leaseExpiresAt;
  });
  if (result?.status === "queued") await enqueue(id, delayed);
  return result;
}

function claim(job, owner, now, leaseMs) {
  if (job.cancellationRequested || !["queued", "running"].includes(job.status)) return null;
  const active = job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) > now;
  if (active && job.leaseOwner !== owner) return null;
  if (job.availableAt && Date.parse(job.availableAt) > now) return null;
  job.status = "running"; job.attempt = (job.attempt || 0) + 1; job.leaseOwner = owner; job.leaseExpiresAt = new Date(now + leaseMs).toISOString();
  job.progress = safeProgress({ phase: "running", completed: job.progress?.completed || 0, total: job.progress?.total || 1, message: "Running" }); job.updatedAt = new Date().toISOString();
  return job;
}

async function updateClaimed(id, owner, mutate) {
  return updateWithEtag(id, (job) => { if (job.leaseOwner !== owner) return null; mutate(job); return job; });
}
async function updateAny(id, mutate) { return updateWithEtag(id, (job) => { mutate(job); return job; }); }
async function updateLocal(id, mutate) { return updateWithEtag(id, mutate, true); }
async function updateWithEtag(id, mutate, localOnly = false) {
  if (!useAzure() || localOnly) {
    let updated = null; localWrite = localWrite.then(async () => { const db = await readLocal(); const job = db.records[id]; if (!job) return; updated = mutate(job); if (updated) { updated.updatedAt = new Date().toISOString(); db.records[id] = updated; await writeLocal(db); } }); await localWrite; return updated;
  }
  for (let retry = 0; retry < 3; retry += 1) { const job = await getBackgroundJob(id); if (!job) return null; const updated = mutate({ ...job }); if (!updated) return null; updated.updatedAt = new Date().toISOString(); try { await container().item(id, id).replace(updated, { accessCondition: { type: "IfMatch", condition: job._etag } }); return updated; } catch (error) { if (error?.code !== 412) throw error; } }
  return null;
}
async function save(job) { if (useAzure()) { await container().items.create(job); return; } localWrite = localWrite.then(async () => { const db = await readLocal(); db.records[job.id] = job; await writeLocal(db); }); await localWrite; }
async function readLocal() { try { const value = JSON.parse(await readFile(localPath, "utf8")); return value?.records ? value : { records: {} }; } catch (error) { if (error?.code === "ENOENT") return { records: {} }; throw error; } }
async function writeLocal(db) { await mkdir(path.dirname(localPath), { recursive: true }); const temporary = `${localPath}.${process.pid}.tmp`; await writeFile(temporary, `${JSON.stringify(db, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, localPath); }
async function enqueue(id, delayMs = 0) { if (!useAzure()) return; const queue = QueueServiceClient.fromConnectionString(required("AZURE_STORAGE_CONNECTION_STRING")).getQueueClient(queueName); await queue.createIfNotExists(); await queue.sendMessage(JSON.stringify({ id }), { visibilityTimeout: Math.ceil(delayMs / 1000) }); }
function safeProgress(value) { return { phase: String(value.phase || "working").slice(0, 80), completed: Math.max(0, Number(value.completed) || 0), total: Math.max(1, Number(value.total) || 1), message: String(value.message || "Working").slice(0, 280) }; }
function safeArtifact(value) { return { name: String(value.name || "artifact").slice(0, 160), contentType: String(value.contentType || "application/octet-stream").slice(0, 120), size: Math.max(0, Number(value.size) || 0), sha256: String(value.sha256 || ""), expiresAt: value.expiresAt, url: value.url }; }
export function redactError(error) { const text = String(error?.message || error || "Worker failed"); const code = /moderation/i.test(text) ? "moderation_failed" : /cancel/i.test(text) ? "cancelled" : /timeout/i.test(text) ? "timeout" : "worker_failed"; return { code, message: code === "moderation_failed" ? "The request did not pass safety review." : code === "timeout" ? "The job timed out and can be retried." : "The job could not complete. You can retry it." }; }
function useAzure() { return (process.env.ATG_STORAGE_BACKEND || "local").toLowerCase() === "azure"; }
function container() { return new CosmosClient({ endpoint: required("AZURE_COSMOS_ENDPOINT"), key: required("AZURE_COSMOS_KEY") }).database(required("AZURE_COSMOS_DATABASE")).container(containerName); }
function required(name) { const value = process.env[name]; if (!value) throw new Error(`${name} is required.`); return value; }
