import path from "path";

export const APP_ROOT = process.env.ATG_APP_ROOT || process.cwd();
export const DATA_ROOT = process.env.ATG_DATA_ROOT || APP_ROOT;
export const ATG_ROOT = process.env.ATG_STATE_ROOT || path.join(DATA_ROOT, ".atg");
export const PROJECTS_ROOT = process.env.ATG_PROJECTS_ROOT || path.join(DATA_ROOT, "projects");
export const TRASH_ROOT = path.join(ATG_ROOT, "trash");
export const STORAGE_BACKEND = process.env.ATG_STORAGE_BACKEND || "local";
export const AZURE_DEFAULT_LOCATION = process.env.AZURE_LOCATION || "westus";

export function getPublicBaseUrl() {
  return trimTrailingSlash(process.env.APP_BASE_URL || "");
}

export function canUseCodexSdkPrototype() {
  return process.env.ENABLE_CODEX_SDK_PROTOTYPE === "true" || process.env.NODE_ENV !== "production";
}

// Keep the fallback internal: operators can disable engine-backed creation
// during rollout without exposing a format choice to creators.
export function isEngineBackedNewGamesEnabled() {
  const value = process.env.ATG_ENGINE_NEW_GAMES_ENABLED;
  return value !== "false" && value !== "0";
}

export function getCodexSdkWorkspaceRoot() {
  return process.env.ATG_CODEX_SDK_WORKSPACE_ROOT || "";
}

export function getCodexSdkTimeoutMs() {
  const configured = Number(process.env.ATG_CODEX_SDK_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000 ? configured : 300_000;
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function useAzureStorageBackend() {
  return STORAGE_BACKEND.toLowerCase() === "azure";
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
}
