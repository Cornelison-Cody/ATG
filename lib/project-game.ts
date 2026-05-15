import { getProjectStore } from "./project-store";
import type { ProjectRecord } from "./project-types";

export { GAME_CONFIG_FILE, GAME_DIR } from "./project-store";

export async function ensureProjectGameFiles(_project: ProjectRecord) {
  return;
}

export async function readGameConfig(project: ProjectRecord) {
  return getProjectStore().readGameConfig(project);
}

export async function updateGameConfig(project: ProjectRecord, patch: unknown) {
  return getProjectStore().updateGameConfig(project, patch);
}

export async function readGameAsset(project: ProjectRecord, segments: string[]) {
  return getProjectStore().readGameAsset(project, segments);
}
