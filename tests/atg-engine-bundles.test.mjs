import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  getAtgEngineBundle,
  getAtgEngineBundleUrl,
  getAtgEngineCompatibilityError,
  listAtgEngineRuntimes
} from "../lib/atg-engine-bundles.mjs";

test("pinned ATG engine runtimes coexist at distinct same-origin URLs", () => {
  const runtimes = listAtgEngineRuntimes();
  assert.deepEqual(runtimes, ["atg-2d-1.0.0", "atg-2d-1.0.1", "atg-2d-1.1.0", "atg-2d-1.2.0"]);
  assert.equal(getAtgEngineBundleUrl(runtimes[0]), "/api/engine/atg-2d-1.0.0/pixi.min.mjs");
  assert.equal(getAtgEngineBundleUrl(runtimes[1]), "/api/engine/atg-2d-1.0.1/pixi.min.mjs");

  const first = getAtgEngineBundle(runtimes[0], "pixi.min.mjs");
  const second = getAtgEngineBundle(runtimes[1], "pixi.min.mjs");
  assert.equal(first.packageVersion, "8.19.0");
  assert.equal(second.packageVersion, "8.19.0");
  assert.notEqual(first.runtimeVersion, second.runtimeVersion);
  assert.equal(getAtgEngineBundle("atg-2d-1.1.0", "atg-engine-bridge.mjs").packageVersion, "1.1.0");
  assert.equal(getAtgEngineBundle("atg-2d-1.2.0", "atg-gameplay.mjs").packageVersion, "1.2.0");
  assert.equal(getAtgEngineBundle("atg-2d-1.2.0", "tween.esm.mjs").packageVersion, "25.0.0");
});

test("engine bundle manifest records provenance, integrity, and license", () => {
  const bundle = getAtgEngineBundle("atg-2d-1.0.0", "pixi.min.mjs");

  assert.deepEqual(bundle, {
    contentType: "application/javascript; charset=utf-8",
    file: "engine-bundles/pixi-8.19.0/pixi.min.mjs",
    integrity: "sha384-xfbAeTbJR9wkgBgr3TUzVjX99MxVMJNZQ8gkusM6vzhyeHmjWlx75GwwgaENHGAh",
    license: "engine-bundles/pixi-8.19.0/LICENSE",
    packageName: "pixi.js",
    packageVersion: "8.19.0",
    runtimeVersion: "atg-2d-1.0.0"
  });
});

test("vendored Pixi module matches its integrity record and has no public CDN fallback", async () => {
  const bundle = getAtgEngineBundle("atg-2d-1.0.0", "pixi.min.mjs");
  const source = await readFile(new URL("../engine-bundles/pixi-8.19.0/pixi.min.mjs", import.meta.url));
  const integrity = `sha384-${createHash("sha384").update(source).digest("base64")}`;

  assert.equal(integrity, bundle.integrity);
  assert.doesNotMatch(source.toString("utf8"), /cdn\.jsdelivr\.net/);
  assert.match(source.toString("utf8"), /\/api\/engine\/pixi-8\.19\.0\/basis_transcoder\.js/);
});

test("ATG TV runtime uses a capped WebGL-first logical stage", async () => {
  const bundle = getAtgEngineBundle("atg-2d-1.1.0", "atg-tv-runtime.mjs");
  const source = await readFile(new URL("../engine-bundles/atg-tv-runtime-1.1.0/atg-tv-runtime.mjs", import.meta.url));
  const integrity = `sha384-${createHash("sha384").update(source).digest("base64")}`;
  const text = source.toString("utf8");

  assert.equal(bundle.integrity, integrity);
  assert.match(text, /const LOGICAL_WIDTH = 1920/);
  assert.match(text, /const LOGICAL_HEIGHT = 1080/);
  assert.match(text, /const MAX_FPS = 30/);
  assert.match(text, /preference: "webgl"/);
  assert.match(text, /app\.ticker\.maxFPS = MAX_FPS/);
  assert.match(text, /new ResizeObserver/);
  assert.match(text, /app\.destroy\(\{ children: true, removeView: true, texture: true, textureSource: true \}\)/);
  assert.match(text, /createAtgEngineBridge/);
  assert.match(text, /target\.bridge\?\.destroy\(\)/);
});

test("ATG gameplay runtime keeps its Tween.js dependency and lifecycle helpers immutable", async () => {
  const runtime = getAtgEngineBundle("atg-2d-1.2.0", "atg-tv-runtime.mjs");
  const gameplay = getAtgEngineBundle("atg-2d-1.2.0", "atg-gameplay.mjs");
  const tween = getAtgEngineBundle("atg-2d-1.2.0", "tween.esm.mjs");
  const [runtimeSource, gameplaySource, tweenSource] = await Promise.all([
    readFile(new URL("../engine-bundles/atg-tv-runtime-1.2.0/atg-tv-runtime.mjs", import.meta.url)),
    readFile(new URL("../engine-bundles/atg-tv-runtime-1.2.0/atg-gameplay.mjs", import.meta.url)),
    readFile(new URL("../engine-bundles/atg-tv-runtime-1.2.0/tween.esm.mjs", import.meta.url))
  ]);

  assert.equal(`sha384-${createHash("sha384").update(runtimeSource).digest("base64")}`, runtime.integrity);
  assert.equal(`sha384-${createHash("sha384").update(gameplaySource).digest("base64")}`, gameplay.integrity);
  assert.equal(`sha384-${createHash("sha384").update(tweenSource).digest("base64")}`, tween.integrity);
  assert.match(runtimeSource.toString("utf8"), /createAtgGameplay/);
  assert.match(gameplaySource.toString("utf8"), /transitionTo/);
  assert.match(gameplaySource.toString("utf8"), /createParticlePool/);
});

test("optional Pixi transcoders stay on the same origin", () => {
  const basisTranscoder = getAtgEngineBundle("pixi-8.19.0", "basis_transcoder.js");
  const ktxTranscoder = getAtgEngineBundle("pixi-8.19.0", "libktx.wasm");

  assert.equal(basisTranscoder.file, "engine-bundles/pixi-8.19.0/transcoders/basis_transcoder.js");
  assert.equal(basisTranscoder.integrity, "sha384-TTbmvVK3HPhR/ySpVFnZBIfGbEVxUxgO7FAAFRKCjooBUVMU74kJayDI5jqHygpr");
  assert.equal(ktxTranscoder.contentType, "application/wasm");
  assert.equal(getAtgEngineBundleUrl("pixi-8.19.0", "basis_transcoder.js"), "/api/engine/pixi-8.19.0/basis_transcoder.js");
});

test("unknown engine versions receive a controlled compatibility error", () => {
  assert.equal(getAtgEngineBundle("atg-2d-9.0.0", "pixi.min.mjs"), null);
  assert.match(getAtgEngineCompatibilityError("atg-2d-9.0.0"), /runtime .* unavailable/);
});
