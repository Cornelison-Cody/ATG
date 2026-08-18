import { CosmosClient } from "@azure/cosmos";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const containerName = process.env.AZURE_COSMOS_CONVERSIONS_CONTAINER || "conversions";
const localPath = path.join(
  process.env.ATG_STATE_ROOT || path.join(process.env.ATG_DATA_ROOT || process.cwd(), ".atg"),
  "conversions.json"
);
let localQueue = Promise.resolve();

export const CONVERSION_STATUSES = Object.freeze(["queued", "running", "review", "failed", "cancelled", "accepted"]);

export async function createOrGetConversion({ conversionId = randomUUID(), projectId, snapshot }) {
  if (!projectId || !snapshot?.fingerprint) throw new Error("A conversion project and snapshot are required.");
  const existing = await read(conversionId);
  if (existing) {
    if (existing.projectId !== projectId) throw new ConversionStoreError("Conversion id belongs to another project.", 409);
    return existing;
  }

  const now = new Date().toISOString();
  const record = {
    id: conversionId,
    projectId,
    snapshot,
    candidate: null,
    validation: null,
    status: "queued",
    retryCount: 0,
    events: [{ type: "status", message: "Conversion snapshot captured." }],
    errorMessage: null,
    createdAt: now,
    updatedAt: now
  };
  await save(record);
  return record;
}

export async function getConversion(conversionId) {
  return read(conversionId);
}

export async function listProjectConversions(projectId) {
  if (useAzure()) {
    const { resources } = await container().items.query({
      query: "SELECT * FROM c WHERE c.projectId = @projectId ORDER BY c.updatedAt DESC",
      parameters: [{ name: "@projectId", value: projectId }]
    }).fetchAll();
    return resources;
  }
  const database = await readLocal();
  return Object.values(database.records).filter((record) => record.projectId === projectId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function markConversionRunning(conversionId) {
  return mutate(conversionId, (record) => {
    if (record.status === "queued" || record.status === "failed") record.status = "running";
    if (record.status === "cancelled" || record.status === "accepted") return record;
    record.errorMessage = null;
    addEvent(record, { type: "status", message: "Conversion is running in an isolated workspace." });
  });
}

export async function saveConversionCandidate(conversionId, candidate) {
  return mutate(conversionId, (record) => {
    if (record.status === "cancelled" || record.status === "accepted") {
      throw new ConversionStoreError(`Conversion is already ${record.status}.`, 409);
    }
    record.candidate = candidate;
    record.validation = null;
    record.status = "review";
    record.errorMessage = null;
    record.validation = null;
    addEvent(record, { type: "status", message: "Conversion candidate is ready for review." });
  });
}

export async function saveConversionValidation(conversionId, validation) {
  return mutate(conversionId, (record) => {
    if (record.status !== "review" || !record.candidate) {
      throw new ConversionStoreError("A reviewable conversion candidate is required.", 409);
    }
    record.validation = validation;
    addEvent(record, {
      type: "status",
      message: validation.blockingErrors.length ? "Validation found blocking issues." : "Conversion validation completed."
    });
  });
}

export async function failConversion(conversionId, errorMessage) {
  return mutate(conversionId, (record) => {
    if (record.status === "accepted" || record.status === "cancelled") return record;
    record.status = "failed";
    record.errorMessage = errorMessage || "Conversion failed.";
    record.candidate = null;
    addEvent(record, { type: "error", message: record.errorMessage });
  });
}

export async function cancelConversion(conversionId) {
  return mutate(conversionId, (record) => {
    if (record.status === "accepted") throw new ConversionStoreError("Accepted conversions cannot be cancelled.", 409);
    if (record.status === "cancelled") return record;
    record.status = "cancelled";
    record.candidate = null;
    addEvent(record, { type: "status", message: "Conversion cancelled; published files remain unchanged." });
  });
}

export async function retryConversion(conversionId) {
  return mutate(conversionId, (record) => {
    if (record.status !== "failed") throw new ConversionStoreError("Only failed conversions can be retried.", 409);
    record.status = "queued";
    record.retryCount += 1;
    record.errorMessage = null;
    addEvent(record, { type: "status", message: "Conversion retry queued." });
  });
}

export async function acceptConversion(conversionId) {
  return mutate(conversionId, (record) => {
    if (record.status !== "review" || !record.candidate) {
      throw new ConversionStoreError("A reviewable conversion candidate is required.", 409);
    }
    record.status = "accepted";
    addEvent(record, { type: "status", message: "Conversion candidate accepted." });
  });
}

export class ConversionStoreError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "ConversionStoreError";
    this.status = status;
  }
}

async function mutate(id, callback) {
  const record = await read(id);
  if (!record) throw new ConversionStoreError("Conversion was not found.", 404);
  callback(record);
  record.updatedAt = new Date().toISOString();
  await save(record);
  return record;
}

function addEvent(record, event) {
  record.events = [...(Array.isArray(record.events) ? record.events : []), event].slice(-100);
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

function required(name) {
  const value = process.env[name];
  if (!value) throw new ConversionStoreError(`${name} is required.`, 503);
  return value;
}
