import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/project-store.ts", import.meta.url), "utf8");
const envSource = await readFile(new URL("../lib/env.ts", import.meta.url), "utf8");

test("local and Azure new-game paths always use the pinned Pixi runtime", () => {
  assert.match(source, /DEFAULT_NEW_GAME_RUNTIME_VERSION = "atg-2d-1\.3\.0"/);
  assert.match(source, /migrationStatus: "upgraded"/);
  assert.match(source, /runtimeVersion: DEFAULT_NEW_GAME_RUNTIME_VERSION/);
  assert.match(source, /type: "pixi"/);
  assert.equal((source.match(/ensureGameFiles\(project, ENGINE_TEMPLATE_FILES\)/g) || []).length, 2);
});

test("engine starter keeps TV rendering in Pixi and phone controls in the DOM", () => {
  assert.match(source, /new engine\.PIXI\.Text/);
  assert.match(source, /engine\.gameplay\.createScene\(\{ id: "starter" \}\)/);
  assert.match(source, /document\.createElement\("button"\)/);
  assert.match(source, /window\.ATG\.sendAction\("starter:ready"\)/);
  assert.match(source, /aria-live="polite"/);
});

test("engine creation has no rollout environment toggle", () => {
  assert.doesNotMatch(source, /isEngineBacked(?:NewGames|Conversions)Enabled|ENGINE_[A-Z_]+ENABLED/);
  assert.doesNotMatch(envSource, /isEngineBacked(?:NewGames|Conversions)Enabled|ENGINE_[A-Z_]+ENABLED/);
});
