import { listAtgEngineRuntimes } from "./atg-engine-bundles.mjs";

export function listCompatibleRuntimeUpgrades(currentVersion, { runtimes = listAtgEngineRuntimes(), compatibility = () => ({ compatible: true }) } = {}) {
  if (!currentVersion) throw new Error("A pinned runtime version is required.");
  return runtimes.filter((runtime) => compareRuntime(runtime, currentVersion) > 0).map((runtime) => {
    const result = compatibility(runtime, currentVersion) || {};
    return { runtimeVersion: runtime, compatible: result.compatible !== false, warnings: result.warnings || [], blockingErrors: result.blockingErrors || [] };
  });
}

export function createRuntimeUpgrade({ projectId, currentMetadata, candidate, currentRevision } = {}) {
  if (!projectId || currentMetadata?.type !== "pixi" || !candidate?.runtimeVersion) throw new Error("Runtime upgrades require an engine-backed project and candidate.");
  return { projectId, status: "preview", currentMetadata: { ...currentMetadata }, candidate: { ...candidate }, currentRevision, previewRevision: `${currentRevision}:runtime:${candidate.runtimeVersion}` };
}

export function acceptRuntimeUpgrade(upgrade, { acknowledgeWarnings = false, revision } = {}) {
  if (upgrade.status !== "preview") throw new Error(`Runtime upgrade is already ${upgrade.status}.`);
  if (upgrade.candidate.blockingErrors?.length) throw new Error("Incompatible runtime upgrades cannot be accepted.");
  if (upgrade.candidate.warnings?.length && !acknowledgeWarnings) throw new Error("Acknowledge runtime upgrade warnings before acceptance.");
  if (!revision) throw new Error("An accepted runtime revision is required.");
  upgrade.status = "accepted";
  return { ...upgrade.currentMetadata, runtimeVersion: upgrade.candidate.runtimeVersion, migrationStatus: "upgraded", formatVersion: 1, type: "pixi", revision, previousRevision: upgrade.currentRevision };
}

export function cancelRuntimeUpgrade(upgrade) {
  if (upgrade.status === "accepted") throw new Error("Accepted runtime upgrades cannot be cancelled.");
  upgrade.status = "cancelled";
  return { ...upgrade.currentMetadata };
}

function compareRuntime(left, right) {
  const parse = (value) => value.match(/^atg-2d-(\d+)\.(\d+)\.(\d+)$/)?.slice(1).map(Number) || [0, 0, 0];
  const a = parse(left); const b = parse(right);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
