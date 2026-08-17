export type MediaKind = "image" | "sound-effect";
export type MediaJob = { id: string; kind: MediaKind; projectId: string; provider: string; model: string; status: string; [key: string]: unknown };
export const MEDIA_PROVIDERS: Record<MediaKind, string[]>;
export function createMediaJob(options: { kind: MediaKind; prompt: string; projectId: string; provider: string; model?: string; referenceConsent?: boolean; billingMode?: string }): MediaJob;
export function runMediaJob<T>(job: MediaJob, options: { generate: (input: { job: MediaJob; signal?: AbortSignal }) => Promise<T>; moderate?: (input: { job: MediaJob; generated: T }) => Promise<{ allowed: boolean; reason?: string; label?: string }>; store: (input: { job: MediaJob; generated: T; provenance: Record<string, unknown> }) => Promise<unknown>; billing?: Record<string, (input: unknown, job?: MediaJob) => Promise<unknown>>; onProgress?: (progress: unknown) => void; signal?: AbortSignal }): Promise<MediaJob>;
export function buildProvenance(job: MediaJob, moderation?: Record<string, unknown>): Record<string, unknown>;
