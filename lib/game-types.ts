import { DEFAULT_GAME_CONFIG as defaultGameConfig } from "./game-config.mjs";
import type { GameEngineMetadata } from "./game-engine-metadata.mjs";

export type GameConfig = {
  title: string;
  promptLabel: string;
  buzzLabel: string;
  resetLabel: string;
  accentColor: string;
  initialPrompt: string;
  engine: GameEngineMetadata;
};

export const DEFAULT_GAME_CONFIG: GameConfig = {
  ...defaultGameConfig,
  engine: { ...defaultGameConfig.engine }
};

export type GamePlayer = {
  id: string;
  name: string;
  color: string;
  connected: boolean;
  joinedAt: string;
};

export type GameBuzz = {
  playerId: string;
  name: string;
  color: string;
  at: string;
};

export type GameAction = {
  actionType: string;
  payload: unknown;
  playerId?: string;
  createdAt: string;
};

export type GameState = {
  projectId: string;
  prompt: string;
  players: GamePlayer[];
  buzzes: GameBuzz[];
  config: GameConfig;
  actions: GameAction[];
  [key: string]: unknown;
};

export type JoinInfo = {
  project: {
    id: string;
    name: string;
    slug: string;
  };
  joinUrl: string;
  wsUrl: string;
  config: GameConfig;
};

export type GameSocketMessage =
  | { type: "state"; state: GameState }
  | { type: "error"; message: string };
