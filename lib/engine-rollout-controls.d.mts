export function getEngineRolloutControls(env?: Record<string, string | undefined>): { newGamesEnabled: boolean; conversionsEnabled: boolean; existingEngineGamesRemainAvailable: true; telemetryScope: string };
export function evaluateEngineLaunchCriteria(input?: Record<string, unknown>): { ready: boolean; checks: { name: string; passed: boolean; details: string }[] };
export function createRolloutTelemetryEvent(event: string, details?: Record<string, unknown>): { event: string; scope: string; details: Record<string, unknown>; at: string };
export function buildEngineRolloutPlan(): string[];
