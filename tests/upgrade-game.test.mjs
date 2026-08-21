import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildEngineConversionPrompt, getUpgradeGameAvailability, UPGRADE_GAME_PROMPT } from "../lib/upgrade-game.mjs";

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
  assert.match(buildEngineConversionPrompt("atg-2d-1.3.0"), /window\.ATGEngine/);
  assert.match(UPGRADE_GAME_PROMPT, /migrationStatus upgraded/);
  assert.match(UPGRADE_GAME_PROMPT, /phone controls must remain accessible DOM UI/);
  assert.match(UPGRADE_GAME_PROMPT, /Do not publish or replace/);
});

test("Upgrade Game renders in the fixed modal overlay", () => {
  const dashboard = fs.readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
  const modal = dashboard.match(/function UpgradeGameModal[\s\S]*?\n}\n\nfunction RuntimeUpgradeModal/);

  assert.ok(modal, "UpgradeGameModal should be present");
  assert.match(modal[0], /className=\{styles\.modalOverlay\}/);
  assert.match(modal[0], /aria-modal="true"/);
  assert.match(modal[0], /role="dialog"/);
  assert.doesNotMatch(modal[0], /styles\.modalBackdrop/);
});
