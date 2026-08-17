import type { GameEngineMetadata } from "./game-engine-metadata.mjs";

export function getUpgradeGameAvailability(options?: {
  engine?: GameEngineMetadata | null;
  accessRole?: "owner" | "collaborator" | null;
  isRunning?: boolean;
}): { available: boolean; reason: string };

export function buildEngineConversionPrompt(runtimeVersion?: string): string;

export const UPGRADE_GAME_PROMPT: string;
