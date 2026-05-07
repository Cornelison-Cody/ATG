import path from "path";

export const APP_ROOT = process.env.ATG_APP_ROOT || process.cwd();
export const DATA_ROOT = process.env.ATG_DATA_ROOT || APP_ROOT;
export const ATG_ROOT = process.env.ATG_STATE_ROOT || path.join(DATA_ROOT, ".atg");
export const PROJECTS_ROOT = process.env.ATG_PROJECTS_ROOT || path.join(DATA_ROOT, "projects");
export const TRASH_ROOT = path.join(ATG_ROOT, "trash");

export function getPublicBaseUrl() {
  return trimTrailingSlash(process.env.APP_BASE_URL || "");
}

export function getAiWorkerUrl() {
  return trimTrailingSlash(process.env.AI_WORKER_URL || "");
}

export function canUseLocalCodex() {
  return process.env.ENABLE_LOCAL_CODEX === "true" || process.env.NODE_ENV !== "production";
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, "");
}
