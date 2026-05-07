export type GameConfig = {
  title: string;
  promptLabel: string;
  buzzLabel: string;
  resetLabel: string;
  accentColor: string;
  initialPrompt: string;
};

export const DEFAULT_GAME_CONFIG: GameConfig = {
  accentColor: "#4dd6c9",
  buzzLabel: "Buzz",
  initialPrompt: "Tap buzz when you know the answer.",
  promptLabel: "Prompt",
  resetLabel: "Reset Buzzes",
  title: "Buzzer Lobby"
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
