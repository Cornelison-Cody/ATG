export type GameEngineType = "legacy" | "pixi";
export type GameMigrationStatus = "legacy" | "upgraded";

export type GameEngineMetadata = {
  formatVersion: 1;
  migrationStatus: GameMigrationStatus;
  runtimeVersion: string | null;
  type: GameEngineType;
};

export const DEFAULT_GAME_ENGINE_METADATA: Readonly<GameEngineMetadata>;
export class GameEngineMetadataError extends Error { status: number; }
export function normalizeGameEngineMetadata(value: unknown): GameEngineMetadata;
