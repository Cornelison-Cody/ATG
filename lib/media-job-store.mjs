import { CosmosClient } from "@azure/cosmos";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const containerName = process.env.AZURE_COSMOS_MEDIA_JOBS_CONTAINER || "media-jobs";
const localPath = path.join(process.env.ATG_STATE_ROOT || path.join(process.env.ATG_DATA_ROOT || process.cwd(), ".atg"), "media-jobs.json");
let localQueue = Promise.resolve();

export async function createMediaJobRecord(job) { const existing = await getMediaJob(job.id); if (existing) return existing; await save(job); return job; }
export async function getMediaJob(id) { if (useAzure()) { try { const { resource } = await container().item(id, id).read(); return resource || null; } catch (error) { if (error?.code === 404) return null; throw error; } } const database = await readLocal(); return database.records[id] || null; }
export async function listProjectMediaJobs(projectId) { if (useAzure()) { const { resources } = await container().items.query({ query: "SELECT * FROM c WHERE c.projectId = @projectId ORDER BY c.updatedAt DESC", parameters: [{ name: "@projectId", value: projectId }] }).fetchAll(); return resources; } const database = await readLocal(); return Object.values(database.records).filter((job) => job.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
export async function updateMediaJob(id, callback) { const job = await getMediaJob(id); if (!job) throw new MediaJobStoreError("Media job was not found.", 404); callback(job); job.updatedAt = new Date().toISOString(); await save(job); return job; }
export async function claimMediaJob(id, owner, leaseMs = 120_000) {
  const now = Date.now(); let claimed = null;
  await updateMediaJob(id, (job) => {
    const active = job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) > now;
    if (active && job.leaseOwner !== owner) return;
    if (!["queued", "running"].includes(job.status)) return;
    job.status = "running"; job.leaseOwner = owner; job.leaseExpiresAt = new Date(now + leaseMs).toISOString(); claimed = job;
  });
  return claimed;
}
export async function releaseMediaJobLease(id, owner) { return updateMediaJob(id, (job) => { if (job.leaseOwner === owner) { delete job.leaseOwner; delete job.leaseExpiresAt; } }); }
export class MediaJobStoreError extends Error { constructor(message, status = 500) { super(message); this.name = "MediaJobStoreError"; this.status = status; } }
async function save(job) { if (useAzure()) { await container().items.upsert(job); return; } localQueue = localQueue.then(async () => { const database = await readLocal(); database.records[job.id] = job; await mkdir(path.dirname(localPath), { recursive: true }); const temporary = `${localPath}.${process.pid}.tmp`; await writeFile(temporary, `${JSON.stringify(database, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, localPath); }); await localQueue; }
async function readLocal() { try { const parsed = JSON.parse(await readFile(localPath, "utf8")); return parsed?.records ? parsed : { records: {} }; } catch (error) { if (error?.code === "ENOENT") return { records: {} }; throw error; } }
function useAzure() { return (process.env.ATG_STORAGE_BACKEND || "local").toLowerCase() === "azure"; }
function container() { return new CosmosClient({ endpoint: required("AZURE_COSMOS_ENDPOINT"), key: required("AZURE_COSMOS_KEY") }).database(required("AZURE_COSMOS_DATABASE")).container(containerName); }
function required(name) { const value = process.env[name]; if (!value) throw new MediaJobStoreError(`${name} is required.`, 503); return value; }
