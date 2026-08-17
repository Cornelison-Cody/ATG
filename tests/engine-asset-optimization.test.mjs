import test from "node:test";
import assert from "node:assert/strict";
import { createAssetOptimizationPlan, runAssetOptimization } from "../lib/engine-asset-optimization.mjs";

const assets = [
  { path: "assets/hero.png", size: 1200, contentHash: "hero-hash" },
  { path: "assets/theme.m4a", size: 5000, contentHash: "audio-hash" },
  { path: "assets/intro.webm", size: 7000, contentHash: "video-hash" }
];

test("optimization plans are deterministic, versioned, and cacheable", () => {
  const first = createAssetOptimizationPlan(assets);
  const second = createAssetOptimizationPlan([...assets].reverse());
  assert.equal(first.cacheKey, second.cacheKey);
  assert.deepEqual(first.outputs, second.outputs);
  assert.equal(first.manifest.version, 1);
  assert.ok(first.outputs.some((output) => output.variant === "2x"));
});

test("plans include progress-ready preload entries and budget warnings", () => {
  const plan = createAssetOptimizationPlan([{ path: "assets/large.png", size: 11 * 1024 * 1024 }]);
  assert.equal(plan.manifest.total, plan.outputs.length);
  assert.equal(plan.manifest.entries[0].sourcePath, "assets/large.png");
  assert.equal(plan.warnings.length, 1);
});

test("failed optimization does not mutate source assets and retries deterministically", async () => {
  const plan = createAssetOptimizationPlan(assets);
  const sourcePaths = plan.sourceAssets.map((asset) => asset.path);
  await assert.rejects(() => runAssetOptimization(plan, async (output) => {
    if (output.kind === "video") throw new Error("encoder unavailable");
    return output.path;
  }), /encoder unavailable/);
  assert.deepEqual(plan.sourceAssets.map((asset) => asset.path), sourcePaths);
  const retry = await runAssetOptimization(plan, async (output) => output.path);
  assert.equal(retry.outputs.length, plan.outputs.length);
});
