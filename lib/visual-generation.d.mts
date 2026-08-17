export type VisualKind = "image" | "character" | "object" | "sprite-variation" | "animation-sheet";
export function createVisualRequest(options: { kind: VisualKind; prompt: string; projectId: string; referenceAssetPaths?: string[]; referenceConsent?: boolean; model?: string }): Record<string, unknown>;
export function createVisualMediaJob(request: Record<string, unknown>): Record<string, unknown>;
export function buildVisualPrompt(request: Record<string, unknown>): string;
export function createAnimationSheetMetadata(options: { frameCount: number; frameWidth: number; frameHeight: number; columns?: number }): Record<string, unknown>;
export function acceptVisualAsset(request: Record<string, unknown>, result: { path: string; contentType?: string; metadata?: unknown }): Record<string, unknown>;
export function createVisualAssetLibrary(): { find(fingerprint: string): unknown; accept(request: Record<string, unknown>, result: Record<string, unknown>): { asset: unknown; reused: boolean }; discard(request: Record<string, unknown>): { requestId: unknown; discarded: boolean } };
