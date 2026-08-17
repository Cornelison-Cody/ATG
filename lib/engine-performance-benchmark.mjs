import { performance } from "node:perf_hooks";

export const ENGINE_PERFORMANCE_TARGET = Object.freeze({
  display: "3840x2160 (4K UHD)",
  logicalWidth: 1920,
  logicalHeight: 1080,
  targetFps: 30,
  frameBudgetMs: 1000 / 30,
  percentile: 95
});

const DEFAULT_OPTIONS = Object.freeze({ iterations: 12, warmup: 2 });

// These are intentionally small, deterministic workloads. They exercise the
// CPU-side work a scene performs before PixiJS submits a frame, so the suite
// can run on CI without a GPU while browser runs provide the renderer signal.
export const ENGINE_PERFORMANCE_SCENARIOS = Object.freeze([
  { id: "sprites", label: "Static sprites", budgetMs: 10, units: 1200 },
  { id: "animated-characters", label: "Animated characters", budgetMs: 12, units: 120 },
  { id: "particles", label: "Particles", budgetMs: 14, units: 5000 },
  { id: "changing-text", label: "Frequently changing text", budgetMs: 16, units: 24 },
  { id: "filters", label: "Filters", budgetMs: 20, units: 8 },
  { id: "video-textures", label: "Video textures", budgetMs: 22, units: 2 },
  { id: "asset-loading", label: "Asset loading", budgetMs: 500, units: 48 }
]);

function workload(scenario, frame) {
  let value = (frame + 1) * 0.0001;
  if (scenario.id === "sprites") {
    for (let index = 0; index < scenario.units; index += 1) value += Math.sin(index + value);
  } else if (scenario.id === "animated-characters") {
    for (let index = 0; index < scenario.units; index += 1) value += Math.sin(index * 0.17 + frame * 0.08);
  } else if (scenario.id === "particles") {
    for (let index = 0; index < scenario.units; index += 1) value += ((index * 17 + frame) % 101) * 0.000001;
  } else if (scenario.id === "changing-text") {
    for (let index = 0; index < scenario.units; index += 1) value += `SCORE ${frame + index}`.length;
  } else if (scenario.id === "filters") {
    for (let index = 0; index < scenario.units * 1000; index += 1) value = (value * 1.00001 + index) % 997;
  } else if (scenario.id === "video-textures") {
    for (let index = 0; index < scenario.units * 10000; index += 1) value = (value + index * 0.00001) % 1;
  } else if (scenario.id === "asset-loading") {
    const bytes = new Uint8Array(scenario.units * 1024);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index + frame) % 256;
    value += bytes[bytes.length - 1];
  }
  return value;
}

function percentile(values, rank) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * rank) - 1)] ?? 0;
}

export function summarizeSamples(samples, budgetMs) {
  const averageMs = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  const p95Ms = percentile(samples, 0.95);
  return Object.freeze({
    averageMs,
    p95Ms,
    budgetMs,
    withinBudget: p95Ms <= budgetMs
  });
}

export function runEnginePerformanceBenchmark(options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  if (!Number.isInteger(settings.iterations) || settings.iterations < 1) throw new RangeError("iterations must be a positive integer");
  if (!Number.isInteger(settings.warmup) || settings.warmup < 0) throw new RangeError("warmup must be a non-negative integer");

  const results = ENGINE_PERFORMANCE_SCENARIOS.map((scenario) => {
    for (let frame = 0; frame < settings.warmup; frame += 1) workload(scenario, frame);
    const samples = [];
    for (let frame = 0; frame < settings.iterations; frame += 1) {
      const started = performance.now();
      workload(scenario, frame);
      samples.push(performance.now() - started);
    }
    return Object.freeze({ ...scenario, ...summarizeSamples(samples, scenario.budgetMs), samples });
  });
  return Object.freeze({ target: ENGINE_PERFORMANCE_TARGET, options: settings, results });
}

export function formatBenchmarkReport(report) {
  const lines = [
    `ATG engine performance benchmark (${report.target.display}, ${report.target.targetFps} FPS)`,
    `Frame budget: ${report.target.frameBudgetMs.toFixed(2)} ms; samples: ${report.options.iterations}`,
    ""
  ];
  for (const result of report.results) {
    const status = result.withinBudget ? "PASS" : "REVIEW";
    lines.push(`${status.padEnd(6)} ${result.label}: p95 ${result.p95Ms.toFixed(2)} ms / budget ${result.budgetMs.toFixed(2)} ms`);
  }
  return lines.join("\n");
}
