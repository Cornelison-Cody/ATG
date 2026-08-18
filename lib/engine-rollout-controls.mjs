export function getEngineRolloutControls(env = {}) {
  return Object.freeze({
    newGamesEnabled: env.ATG_ENGINE_NEW_GAMES_ENABLED !== "false" && env.ATG_ENGINE_NEW_GAMES_ENABLED !== "0",
    conversionsEnabled: env.ATG_ENGINE_CONVERSIONS_ENABLED !== "false" && env.ATG_ENGINE_CONVERSIONS_ENABLED !== "0",
    existingEngineGamesRemainAvailable: true,
    telemetryScope: "editing-and-conversion-only"
  });
}

export function evaluateEngineLaunchCriteria({ performance, migration, prompts, compatibility } = {}) {
  const checks = [
    ["performance", performance],
    ["migration", migration],
    ["prompts", prompts],
    ["compatibility", compatibility]
  ].map(([name, result]) => ({ name, passed: result?.passed === true, details: result?.details || "" }));
  return { ready: checks.every((check) => check.passed), checks };
}

export function createRolloutTelemetryEvent(event, details = {}) {
  const allowed = new Set(["editor-preview", "conversion-started", "conversion-completed", "conversion-failed", "conversion-cancelled", "runtime-upgrade-preview", "runtime-upgrade-accepted"]);
  if (!allowed.has(event)) throw new Error("Gameplay telemetry is outside the engine rollout scope.");
  const safeDetails = Object.fromEntries(Object.entries(details).filter(([key]) => ["projectId", "runtimeVersion", "durationMs", "warningCount", "errorCode"].includes(key)));
  return { event, scope: "editing-and-conversion", details: safeDetails, at: new Date().toISOString() };
}

export function buildEngineRolloutPlan() {
  return ["validate-performance", "validate-migrations", "validate-prompts", "validate-compatibility", "enable-engine-new-games", "enable-legacy-upgrade-action", "monitor-editor-conversion-outcomes"];
}
