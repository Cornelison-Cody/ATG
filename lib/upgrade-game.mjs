export function getUpgradeGameAvailability({ engine, accessRole, isRunning = false } = {}) {
  if (!accessRole) return { available: false, reason: "You do not have permission to edit this game." };
  if (engine?.type !== "legacy") return { available: false, reason: "This game already uses the ATG engine." };
  if (isRunning) return { available: false, reason: "Finish the current project edit before upgrading the game." };
  return { available: true, reason: "" };
}

export const UPGRADE_GAME_PROMPT =
  "Upgrade this legacy game to the ATG engine in one best-effort conversion. Preserve the phone controls as DOM UI, game state, actions, scoring, assets, and instructions. Do not publish or replace the current legacy game until the conversion candidate is explicitly accepted.";
