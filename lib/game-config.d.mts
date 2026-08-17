import type { GameConfig } from "./game-types";

export const DEFAULT_GAME_CONFIG: Readonly<GameConfig>;
export function parseGameConfig(raw: string, projectName: string): GameConfig;
export function normalizeGameConfig(config: Partial<GameConfig>): GameConfig;
