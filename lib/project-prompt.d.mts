import type { GameEngineMetadata } from "./game-engine-metadata.mjs";

export function buildProjectPrompt(message: string, editingTarget: "tv" | "phone" | "both", engineMetadata?: GameEngineMetadata): string;
