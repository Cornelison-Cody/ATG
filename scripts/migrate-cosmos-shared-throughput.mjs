import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { CosmosClient } from "@azure/cosmos";

const SYSTEM_ITEM_PROPERTIES = new Set(["_attachments", "_etag", "_rid", "_self", "_ts"]);
const CONTAINER_DEFINITION_PROPERTIES = [
  "analyticalStorageTtl",
  "clientEncryptionPolicy",
  "computedProperties",
  "conflictResolutionPolicy",
  "defaultTtl",
  "fullTextPolicy",
  "indexingPolicy",
  "partitionKey",
  "uniqueKeyPolicy",
  "vectorEmbeddingPolicy"
];

export function sanitizeCosmosItem(item) {
  return Object.fromEntries(
    Object.entries(item).filter(([key]) => !SYSTEM_ITEM_PROPERTIES.has(key))
  );
}

export function copyContainerDefinition(definition) {
  const copy = { id: definition.id };
  for (const property of CONTAINER_DEFINITION_PROPERTIES) {
    if (definition[property] !== undefined && definition[property] !== null) {
      copy[property] = definition[property];
    }
  }
  return copy;
}

export function fingerprintItems(items) {
  const hash = createHash("sha256");
  const normalized = items
    .map(sanitizeCosmosItem)
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  for (const item of normalized) hash.update(stableStringify(item));
  return hash.digest("hex");
}

export function partitionKeyValue(item, partitionKeyDefinition) {
  const paths = partitionKeyDefinition?.paths;
  if (!Array.isArray(paths) || paths.length !== 1) {
    throw new Error("Cosmos migration supports exactly one partition-key path per container.");
  }
  const segments = paths[0].split("/").filter(Boolean).map(unescapeJsonPointer);
  let value = item;
  for (const segment of segments) value = value?.[segment];
  if (value === undefined) {
    throw new Error(`Item ${item.id ?? "<unknown>"} has no value for partition key ${paths[0]}.`);
  }
  return value;
}

export async function migrateDatabase({ client, sourceDatabaseName, targetDatabaseName, throughput = 1000, maxAttempts = 5 }) {
  if (!sourceDatabaseName || !targetDatabaseName) throw new Error("Source and target database names are required.");
  if (sourceDatabaseName === targetDatabaseName) throw new Error("Source and target database names must differ.");
  if (!Number.isInteger(throughput) || throughput < 400) throw new Error("Throughput must be an integer of at least 400 RU/s.");

  const sourceDatabase = client.database(sourceDatabaseName);
  await sourceDatabase.read();
  const { database: targetDatabase } = await client.databases.createIfNotExists(
    { id: targetDatabaseName },
    { offerThroughput: throughput }
  );
  const { resources: sourceDefinitions } = await sourceDatabase.containers.readAll().fetchAll();
  if (sourceDefinitions.length === 0) throw new Error(`Source database ${sourceDatabaseName} has no containers.`);

  const results = [];
  for (const sourceDefinition of sourceDefinitions.sort((left, right) => left.id.localeCompare(right.id))) {
    const definition = copyContainerDefinition(sourceDefinition);
    const { container: targetContainer } = await targetDatabase.containers.createIfNotExists(definition);
    const sourceContainer = sourceDatabase.container(sourceDefinition.id);
    const result = await synchronizeContainer({
      sourceContainer,
      targetContainer,
      partitionKey: definition.partitionKey,
      maxAttempts
    });
    results.push({ name: sourceDefinition.id, ...result });
  }
  return results;
}

async function synchronizeContainer({ sourceContainer, targetContainer, partitionKey, maxAttempts }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const sourceItems = await readAllItems(sourceContainer);
    const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
    const targetItemsBefore = await readAllItems(targetContainer);

    for (const item of sourceItems) await targetContainer.items.upsert(sanitizeCosmosItem(item));
    for (const targetItem of targetItemsBefore) {
      if (!sourceById.has(targetItem.id)) {
        await targetContainer.item(targetItem.id, partitionKeyValue(targetItem, partitionKey)).delete();
      }
    }

    const sourceVerificationItems = await readAllItems(sourceContainer);
    const targetVerificationItems = await readAllItems(targetContainer);
    const sourceFingerprint = fingerprintItems(sourceVerificationItems);
    const targetFingerprint = fingerprintItems(targetVerificationItems);
    if (sourceVerificationItems.length === targetVerificationItems.length && sourceFingerprint === targetFingerprint) {
      return {
        itemCount: sourceVerificationItems.length,
        fingerprint: sourceFingerprint,
        attempts: attempt
      };
    }
  }
  throw new Error(`Container ${sourceContainer.id} changed during every synchronization attempt.`);
}

async function readAllItems(container) {
  const { resources } = await container.items.readAll().fetchAll();
  return resources;
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function unescapeJsonPointer(segment) {
  return segment.replaceAll("~1", "/").replaceAll("~0", "~");
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}.`);
    values.set(argument.slice(2), value);
    index += 1;
  }
  return {
    sourceDatabaseName: values.get("source"),
    targetDatabaseName: values.get("target"),
    throughput: Number(values.get("throughput") || "1000")
  };
}

async function main() {
  const endpoint = process.env.AZURE_COSMOS_ENDPOINT;
  const key = process.env.AZURE_COSMOS_KEY;
  if (!endpoint || !key) throw new Error("AZURE_COSMOS_ENDPOINT and AZURE_COSMOS_KEY are required.");
  const options = parseArguments(process.argv.slice(2));
  const client = new CosmosClient({ endpoint, key });
  const results = await migrateDatabase({ client, ...options });
  for (const result of results) {
    console.log(`${result.name}: verified ${result.itemCount} items (${result.fingerprint.slice(0, 12)}, attempt ${result.attempts})`);
  }
  console.log(`Verified migration from ${options.sourceDatabaseName} to ${options.targetDatabaseName}.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
