import { getAtgEngineBundle } from "./atg-engine-bundles.mjs";
import { exportGameTextFiles, readGameConfig, replaceGameTextFilesAtomically } from "./project-game";
import { listCompatibleRuntimeUpgrades, acceptRuntimeUpgrade, cancelRuntimeUpgrade } from "./runtime-upgrades.mjs";
import { createOrGetRuntimeUpgrade, getRuntimeUpgrade, listProjectRuntimeUpgrades, markRuntimeUpgrade, queueRuntimeUpgradeValidation, RuntimeUpgradeStoreError, saveRuntimeUpgradeValidation } from "./runtime-upgrade-store.mjs";
import { createBackgroundJob } from "./background-job-store.mjs";

export async function listRuntimeUpgradeOptions(project) {
  const config = await readGameConfig(project);
  if (config.engine?.type !== "pixi") return [];
  return listCompatibleRuntimeUpgrades(config.engine.runtimeVersion, { compatibility: (runtime) => getAtgEngineBundle(runtime, "atg-tv-runtime.mjs") && getAtgEngineBundle(runtime, "pixi.min.mjs") ? { compatible: true, warnings: [] } : { compatible: false, blockingErrors: ["The registered runtime bundle is incomplete."] } });
}
export async function listRuntimeUpgradesForProject(project) { return { options: await listRuntimeUpgradeOptions(project), upgrades: await listProjectRuntimeUpgrades(project.id) }; }
export async function startRuntimeUpgrade(project, runtimeVersion) {
  const config = await readGameConfig(project);
  const option = (await listRuntimeUpgradeOptions(project)).find((item) => item.runtimeVersion === runtimeVersion);
  if (!option) throw new RuntimeUpgradeStoreError("That runtime is not a registered compatible upgrade.", 409);
  return createOrGetRuntimeUpgrade({ projectId: project.id, currentMetadata: config.engine, candidate: option, currentRevision: project.updatedAt });
}
export async function getRuntimeUpgradeForProject(projectId, id) { const record = await getRuntimeUpgrade(id); if (!record || record.projectId !== projectId) throw new RuntimeUpgradeStoreError("Runtime upgrade was not found.", 404); return record; }
export async function queueStoredRuntimeUpgradeValidation(project, id) {
  const record = await getRuntimeUpgradeForProject(project.id, id);
  if (record.status !== "preview") throw new RuntimeUpgradeStoreError(`Runtime upgrade is already ${record.status}.`, 409);
  const job = await createBackgroundJob({ id: `runtime-validation:${id}:${Date.now()}`, projectId: project.id, kind: "runtime-validation", payload: { upgradeId: id } });
  await queueRuntimeUpgradeValidation(id, job.id);
  void dispatchLocalBackgroundJobs();
  return { validationJobId: job.id };
}
async function dispatchLocalBackgroundJobs() {
  if ((process.env.ATG_STORAGE_BACKEND || "local").toLowerCase() === "azure") return;
  const worker = await import("./background-worker.mjs");
  await import("./background-worker-handlers.mjs");
  await worker.dispatchBackgroundJobs({ once: true });
}
export async function validateStoredRuntimeUpgrade(project, id) {
  const record = await getRuntimeUpgradeForProject(project.id, id);
  if (record.status !== "preview") throw new RuntimeUpgradeStoreError(`Runtime upgrade is already ${record.status}.`, 409);
  const current = await readGameConfig(project);
  const blockingErrors = [];
  const warnings = [];
  const checks = [];
  const check = (code, passed, message, warning = false) => {
    checks.push({ code, passed, message });
    if (!passed) (warning ? warnings : blockingErrors).push(message);
  };

  check("source-revision", project.updatedAt === record.currentRevision, "The published game changed while this preview was open.");
  check("source-runtime", current.engine?.runtimeVersion === record.currentMetadata.runtimeVersion, "The project runtime changed while this preview was open.");
  check("runtime-bundle", Boolean(getAtgEngineBundle(record.candidate.runtimeVersion, "atg-tv-runtime.mjs")), "The candidate ATG runtime bundle is unavailable.");
  check("pixi-bundle", Boolean(getAtgEngineBundle(record.candidate.runtimeVersion, "pixi.min.mjs")), "The candidate Pixi bundle is unavailable.");
  const paths = new Set((await exportGameTextFiles(project)).map((file) => file.path));
  check("tv-entry", paths.has("tv.html"), "The project does not contain the TV entry point required for a runtime preview.");
  check("game-entry", paths.has("game.js"), "The project does not contain the game entry module required for a runtime preview.");
  check("browser-smoke", false, "Run the isolated candidate preview in a supported browser before accepting this runtime.", true);
  return saveRuntimeUpgradeValidation(id, { runtimeVersion: record.candidate.runtimeVersion, currentRevision: record.currentRevision, blockingErrors, warnings, checks, validatedAt: new Date().toISOString() });
}
export async function acceptStoredRuntimeUpgrade(project, id, acknowledgeWarnings) {
  const record = await getRuntimeUpgradeForProject(project.id, id);
  if (record.status !== "preview") throw new RuntimeUpgradeStoreError(`Runtime upgrade is already ${record.status}.`, 409);
  const current = await readGameConfig(project);
  if (current.engine.runtimeVersion !== record.currentMetadata.runtimeVersion) throw new RuntimeUpgradeStoreError("The project runtime changed while this preview was open.", 409);
  if (project.updatedAt !== record.currentRevision) throw new RuntimeUpgradeStoreError("The published game changed while this preview was open. Run validation again.", 409);
  const nextEngine = acceptRuntimeUpgrade(record, { acknowledgeWarnings, revision: "pending" });
  const files = await exportGameTextFiles(project);
  const configFile = files.find((file) => file.path === "config.json");
  if (!configFile) throw new RuntimeUpgradeStoreError("The published game config is missing.", 409);
  const parsed = JSON.parse(configFile.content);
  configFile.content = `${JSON.stringify({ ...parsed, engine: nextEngine }, null, 2)}\n`;
  await replaceGameTextFilesAtomically(project, files);
  return markRuntimeUpgrade(id, "accepted", "Runtime upgrade accepted and pinned to the project.");
}
export async function cancelStoredRuntimeUpgrade(projectId, id) { await getRuntimeUpgradeForProject(projectId, id); return markRuntimeUpgrade(id, "cancelled", "Runtime upgrade cancelled; the pinned runtime is unchanged."); }
export { RuntimeUpgradeStoreError };
