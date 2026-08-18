import test from "node:test";
import assert from "node:assert/strict";
import { buildEngineRolloutPlan, createRolloutTelemetryEvent, evaluateEngineLaunchCriteria, getEngineRolloutControls } from "../lib/engine-rollout-controls.mjs";

test("operators can disable creation or conversion without disabling existing engine games", () => {
  const controls = getEngineRolloutControls({ ATG_ENGINE_NEW_GAMES_ENABLED: "false", ATG_ENGINE_CONVERSIONS_ENABLED: "0" });
  assert.equal(controls.newGamesEnabled, false);
  assert.equal(controls.conversionsEnabled, false);
  assert.equal(controls.existingEngineGamesRemainAvailable, true);
});

test("launch readiness requires performance, migration, prompt, and compatibility checks", () => {
  const ready = evaluateEngineLaunchCriteria({ performance: { passed: true }, migration: { passed: true }, prompts: { passed: true }, compatibility: { passed: true } });
  assert.equal(ready.ready, true);
  assert.equal(evaluateEngineLaunchCriteria({ performance: { passed: false }, migration: { passed: true }, prompts: { passed: true }, compatibility: { passed: true } }).ready, false);
  assert.deepEqual(buildEngineRolloutPlan().slice(0, 4), ["validate-performance", "validate-migrations", "validate-prompts", "validate-compatibility"]);
});

test("rollout telemetry excludes gameplay telemetry and preserves only workflow details", () => {
  const event = createRolloutTelemetryEvent("conversion-completed", { projectId: "p", durationMs: 120, score: 99, prompt: "secret" });
  assert.deepEqual(event.details, { projectId: "p", durationMs: 120 });
  assert.throws(() => createRolloutTelemetryEvent("gameplay-score", { score: 1 }), /Gameplay telemetry/);
});
