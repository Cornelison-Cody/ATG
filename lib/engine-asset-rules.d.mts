export type EngineAssetRule = { contentType: string; maxBytes: number; kind: "atlas" | "bitmap-font" | "metadata" | "font" | "audio" | "video" };
export function getEngineAssetRule(filename: string): EngineAssetRule | null;
export function isSupportedEngineAsset(filename: string): boolean;
export function getEngineAssetRules(): Record<string, EngineAssetRule>;
