import assert from "node:assert/strict";
import test from "node:test";
import {
  ENGINE_PERFORMANCE_SCENARIOS,
  ENGINE_PERFORMANCE_TARGET,
  formatBenchmarkReport,
  runEnginePerformanceBenchmark,
  summarizeSamples
} from "../lib/engine-performance-benchmark.mjs";

test("engine performance target documents the 4K and 30 FPS baseline", () => {
  assert.equal(ENGINE_PERFORMANCE_TARGET.display, "3840x2160 (4K UHD)");
  assert.equal(ENGINE_PERFORMANCE_TARGET.logicalWidth, 1920);
  assert.equal(ENGINE_PERFORMANCE_TARGET.logicalHeight, 1080);
  assert.equal(ENGINE_PERFORMANCE_TARGET.targetFps, 30);
  assert.equal(ENGINE_PERFORMANCE_TARGET.frameBudgetMs, 1000 / 30);
});

test("benchmark fixtures cover the required representative workloads", () => {
  assert.deepEqual(ENGINE_PERFORMANCE_SCENARIOS.map(({ id }) => id), [
    "sprites", "animated-characters", "particles", "changing-text", "filters", "video-textures", "asset-loading"
  ]);
  for (const scenario of ENGINE_PERFORMANCE_SCENARIOS) {
    assert.ok(scenario.units > 0);
    assert.ok(scenario.budgetMs > 0);
  }
});

test("sample summaries calculate an actionable p95 budget result", () => {
  assert.deepEqual(summarizeSamples([1, 2, 3, 4], 3), {
    averageMs: 2.5, p95Ms: 4, budgetMs: 3, withinBudget: false
  });
});

test("benchmark report is deterministic in shape and includes every scenario", () => {
  const report = runEnginePerformanceBenchmark({ iterations: 2, warmup: 0 });
  assert.equal(report.results.length, ENGINE_PERFORMANCE_SCENARIOS.length);
  assert.ok(report.results.every((result) => result.samples.length === 2));
  const text = formatBenchmarkReport(report);
  assert.match(text, /4K UHD\), 30 FPS/);
  for (const scenario of ENGINE_PERFORMANCE_SCENARIOS) assert.match(text, new RegExp(scenario.label));
});
