export const DEFAULT_GAME_ENGINE_METADATA = Object.freeze({
  formatVersion: 1,
  migrationStatus: "legacy",
  runtimeVersion: null,
  type: "legacy"
});

const SUPPORTED_ENGINE_TYPES = new Set(["legacy", "pixi"]);
const SUPPORTED_MIGRATION_STATUSES = new Set(["legacy", "upgraded"]);

export class GameEngineMetadataError extends Error {
  constructor(message) {
    super(message);
    this.name = "GameEngineMetadataError";
    this.status = 400;
  }
}

export function normalizeGameEngineMetadata(value) {
  if (value === undefined) return { ...DEFAULT_GAME_ENGINE_METADATA };

  if (!isPlainObject(value)) {
    throw new GameEngineMetadataError("Game engine metadata must be an object.");
  }

  const { formatVersion, migrationStatus, runtimeVersion, type } = value;
  if (typeof type !== "string" || !SUPPORTED_ENGINE_TYPES.has(type)) {
    throw new GameEngineMetadataError("Game engine type must be one of: legacy, pixi.");
  }
  if (!Number.isInteger(formatVersion) || formatVersion !== 1) {
    throw new GameEngineMetadataError("Game engine formatVersion 1 is required.");
  }
  if (typeof migrationStatus !== "string" || !SUPPORTED_MIGRATION_STATUSES.has(migrationStatus)) {
    throw new GameEngineMetadataError("Game engine migrationStatus must be one of: legacy, upgraded.");
  }

  if (type === "legacy") {
    if (runtimeVersion !== null || migrationStatus !== "legacy") {
      throw new GameEngineMetadataError("Legacy games require runtimeVersion null and migrationStatus legacy.");
    }
  } else if (
    typeof runtimeVersion !== "string" ||
    !runtimeVersion.trim() ||
    runtimeVersion.length > 80 ||
    migrationStatus !== "upgraded"
  ) {
    throw new GameEngineMetadataError("Pixi games require a runtimeVersion and migrationStatus upgraded.");
  } else if (!listAtgEngineRuntimes().includes(runtimeVersion.trim())) {
    throw new GameEngineMetadataError(`Unknown ATG engine runtime version: ${runtimeVersion}.`);
  }

  return { formatVersion, migrationStatus, runtimeVersion: type === "pixi" ? runtimeVersion.trim() : null, type };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
import { listAtgEngineRuntimes } from "./atg-engine-bundles.mjs";
