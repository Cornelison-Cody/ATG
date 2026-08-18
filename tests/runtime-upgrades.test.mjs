import test from "node:test";
import assert from "node:assert/strict";
import { acceptRuntimeUpgrade, cancelRuntimeUpgrade, createRuntimeUpgrade, listCompatibleRuntimeUpgrades } from "../lib/runtime-upgrades.mjs";

const metadata = { formatVersion: 1, migrationStatus: "upgraded", runtimeVersion: "atg-2d-1.1.0", type: "pixi" };
const validation = { runtimeVersion: "atg-2d-1.3.0", currentRevision: "r1", blockingErrors: [], warnings: [] };

test("runtime upgrades list only newer pinned runtimes and never mutate current metadata", () => {
  const upgrades = listCompatibleRuntimeUpgrades(metadata.runtimeVersion, { runtimes: ["atg-2d-1.0.0", "atg-2d-1.2.0", "atg-2d-1.3.0"] });
  assert.deepEqual(upgrades.map((item) => item.runtimeVersion), ["atg-2d-1.2.0", "atg-2d-1.3.0"]);
  assert.equal(metadata.runtimeVersion, "atg-2d-1.1.0");
});

test("incompatible candidates are blocked while warnings require acknowledgment", () => {
  const listed = listCompatibleRuntimeUpgrades("atg-2d-1.1.0", { runtimes: ["atg-2d-1.2.0", "atg-2d-1.3.0"], compatibility: (runtime) => runtime.endsWith("1.2.0") ? { compatible: false, blockingErrors: ["Audio API missing"] } : { warnings: ["Verify renderer"] } });
  assert.equal(listed[0].compatible, false);
  const blocked = createRuntimeUpgrade({ projectId: "p", currentMetadata: metadata, candidate: listed[0], currentRevision: "r1" });
  blocked.validation = { ...validation, runtimeVersion: listed[0].runtimeVersion };
  assert.throws(() => acceptRuntimeUpgrade(blocked, { revision: "r2" }), /Incompatible/);
  const warning = createRuntimeUpgrade({ projectId: "p", currentMetadata: metadata, candidate: listed[1], currentRevision: "r1" });
  warning.validation = validation;
  assert.throws(() => acceptRuntimeUpgrade(warning, { revision: "r2" }), /Acknowledge/);
  const accepted = acceptRuntimeUpgrade(warning, { acknowledgeWarnings: true, revision: "r2" });
  assert.equal(accepted.runtimeVersion, "atg-2d-1.3.0");
  assert.equal(accepted.previousRevision, "r1");
});

test("acceptance requires fresh trusted validation for the exact candidate and revision", () => {
  const upgrade = createRuntimeUpgrade({ projectId: "p", currentMetadata: metadata, candidate: { runtimeVersion: "atg-2d-1.3.0", warnings: [], blockingErrors: [] }, currentRevision: "r1" });
  assert.throws(() => acceptRuntimeUpgrade(upgrade, { revision: "r2" }), /Validate/);
  upgrade.validation = { ...validation, currentRevision: "r0" };
  assert.throws(() => acceptRuntimeUpgrade(upgrade, { revision: "r2" }), /stale/);
  upgrade.validation = { ...validation, blockingErrors: ["Candidate runtime did not load."] };
  assert.throws(() => acceptRuntimeUpgrade(upgrade, { revision: "r2" }), /blocking/);
});

test("cancel keeps the pinned metadata and preview is isolated until acceptance", () => {
  const upgrade = createRuntimeUpgrade({ projectId: "p", currentMetadata: metadata, candidate: { runtimeVersion: "atg-2d-1.3.0", warnings: [], blockingErrors: [] }, currentRevision: "r1" });
  assert.equal(upgrade.currentMetadata.runtimeVersion, "atg-2d-1.1.0");
  assert.deepEqual(cancelRuntimeUpgrade(upgrade), metadata);
  assert.equal(upgrade.status, "cancelled");
});
