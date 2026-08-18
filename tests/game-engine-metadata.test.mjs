import assert from "node:assert/strict";
import test from "node:test";
import { GameEngineMetadataError, normalizeGameEngineMetadata } from "../lib/game-engine-metadata.mjs";
import { parseGameConfig } from "../lib/game-config.mjs";

test("missing engine metadata defaults a game to the legacy runtime", () => {
  assert.deepEqual(normalizeGameEngineMetadata(undefined), {
    formatVersion: 1,
    migrationStatus: "legacy",
    runtimeVersion: null,
    type: "legacy"
  });
});

test("game config storage parsing treats existing games without metadata as legacy", () => {
  const config = parseGameConfig(JSON.stringify({ title: "Existing game" }), "Existing game");

  assert.deepEqual(config.engine, {
    formatVersion: 1,
    migrationStatus: "legacy",
    runtimeVersion: null,
    type: "legacy"
  });
});

test("engine-backed games require explicit runtime and format versions", () => {
  assert.deepEqual(normalizeGameEngineMetadata({
    formatVersion: 1,
    migrationStatus: "upgraded",
    runtimeVersion: "atg-2d-1.3.0",
    type: "pixi"
  }), {
    formatVersion: 1,
    migrationStatus: "upgraded",
    runtimeVersion: "atg-2d-1.3.0",
    type: "pixi"
  });
});

test("malformed or unsupported engine metadata fails safely", () => {
  for (const metadata of [
    null,
    { formatVersion: 1, migrationStatus: "upgraded", runtimeVersion: "atg-2d-1.3.0", type: "three" },
    { formatVersion: 2, migrationStatus: "upgraded", runtimeVersion: "atg-2d-1.3.0", type: "pixi" },
    { formatVersion: 1, migrationStatus: "legacy", runtimeVersion: "atg-2d-1.3.0", type: "pixi" },
    { formatVersion: 1, migrationStatus: "upgraded", runtimeVersion: "8.19.0", type: "pixi" }
  ]) {
    assert.throws(() => normalizeGameEngineMetadata(metadata), GameEngineMetadataError);
  }
});
