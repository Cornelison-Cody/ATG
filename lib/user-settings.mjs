import { CosmosClient } from "@azure/cosmos";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const localUserSettingsPath = path.join(
  process.env.ATG_STATE_ROOT || path.join(process.env.ATG_DATA_ROOT || process.cwd(), ".atg"),
  "user-settings.json"
);
const userSettingsContainer = process.env.AZURE_COSMOS_USER_SETTINGS_CONTAINER || "user-settings";
let localWriteQueue = Promise.resolve();

export async function hasUserApiKey(userId) {
  const record = await readUserSettings(userId);
  return Boolean(record?.encryptedApiKey);
}

export async function getUserApiKey(userId) {
  const record = await readUserSettings(userId);
  return record?.encryptedApiKey ? decryptApiKey(record.encryptedApiKey, userId) : "";
}

export async function saveUserApiKey(userId, apiKey) {
  const normalized = normalizeApiKey(apiKey);
  const record = {
    id: userDocumentId(userId),
    type: "user-settings",
    encryptedApiKey: encryptApiKey(normalized, userId),
    updatedAt: new Date().toISOString()
  };

  if (useAzureStorage()) {
    await getCosmosContainer().items.upsert(record);
  } else {
    await updateLocalSettings((database) => {
      database.records[record.id] = record;
    });
  }
}

export async function deleteUserApiKey(userId) {
  const id = userDocumentId(userId);
  if (useAzureStorage()) {
    try {
      await getCosmosContainer().item(id, id).delete();
    } catch (error) {
      if (error?.code !== 404) {
        throw error;
      }
    }
  } else {
    await updateLocalSettings((database) => {
      delete database.records[id];
    });
  }
}

export function normalizeApiKey(apiKey) {
  const normalized = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!normalized) {
    throw new UserSettingsError("OpenAI API key is required.", 400);
  }
  if (normalized.length > 512) {
    throw new UserSettingsError("OpenAI API key is too long.", 400);
  }
  if (!normalized.startsWith("sk-")) {
    throw new UserSettingsError("OpenAI API key must start with sk-.", 400);
  }
  return normalized;
}

export function encryptApiKey(apiKey, userId, key = encryptionKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(userId, "utf8"));
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptApiKey(value, userId, key = encryptionKey()) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Stored OpenAI API key has an unsupported format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(userId, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export class UserSettingsError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

async function readUserSettings(userId) {
  const id = userDocumentId(userId);
  if (useAzureStorage()) {
    try {
      const { resource } = await getCosmosContainer().item(id, id).read();
      return resource || null;
    } catch (error) {
      if (error?.code === 404) {
        return null;
      }
      throw error;
    }
  }
  const database = await readLocalDatabase();
  return database.records[id] || null;
}

function getCosmosContainer() {
  const endpoint = requiredEnv("AZURE_COSMOS_ENDPOINT");
  const key = requiredEnv("AZURE_COSMOS_KEY");
  const database = requiredEnv("AZURE_COSMOS_DATABASE");
  return new CosmosClient({ endpoint, key }).database(database).container(userSettingsContainer);
}

async function readLocalDatabase() {
  try {
    const value = JSON.parse(await readFile(localUserSettingsPath, "utf8"));
    return value && typeof value.records === "object" ? value : { records: {} };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { records: {} };
    }
    throw error;
  }
}

async function updateLocalSettings(mutate) {
  localWriteQueue = localWriteQueue.then(async () => {
    const database = await readLocalDatabase();
    mutate(database);
    await mkdir(path.dirname(localUserSettingsPath), { recursive: true });
    const temporary = `${localUserSettingsPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(database, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, localUserSettingsPath);
  });
  return localWriteQueue;
}

function encryptionKey() {
  const configured = process.env.ATG_USER_SETTINGS_ENCRYPTION_KEY;
  if (configured) {
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length !== 32) {
      throw new UserSettingsError(
        "ATG_USER_SETTINGS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.",
        503
      );
    }
    return decoded;
  }
  if (process.env.NODE_ENV === "production") {
    throw new UserSettingsError("User API-key encryption is not configured.", 503);
  }
  return createHash("sha256").update("atg-local-development-user-settings-key").digest();
}

function userDocumentId(userId) {
  return createHash("sha256").update(userId).digest("hex");
}

function useAzureStorage() {
  return (process.env.ATG_STORAGE_BACKEND || "local").toLowerCase() === "azure";
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new UserSettingsError(`${name} is required for Azure user settings.`, 503);
  }
  return value;
}
