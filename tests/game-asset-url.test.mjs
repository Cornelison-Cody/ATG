import assert from "node:assert/strict";
import test from "node:test";
import { buildGameAssetUrl } from "../lib/game-asset-url.mjs";

test("game asset URLs change when the persisted project revision changes", () => {
  const before = buildGameAssetUrl("project-1", "tv", "2026-06-29T10:00:00.000Z");
  const after = buildGameAssetUrl("project-1", "tv", "2026-06-29T10:01:00.000Z");

  assert.notEqual(before, after);
  assert.match(after, /^\/api\/projects\/project-1\/game-assets\/tv\.html\?v=/);
});

test("game asset URLs preserve the selected editing target", () => {
  assert.match(
    buildGameAssetUrl("project-1", "phone", "revision"),
    /\/game-assets\/phone\.html\?v=revision$/
  );
});
