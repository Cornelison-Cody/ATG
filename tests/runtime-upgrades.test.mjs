import test from "node:test";
import assert from "node:assert/strict";
import { acceptRuntimeUpgrade, cancelRuntimeUpgrade, createRuntimeUpgrade, listCompatibleRuntimeUpgrades } from "../lib/runtime-upgrades.mjs";

const metadata = { formatVersion: 1, migrationStatus: "upgraded", runtimeVersion: "atg-2d-1.1.0", type: "pixi" };

test("runtime upgrades list only newer pinned runtimes and never mutate current metadata", () => {
  const upgrades = listCompatibleRuntimeUpgrades(metadata.runtimeVersion, { runtimes: ["atg-2d-1.0.0", "atg-2d-1.2.0", "atg-2d-1.3.0"] });
  assert.deepEqual(upgrades.map((item) => item.runtimeVersion), ["atg-2d-1.2.0", "atg-2d-1.3.0"]);
  assert.equal(metadata.runtimeVersion, "atg-2d-1.1.0");
});

test("incompatible candidates are blocked while warnings require acknowledgment", () => {
  const listed = listCompatibleRuntimeUpgrades("atg-2d-1.1.0", { runtimes: ["atg-2d-1.2.0", "atg-2d-1.3.0"], compatibility: (runtime) => runtime.endsWith("1.2.0") ? { compatible: false, blockingErrors: ["Audio API missing"] } : { warnings: ["Verify renderer"] } });
  assert.equal(listed[0].compatible, false);
  const blocked = createRuntimeUpgrade({ projectId: "p", currentMetadata: metadata, candidate: listed[0], currentRevision: "r1" });
  assert.throws(() => acceptRuntimeUpgrade(blocked, { revision: "r2" }), /Incompatible/);
  const warning = createRuntimeUpgrade({ projectId: "p", currentMetadata: metadata, candidate: listed[1], currentRevision: "r1" });
  assert.throws(() => acceptRuntimeUpgrade(warning, { revision: "r2" }), /Acknowledge/);
  const accepted = acceptRuntimeUpgrade(warning, { acknowledgeWarnings: true, revision: "r2" });
  assert.equal(accepted.runtimeVersion, "atg-2d-1.3.0");
  assert.equal(accepted.previousRevision, "r1");
});

test("cancel keeps the pinned metadata and preview is isolated until acceptance", () => {
  const upgrade = createRuntimeUpgrade({ projectId: "p", currentMetadata: metadata, candidate: { runtimeVersion: "atg-2d-1.3.0", warnings: [], blockingErrors: [] }, currentRevision: "r1" });
  assert.equal(upgrade.currentMetadata.runtimeVersion, "atg-2d-1.1.0");
  assert.deepEqual(cancelRuntimeUpgrade(upgrade), metadata);
  assert.equal(upgrade.status, "cancelled");
});
