const RESERVED_GAME_STATE_KEYS = new Set([
  "actions",
  "buzzes",
  "config",
  "players",
  "projectId",
  "prompt"
]);

const MAX_GAME_STATE_PATCH_BYTES = 100_000;

export function normalizeGameStatePatch(value) {
  if (!isPlainObject(value)) {
    throw new Error("Game state must be an object.");
  }

  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("Game state must be JSON serializable.");
  }

  if (Buffer.byteLength(serialized, "utf8") > MAX_GAME_STATE_PATCH_BYTES) {
    throw new Error("Game state exceeds the size limit.");
  }

  const patch = JSON.parse(serialized);
  for (const key of Object.keys(patch)) {
    if (RESERVED_GAME_STATE_KEYS.has(key)) {
      delete patch[key];
    }
  }

  return patch;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
