import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/project-store.ts", import.meta.url), "utf8");
const envSource = await readFile(new URL("../lib/env.ts", import.meta.url), "utf8");

test("new games use an explicit pinned Pixi runtime by default", () => {
  assert.match(source, /DEFAULT_NEW_GAME_RUNTIME_VERSION = "atg-2d-1\.3\.0"/);
  assert.match(source, /migrationStatus: "upgraded"/);
  assert.match(source, /runtimeVersion: DEFAULT_NEW_GAME_RUNTIME_VERSION/);
  assert.match(source, /type: "pixi"/);
  assert.match(source, /isEngineBackedNewGamesEnabled\(\) \? ENGINE_TEMPLATE_FILES : TEMPLATE_FILES/);
});

test("engine starter keeps TV rendering in Pixi and phone controls in the DOM", () => {
  assert.match(source, /new engine\.PIXI\.Text/);
  assert.match(source, /engine\.gameplay\.createScene\(\{ id: "starter" \}\)/);
  assert.match(source, /document\.createElement\("button"\)/);
  assert.match(source, /window\.ATG\.sendAction\("starter:ready"\)/);
  assert.match(source, /aria-live="polite"/);
});

test("engine-backed creation has an operator-only legacy fallback", () => {
  assert.match(envSource, /ATG_ENGINE_NEW_GAMES_ENABLED/);
  assert.match(envSource, /value !== "false" && value !== "0"/);
});
