import { CosmosClient } from "@azure/cosmos";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const containerName = process.env.AZURE_COSMOS_RUNTIME_UPGRADES_CONTAINER || "runtime-upgrades";
const localPath = path.join(process.env.ATG_STATE_ROOT || path.join(process.env.ATG_DATA_ROOT || process.cwd(), ".atg"), "runtime-upgrades.json");
let localQueue = Promise.resolve();

export async function createOrGetRuntimeUpgrade({ id = randomUUID(), projectId, currentMetadata, candidate, currentRevision }) {
  if (!projectId || currentMetadata?.type !== "pixi" || !candidate?.runtimeVersion) throw new RuntimeUpgradeStoreError("Runtime upgrades require an engine-backed project and candidate.", 400);
  const existing = await read(id);
  if (existing) {
    if (existing.projectId !== projectId) throw new RuntimeUpgradeStoreError("Runtime upgrade belongs to another project.", 409);
    return existing;
  }
  const now = new Date().toISOString();
  const record = { id, projectId, currentMetadata, candidate, currentRevision, previewRevision: `${currentRevision}:runtime:${candidate.runtimeVersion}`, status: "preview", validation: null, events: [{ type: "status", message: "Runtime upgrade preview is ready." }], createdAt: now, updatedAt: now };
  await save(record);
  return record;
}

export async function getRuntimeUpgrade(id) { return read(id); }
export async function listProjectRuntimeUpgrades(projectId) {
  if (useAzure()) {
    const { resources } = await container().items.query({ query: "SELECT * FROM c WHERE c.projectId = @projectId ORDER BY c.updatedAt DESC", parameters: [{ name: "@projectId", value: projectId }] }).fetchAll();
    return resources;
  }
  const database = await readLocal();
  return Object.values(database.records).filter((record) => record.projectId === projectId).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function markRuntimeUpgrade(id, status, message) {
  return mutate(id, (record) => { if (record.status === "accepted") throw new RuntimeUpgradeStoreError("Accepted runtime upgrades cannot be changed.", 409); record.status = status; record.events.push({ type: "status", message }); });
}
export async function saveRuntimeUpgradeValidation(id, validation) {
  return mutate(id, (record) => {
    if (record.status !== "preview") throw new RuntimeUpgradeStoreError("Only an active runtime preview can be validated.", 409);
    record.validation = validation;
    record.events.push({ type: "validation", message: validation.blockingErrors.length ? "Runtime compatibility validation found blocking errors." : "Runtime compatibility validation completed." });
  });
}
export async function queueRuntimeUpgradeValidation(id, jobId) {
  return mutate(id, (record) => {
    if (record.status !== "preview") throw new RuntimeUpgradeStoreError("Only an active runtime preview can be validated.", 409);
    record.validationJobId = jobId;
    record.validation = { status: "queued", jobId, blockingErrors: [], warnings: [], checks: [] };
    record.events.push({ type: "validation", message: "Runtime compatibility validation is queued." });
  });
}
export class RuntimeUpgradeStoreError extends Error { constructor(message, status = 500) { super(message); this.name = "RuntimeUpgradeStoreError"; this.status = status; } }
async function mutate(id, callback) { const record = await read(id); if (!record) throw new RuntimeUpgradeStoreError("Runtime upgrade was not found.", 404); callback(record); record.updatedAt = new Date().toISOString(); await save(record); return record; }
async function read(id) { if (useAzure()) { try { const { resource } = await container().item(id, id).read(); return resource || null; } catch (error) { if (error?.code === 404) return null; throw error; } } const database = await readLocal(); return database.records[id] || null; }
async function save(record) { if (useAzure()) { await container().items.upsert(record); return; } localQueue = localQueue.then(async () => { const database = await readLocal(); database.records[record.id] = record; await mkdir(path.dirname(localPath), { recursive: true }); const temporary = `${localPath}.${process.pid}.tmp`; await writeFile(temporary, `${JSON.stringify(database, null, 2)}\n`, { mode: 0o600 }); await rename(temporary, localPath); }); await localQueue; }
async function readLocal() { try { const parsed = JSON.parse(await readFile(localPath, "utf8")); return parsed?.records ? parsed : { records: {} }; } catch (error) { if (error?.code === "ENOENT") return { records: {} }; throw error; } }
function useAzure() { return (process.env.ATG_STORAGE_BACKEND || "local").toLowerCase() === "azure"; }
function container() { return new CosmosClient({ endpoint: required("AZURE_COSMOS_ENDPOINT"), key: required("AZURE_COSMOS_KEY") }).database(required("AZURE_COSMOS_DATABASE")).container(containerName); }
function required(name) { const value = process.env[name]; if (!value) throw new RuntimeUpgradeStoreError(`${name} is required.`, 503); return value; }
