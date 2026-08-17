import { randomUUID } from "node:crypto";

export const MEDIA_PROVIDERS = Object.freeze({
  image: Object.freeze(["openai-image"]),
  "sound-effect": Object.freeze(["openai-sfx"])
});

export function createMediaJob({ kind, prompt, projectId, provider, model, referenceConsent = false, billingMode = "managed" } = {}) {
  if (!MEDIA_PROVIDERS[kind]?.includes(provider)) throw new Error("Unsupported media generation kind or provider.");
  if (!projectId || !prompt?.trim()) throw new Error("A project and media prompt are required.");
  return {
    id: randomUUID(), kind, prompt: prompt.trim(), projectId, provider, model: model || defaultModel(kind),
    referenceConsent: Boolean(referenceConsent), billingMode, status: "queued", progress: [], result: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  };
}

export async function runMediaJob(job, { generate, moderate = async () => ({ allowed: true }), store, billing = {}, onProgress = () => undefined, signal } = {}) {
  if (!job || job.status !== "queued") throw new Error("Media job is not queued.");
  if (typeof generate !== "function" || typeof store !== "function") throw new Error("Media generation and storage adapters are required.");
  const update = (message, status = "running") => { job.status = status; job.progress.push({ message, at: new Date().toISOString() }); job.updatedAt = new Date().toISOString(); onProgress(job.progress.at(-1)); };
  const reservation = await billing.reserve?.(job);
  try {
    update("Generating media...");
    if (signal?.aborted) throw new Error("Media generation was cancelled.");
    const generated = await generate({ job, signal });
    update("Checking generated media...");
    const moderation = await moderate({ job, generated });
    if (!moderation?.allowed) {
      job.status = "failed";
      job.result = { code: "moderation", message: moderation?.reason || "Generated media was not approved." };
      await billing.release?.(reservation, job.result);
      return job;
    }
    update("Saving generated asset...");
    const stored = await store({ job, generated, provenance: buildProvenance(job, moderation) });
    job.status = "completed";
    job.result = { asset: stored, provenance: buildProvenance(job, moderation) };
    await billing.reconcile?.(reservation, job);
    update("Media is ready.", "completed");
    return job;
  } catch (error) {
    job.status = signal?.aborted ? "cancelled" : "failed";
    job.result = { code: signal?.aborted ? "cancelled" : "generation-failed", message: error instanceof Error ? error.message : "Media generation failed." };
    await billing.release?.(reservation, job.result);
    update(job.result.message, job.status);
    return job;
  }
}

export function buildProvenance(job, moderation = {}) {
  return {
    provider: job.provider, model: job.model, prompt: job.prompt, creatorConsent: { referenceAssets: job.referenceConsent },
    moderation: moderation.label || (moderation.allowed ? "allowed" : "blocked"), generatedAt: new Date().toISOString()
  };
}

function defaultModel(kind) { return kind === "image" ? "gpt-image-1" : "gpt-4o-mini-tts"; }
