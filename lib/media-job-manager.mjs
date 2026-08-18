import { createMediaJob, runMediaJob } from "./media-generation.mjs";
import { prepareAiBillingForRun } from "./ai-billing.mjs";
import { listUploadedGameAssets, readGameAsset, uploadGameAsset } from "./project-game";
import { createMediaJobRecord, getMediaJob, listProjectMediaJobs, updateMediaJob, MediaJobStoreError } from "./media-job-store.mjs";
import { generateMediaWithProvider, moderateMediaWithProvider } from "./media-providers.mjs";

const activeControllers = new Map();

export async function startMediaJob(project, principal, input) {
  const kind = input.kind;
  const provider = kind === "image" ? "openai-image" : kind === "sound-effect" ? "openai-sfx" : "";
  if (!provider) throw new MediaJobStoreError("Only image and sound-effect media jobs are supported.", 400);
  const referenceAssetPaths = Array.isArray(input.referenceAssetPaths) ? input.referenceAssetPaths.filter((item) => typeof item === "string") : [];
  if (referenceAssetPaths.length && input.referenceConsent !== true) throw new MediaJobStoreError("Reference-asset consent is required.", 400);
  const assets = await listUploadedGameAssets(project);
  const allowedPaths = new Set(assets.map((asset) => asset.path));
  if (referenceAssetPaths.some((item) => !allowedPaths.has(item) || item.includes("..") || item.startsWith("/"))) throw new MediaJobStoreError("Reference assets must belong to the active project.", 400);
  const job = createMediaJob({ kind, provider, projectId: project.id, prompt: input.prompt, model: input.model, referenceConsent: input.referenceConsent === true });
  job.ownerUserId = principal;
  job.referenceAssetPaths = referenceAssetPaths;
  await createMediaJobRecord(job);
  void executeMediaJob(project, principal, job.id);
  return job;
}

export function detectMediaIntent(message) {
  const match = message.match(/^\s*\/generate\s+(image|sound-effect)\s*:\s*(.{3,500})$/i);
  return match ? { kind: match[1].toLowerCase(), prompt: match[2].trim() } : null;
}

export async function executeMediaJob(project, principal, id) {
  const stored = await getMediaJob(id); if (!stored || stored.projectId !== project.id) throw new MediaJobStoreError("Media job was not found.", 404);
  const billing = await prepareAiBillingForRun({ projectId: project.id, userId: principal, reservationId: id });
  const job = { ...stored, progress: [...(stored.progress || [])] };
  const controller = new AbortController();
  activeControllers.set(id, controller);
  await updateMediaJob(id, (record) => Object.assign(record, job, { status: "queued" }));
  try {
    await runMediaJob(job, { signal: controller.signal, generate: ({ job: current, signal }) => generateMediaWithProvider({ job: current, apiKey: billing.apiKey, signal }), moderate: ({ job: current, generated }) => moderateMediaWithProvider({ job: current, generated, apiKey: billing.apiKey }), store: ({ generated, provenance }) => storeGeneratedAsset(project, generated, provenance), billing: { reserve: async () => billing.reservationId, reconcile: async (reservation, completed) => reconcileMediaBilling(principal, reservation, completed), release: async (reservation, result) => releaseMediaBilling(principal, reservation, result) }, onProgress: () => { void updateMediaJob(id, (record) => { record.status = job.status; record.progress = job.progress; record.result = job.result; }); } });
    return updateMediaJob(id, (record) => Object.assign(record, job));
  } finally { activeControllers.delete(id); }
}

export async function getMediaJobForProject(projectId, id) { const job = await getMediaJob(id); if (!job || job.projectId !== projectId) throw new MediaJobStoreError("Media job was not found.", 404); return job; }
export async function listMediaJobs(projectId) { return listProjectMediaJobs(projectId); }
export async function cancelMediaJob(projectId, id) { const result = await updateMediaJobForProject(projectId, id, (job) => { if (["completed", "cancelled"].includes(job.status)) throw new MediaJobStoreError(`Media job is already ${job.status}.`, 409); job.status = "cancelled"; job.result = { code: "cancelled", message: "Media generation cancelled." }; }); activeControllers.get(id)?.abort(); return result; }
export async function retryMediaJob(project, principal, id) { const job = await getMediaJobForProject(project.id, id); if (!["failed", "cancelled"].includes(job.status)) throw new MediaJobStoreError("Only failed or cancelled media jobs can be retried.", 409); await updateMediaJob(id, (record) => { record.status = "queued"; record.result = null; record.progress = []; }); void executeMediaJob(project, principal, id); return getMediaJob(id); }
async function updateMediaJobForProject(projectId, id, callback) { await getMediaJobForProject(projectId, id); return updateMediaJob(id, callback); }
async function storeGeneratedAsset(project, generated, provenance) { const asset = await uploadGameAsset(project, { content: generated.bytes, contentType: generated.contentType, filename: generated.filename }); return { ...asset, provenance }; }
async function reconcileMediaBilling(userId, reservationId, job) { if (!reservationId) return; const { reconcileManagedAiCredit } = await import("./usage-budget.mjs"); await reconcileManagedAiCredit({ userId, reservationId, actualUsd: 0 }); }
async function releaseMediaBilling(userId, reservationId, result) { if (!reservationId) return; const { releaseManagedAiCredit } = await import("./usage-budget.mjs"); await releaseManagedAiCredit({ userId, reservationId, reason: result?.message || "media failed" }); }
export { MediaJobStoreError };
