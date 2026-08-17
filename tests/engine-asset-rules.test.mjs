import test from "node:test";
import assert from "node:assert/strict";
import { getEngineAssetRule, isSupportedEngineAsset } from "../lib/engine-asset-rules.mjs";

test("engine asset rules cover metadata, fonts, compressed audio, and video textures", () => {
  assert.equal(getEngineAssetRule("sprites.atlas").kind, "atlas");
  assert.equal(getEngineAssetRule("display.woff2").contentType, "font/woff2");
  assert.equal(getEngineAssetRule("music.flac").kind, "audio");
  assert.equal(getEngineAssetRule("loop.webm").kind, "video");
  assert.equal(isSupportedEngineAsset("legacy.png"), false);
});

test("video and audio limits are bounded by explicit format rules", () => {
  assert.ok(getEngineAssetRule("clip.mp4").maxBytes > getEngineAssetRule("font.ttf").maxBytes);
  assert.ok(getEngineAssetRule("music.m4a").maxBytes <= 20 * 1024 * 1024);
});
