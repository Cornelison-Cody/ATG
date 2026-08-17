export function createSoundEffectRequest(options: { cue: "action" | "transition" | "scoring" | "error" | "countdown" | "celebration"; prompt: string; projectId: string; model?: string }): Record<string, unknown>;
export function createSoundEffectMediaJob(request: Record<string, unknown>): Record<string, unknown>;
export function compressSoundEffect(options: { bytes: Uint8Array; contentType?: string; sampleRate?: number }): { bytes: Uint8Array; contentType: string; sampleRate: number; codec: string; loop: boolean };
export function acceptSoundEffect(request: Record<string, unknown>, result: { path: string; bytes: Uint8Array; contentType?: string; sampleRate?: number }): Record<string, unknown>;
export function buildAudioCuePatch(effect: Record<string, unknown>): { code: string; instructions: string };
export function visualFeedbackFor(cue: string): string;
