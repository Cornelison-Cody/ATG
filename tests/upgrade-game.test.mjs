import test from "node:test";
import assert from "node:assert/strict";
import { getUpgradeGameAvailability, UPGRADE_GAME_PROMPT } from "../lib/upgrade-game.mjs";

const legacy = { formatVersion: 1, migrationStatus: "legacy", runtimeVersion: null, type: "legacy" };
const engine = { formatVersion: 1, migrationStatus: "upgraded", runtimeVersion: "atg-2d-1.3.0", type: "pixi" };

test("every editable legacy project exposes Upgrade Game", () => {
  assert.deepEqual(getUpgradeGameAvailability({ engine: legacy, accessRole: "owner" }), { available: true, reason: "" });
  assert.deepEqual(getUpgradeGameAvailability({ engine: legacy, accessRole: "collaborator" }), { available: true, reason: "" });
});

test("engine-backed games and active edits are unavailable", () => {
  assert.equal(getUpgradeGameAvailability({ engine, accessRole: "owner" }).available, false);
  assert.equal(getUpgradeGameAvailability({ engine: legacy, accessRole: "owner", isRunning: true }).available, false);
  assert.equal(getUpgradeGameAvailability({ engine: legacy, accessRole: null }).available, false);
});

test("conversion prompt preserves the no-publish boundary", () => {
  assert.match(UPGRADE_GAME_PROMPT, /phone controls as DOM UI/);
  assert.match(UPGRADE_GAME_PROMPT, /Do not publish or replace/);
});
