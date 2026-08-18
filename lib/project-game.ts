import { getProjectStore } from "./project-store";
import type { ProjectRecord } from "./project-types";

export { GAME_CONFIG_FILE, GAME_DIR, GAME_INSTRUCTIONS_FILE } from "./project-store";

export async function ensureProjectGameFiles(_project: ProjectRecord) {
  return;
}

export async function readGameConfig(project: ProjectRecord) {
  return getProjectStore().readGameConfig(project);
}

export async function updateGameConfig(project: ProjectRecord, patch: unknown) {
  return getProjectStore().updateGameConfig(project, patch);
}

export async function readGameInstructions(project: ProjectRecord) {
  return getProjectStore().readGameInstructions(project);
}

export async function updateGameInstructions(project: ProjectRecord, instructions: string) {
  return getProjectStore().updateGameInstructions(project, instructions);
}

export async function readGameAsset(project: ProjectRecord, segments: string[]) {
  return getProjectStore().readGameAsset(project, segments);
}

export async function listUploadedGameAssets(project: ProjectRecord) {
  return getProjectStore().listUploadedGameAssets(project);
}

export async function uploadGameAsset(
  project: ProjectRecord,
  asset: { content: Buffer; contentType: string; filename: string }
) {
  return getProjectStore().uploadGameAsset(project, asset);
}

export async function deleteGameAsset(project: ProjectRecord, assetPath: string) {
  return getProjectStore().deleteGameAsset(project, assetPath);
}

export async function exportGameTextFiles(project: ProjectRecord) {
  return getProjectStore().exportGameTextFiles(project);
}

export async function updateGameTextFiles(project: ProjectRecord, files: { content: string; path: string }[]) {
  return getProjectStore().updateGameTextFiles(project, files);
}

export async function replaceGameTextFilesAtomically(project: ProjectRecord, files: { content: string; path: string }[]) {
  return getProjectStore().replaceGameTextFilesAtomically(project, files);
}
