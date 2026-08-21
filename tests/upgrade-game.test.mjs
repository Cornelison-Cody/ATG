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
  assert.match(modal[0], /Level Up Your Game!/);
  assert.match(modal[0], /Make It Awesome!/);
  assert.match(modal[0], /Maybe Later/);
  assert.match(modal[0], /upgradeSpinner/);
  assert.match(modal[0], /upgradeGameStatusMessages/);
  assert.doesNotMatch(modal[0], /styles\.modalBackdrop/);
});

test("upgrade completion validates and accepts automatically", () => {
  const dashboard = fs.readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(dashboard.match(/async function startUpgradeGame[\s\S]*?\n  }/)[0], /setIsUpgradeGameOpen\(false\)/);
  assert.match(dashboard, /await updateConversion\("validate", options\.conversionId\)/);
  assert.match(dashboard, /await updateConversion\("accept", options\.conversionId, true\)/);
});

test("the editor shows engine status and keeps upgrade actions out of chat", () => {
  const dashboard = fs.readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
  const projectChat = dashboard.match(/function ProjectChat[\s\S]*?\n}\n\nfunction ProjectMenu/);

  assert.ok(projectChat, "ProjectChat should be present");
  assert.match(projectChat[0], /ATG Engine/);
  assert.match(projectChat[0], /Classic Game/);
  assert.match(projectChat[0], /Upgrade Game/);
  assert.doesNotMatch(projectChat[0], /Cancel Upgrade|Validate Candidate|Accept Upgrade/);
  assert.doesNotMatch(projectChat[0], /<ProjectMenu[\s\S]*Upgrade Game/);
});
