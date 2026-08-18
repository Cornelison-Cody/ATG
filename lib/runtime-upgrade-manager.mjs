import { getAtgEngineBundle } from "./atg-engine-bundles.mjs";
import { readGameConfig, updateGameConfig } from "./project-game";
import { listCompatibleRuntimeUpgrades, acceptRuntimeUpgrade, cancelRuntimeUpgrade } from "./runtime-upgrades.mjs";
import { createOrGetRuntimeUpgrade, getRuntimeUpgrade, listProjectRuntimeUpgrades, markRuntimeUpgrade, RuntimeUpgradeStoreError } from "./runtime-upgrade-store.mjs";

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
export async function acceptStoredRuntimeUpgrade(project, id, acknowledgeWarnings) {
  const record = await getRuntimeUpgradeForProject(project.id, id);
  if (record.status !== "preview") throw new RuntimeUpgradeStoreError(`Runtime upgrade is already ${record.status}.`, 409);
  const current = await readGameConfig(project);
  if (current.engine.runtimeVersion !== record.currentMetadata.runtimeVersion) throw new RuntimeUpgradeStoreError("The project runtime changed while this preview was open.", 409);
  const nextEngine = acceptRuntimeUpgrade(record, { acknowledgeWarnings, revision: "pending" });
  await updateGameConfig(project, { engine: nextEngine });
  return markRuntimeUpgrade(id, "accepted", "Runtime upgrade accepted and pinned to the project.");
}
export async function cancelStoredRuntimeUpgrade(projectId, id) { await getRuntimeUpgradeForProject(projectId, id); return markRuntimeUpgrade(id, "cancelled", "Runtime upgrade cancelled; the pinned runtime is unchanged."); }
export { RuntimeUpgradeStoreError };
