export function getUpgradeGameAvailability({ engine, accessRole, isRunning = false } = {}) {
  if (!accessRole) return { available: false, reason: "You do not have permission to edit this game." };
  if (engine?.type !== "legacy") return { available: false, reason: "This game already uses the ATG engine." };
  if (isRunning) return { available: false, reason: "Finish the current project edit before upgrading the game." };
  return { available: true, reason: "" };
}

export function buildEngineConversionPrompt(runtimeVersion = "atg-2d-1.3.0") {
  return `Convert this legacy game to the ATG engine in one best-effort pass. Start from the deterministic engine-backed game contract and pinned runtime ${runtimeVersion}. Preserve the game's rules, scoring, instructions, assets, and cross-surface state/actions. TV rendering must use window.ATGEngine after ready with engine.PIXI and engine.gameplay; phone controls must remain accessible DOM UI using window.ATG. Keep config.json engine metadata at formatVersion 1, migrationStatus upgraded, runtimeVersion ${runtimeVersion}, type pixi. Add loading and failure recovery, preserve important player feedback, and report warnings and changed files. Do not create binary assets, use public CDNs, or add dependencies. Do not publish or replace the current legacy game until the generated candidate is explicitly accepted.`;
}

export const UPGRADE_GAME_PROMPT = buildEngineConversionPrompt();
