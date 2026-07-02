import { CosmosClient } from "@azure/cosmos";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const containerName = process.env.AZURE_COSMOS_CODEX_JOBS_CONTAINER || "codex-jobs";
const localPath = path.join(
  process.env.ATG_STATE_ROOT || path.join(process.env.ATG_DATA_ROOT || process.cwd(), ".atg"),
  "codex-jobs.json"
);
let localQueue = Promise.resolve();

export async function createCodexJob(input) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const record = {
    ...input,
    createdAt: now.toISOString(),
    events: [{ type: "status", message: "Waiting for an isolated Codex worker..." }],
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
    id: randomUUID(),
    status: "queued",
    tokenHash: hash(token),
    type: "codex-job",
    updatedAt: now.toISOString()
  };
  await save(record);
  return { job: publicJob(record), token };
}

export async function getCodexJob(id) {
  const record = await read(id);
  return record ? publicJob(record) : null;
}

export async function authenticateCodexJob(id, token) {
  const record = await read(id);
  if (!record || hash(token || "") !== record.tokenHash) {
    throw new CodexJobError("Job authentication failed.", 401);
  }
  if (Date.parse(record.expiresAt) <= Date.now()) {
    throw new CodexJobError("Job credential expired.", 401);
  }
  if (record.status === "done" || record.status === "error") {
    throw new CodexJobError("Job is already complete.", 409);
  }
  return record;
}

export async function appendCodexJobEvent(id, token, event) {
  const record = await authenticateCodexJob(id, token);
  record.status = "running";
  record.events.push(event);
  record.events = record.events.slice(-100);
  record.updatedAt = new Date().toISOString();
  await save(record);
  return publicJob(record);
}

export async function claimCodexJobCompletion(id, token) {
  const record = await authenticateCodexJob(id, token);
  if (record.status === "completing") {
    throw new CodexJobError("Job completion is already being processed.", 409);
  }
  record.status = "completing";
  record.updatedAt = new Date().toISOString();
  if (useAzure()) {
    try {
      await container().item(id, id).replace(record, {
        accessCondition: { type: "IfMatch", condition: record._etag }
      });
    } catch (error) {
      if (error?.code === 412) {
        throw new CodexJobError("Job completion is already being processed.", 409);
      }
      throw error;
    }
  } else {
    await save(record);
  }
  return record;
}

export async function completeCodexJob(id, token, result) {
  const record = await authenticateCodexJob(id, token);
  record.status = result.ok ? "done" : "error";
  record.result = result;
  record.events.push(result.ok
    ? { type: "final", message: result.finalMessage }
    : { type: "error", message: result.errorMessage });
  record.updatedAt = new Date().toISOString();
  record.tokenHash = hash(randomBytes(32).toString("base64url"));
  await save(record);
  return publicJob(record);
}

export class CodexJobError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function publicJob(record) {
  const { tokenHash, userId, ...job } = record;
  void tokenHash;
  void userId;
  return job;
}

async function read(id) {
  if (useAzure()) {
    try {
      const { resource } = await container().item(id, id).read();
      return resource || null;
    } catch (error) {
      if (error?.code === 404) return null;
      throw error;
    }
  }
  const database = await readLocal();
  return database.records[id] || null;
}

async function save(record) {
  if (useAzure()) {
    await container().items.upsert(record);
    return;
  }
  localQueue = localQueue.then(async () => {
    const database = await readLocal();
    database.records[record.id] = record;
    await mkdir(path.dirname(localPath), { recursive: true });
    const temporary = `${localPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(database, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, localPath);
  });
  await localQueue;
}

async function readLocal() {
  try {
    const parsed = JSON.parse(await readFile(localPath, "utf8"));
    return parsed?.records ? parsed : { records: {} };
  } catch (error) {
    if (error?.code === "ENOENT") return { records: {} };
    throw error;
  }
}

function container() {
  return new CosmosClient({
    endpoint: required("AZURE_COSMOS_ENDPOINT"),
    key: required("AZURE_COSMOS_KEY")
  }).database(required("AZURE_COSMOS_DATABASE")).container(containerName);
}

function useAzure() {
  return (process.env.ATG_STORAGE_BACKEND || "local").toLowerCase() === "azure";
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new CodexJobError(`${name} is required.`, 503);
  return value;
}
