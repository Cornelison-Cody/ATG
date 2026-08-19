import { createMediaJob, runMediaJob } from "./media-generation.mjs";
import { createVisualRequest, createVisualMediaJob } from "./visual-generation.mjs";
import { prepareAiBillingForRun } from "./ai-billing.mjs";
import { listUploadedGameAssets, readGameAsset, uploadGameAsset } from "./project-game.ts";
import { claimMediaJob, createMediaJobRecord, getMediaJob, listProjectMediaJobs, releaseMediaJobLease, updateMediaJob, MediaJobStoreError } from "./media-job-store.mjs";
import { generateMediaWithProvider, moderateMediaWithProvider } from "./media-providers.mjs";
import { deleteMediaPreview, readMediaPreview, storeMediaPreview } from "./media-preview-store.mjs";
import { createBackgroundJob, requestBackgroundJobCancellation } from "./background-job-store.mjs";

const activeControllers = new Map();

export async function startMediaJob(project, principal, input) {
  const kind = input.kind;
  const visualKind = ["image", "character", "object", "sprite-variation", "animation-sheet"].includes(kind) ? kind : null;
  const provider = visualKind ? "openai-image" : kind === "sound-effect" ? "openai-sfx" : "";
  if (!provider) throw new MediaJobStoreError("Only image and sound-effect media jobs are supported.", 400);
  const referenceAssetPaths = Array.isArray(input.referenceAssetPaths) ? input.referenceAssetPaths.filter((item) => typeof item === "string") : [];
  if (referenceAssetPaths.length && input.referenceConsent !== true) throw new MediaJobStoreError("Reference-asset consent is required.", 400);
  const assets = await listUploadedGameAssets(project);
  const allowedPaths = new Set(assets.map((asset) => asset.path));
  if (referenceAssetPaths.some((item) => !allowedPaths.has(item) || item.includes("..") || item.startsWith("/"))) throw new MediaJobStoreError("Reference assets must belong to the active project.", 400);
  const visualRequest = visualKind ? createVisualRequest({ kind: visualKind, prompt: input.prompt, projectId: project.id, referenceAssetPaths, referenceConsent: input.referenceConsent === true, model: input.model }) : null;
  const job = visualRequest ? createVisualMediaJob(visualRequest) : createMediaJob({ kind, provider, projectId: project.id, prompt: input.prompt, model: input.model, referenceConsent: input.referenceConsent === true });
  job.ownerUserId = principal;
  job.referenceAssetPaths = referenceAssetPaths;
  if (visualRequest) { job.visualKind = visualKind; job.fingerprint = visualRequest.fingerprint; }
  await createMediaJobRecord(job);
  await createBackgroundJob({ id: `media:${job.id}`, projectId: project.id, kind: "media-generation", payload: { mediaJobId: job.id } });
  void dispatchLocalBackgroundJobs();
  return job;
}

export function detectMediaIntent(message) {
  const match = message.match(/^\s*\/generate\s+(image|sound-effect)\s*:\s*(.{3,500})$/i);
  return match ? { kind: match[1].toLowerCase(), prompt: match[2].trim() } : null;
}

export async function executeMediaJob(project, principal, id) {
  const stored = await getMediaJob(id); if (!stored || stored.projectId !== project.id) throw new MediaJobStoreError("Media job was not found.", 404);
  const owner = `${process.pid}:${Math.random().toString(36).slice(2)}`;
  const claimed = await claimMediaJob(id, owner); if (!claimed) return stored;
  const job = { ...stored, progress: [...(stored.progress || [])] };
  const controller = new AbortController();
  activeControllers.set(id, controller);
  try {
    const billing = await prepareAiBillingForRun({ projectId: project.id, userId: principal, reservationId: id });
    await updateMediaJob(id, (record) => Object.assign(record, job, { status: "queued" }));
    const references = await loadConsentedReferences(project, job);
    await runMediaJob(job, { signal: controller.signal, generate: ({ job: current, signal }) => generateMediaWithProvider({ job: current, apiKey: billing.apiKey, references, signal }), moderate: ({ job: current, generated }) => moderateMediaWithProvider({ job: current, generated, apiKey: billing.apiKey }), store: ({ generated, provenance }) => storeGeneratedAsset(project, generated, provenance), billing: { reserve: async () => billing.reservationId, reconcile: async (reservation, completed) => reconcileMediaBilling(principal, reservation, completed), release: async (reservation, result) => releaseMediaBilling(principal, reservation, result) }, onProgress: () => { void updateMediaJob(id, (record) => { record.status = job.status; record.progress = job.progress; record.result = job.result; }); } });
    return updateMediaJob(id, (record) => Object.assign(record, job));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Media generation failed.";
    job.status = "failed";
    job.result = { code: "generation-failed", message };
    return updateMediaJob(id, (record) => Object.assign(record, job));
  } finally { activeControllers.delete(id); await releaseMediaJobLease(id, owner).catch(() => undefined); }
}

export async function getMediaJobForProject(projectId, id) { const job = await getMediaJob(id); if (!job || job.projectId !== projectId) throw new MediaJobStoreError("Media job was not found.", 404); return job; }
export async function readMediaJobPreview(projectId, id) { const job = await getMediaJobForProject(projectId, id); const preview = job.result?.asset?.preview; if (!preview?.id || job.status !== "completed") throw new MediaJobStoreError("Media preview is not available.", 404); return { content: await readMediaPreview(preview.id), contentType: preview.contentType }; }
export async function listMediaJobs(projectId) { return listProjectMediaJobs(projectId); }
export async function acceptMediaJob(project, id, metadata = null) {
  const job = await getMediaJobForProject(project.id, id);
  if (job.status !== "completed" || !job.result?.asset?.preview) throw new MediaJobStoreError("Only completed media previews can be accepted.", 409);
  if (job.visualKind === "animation-sheet" && !metadata?.frames?.length) throw new MediaJobStoreError("Animation sheets require frame metadata before acceptance.", 400);
  const matching = job.fingerprint ? (await listProjectMediaJobs(project.id)).find((item) => item.id !== id && item.status === "accepted" && item.fingerprint === job.fingerprint) : null;
  if (matching) return updateMediaJob(id, (record) => { record.status = "accepted"; record.result = { asset: matching.result.asset, reused: true, provenance: matching.result.provenance }; });
  const preview = job.result.asset.preview;
  const asset = await uploadGameAsset(project, { content: await readMediaPreview(preview.id), contentType: preview.contentType, filename: preview.filename });
  const existingAssets = await listUploadedGameAssets(project);
  await uploadGameAsset(project, { content: Buffer.from(JSON.stringify({ version: 1, entries: [...existingAssets.map((item) => ({ path: item.path, contentType: item.contentType })), { path: asset.path, contentType: asset.contentType }] }, null, 2)), contentType: "application/json", filename: "assets/preload-manifest.json" });
  await deleteMediaPreview(preview.id);
  return updateMediaJob(id, (record) => { record.status = "accepted"; record.result = { asset: { ...asset, metadata }, provenance: preview.provenance, reused: false }; });
}
export async function discardMediaJob(projectId, id) { const job = await getMediaJobForProject(projectId, id); if (job.result?.asset?.preview?.id) await deleteMediaPreview(job.result.asset.preview.id); return updateMediaJobForProject(projectId, id, (job) => { if (job.status === "accepted") throw new MediaJobStoreError("Accepted media cannot be discarded.", 409); job.status = "discarded"; job.result = { code: "discarded", message: "Media preview discarded." }; }); }
export async function cancelMediaJob(projectId, id) { const result = await updateMediaJobForProject(projectId, id, (job) => { if (["completed", "cancelled"].includes(job.status)) throw new MediaJobStoreError(`Media job is already ${job.status}.`, 409); job.status = "cancelled"; job.result = { code: "cancelled", message: "Media generation cancelled." }; }); await requestBackgroundJobCancellation(`media:${id}`).catch(() => undefined); activeControllers.get(id)?.abort(); return result; }
export async function retryMediaJob(project, principal, id) { const job = await getMediaJobForProject(project.id, id); if (!["failed", "cancelled"].includes(job.status)) throw new MediaJobStoreError("Only failed or cancelled media jobs can be retried.", 409); await updateMediaJob(id, (record) => { record.status = "queued"; record.result = null; record.progress = []; }); await createBackgroundJob({ id: `media-retry:${id}:${Date.now()}`, projectId: project.id, kind: "media-generation", payload: { mediaJobId: id } }); return getMediaJob(id); }
async function dispatchLocalBackgroundJobs() { if ((process.env.ATG_STORAGE_BACKEND || "local").toLowerCase() === "azure") return; const worker = await import("./background-worker.mjs"); await import("./background-worker-handlers.mjs"); await worker.dispatchBackgroundJobs({ once: true }); }
async function updateMediaJobForProject(projectId, id, callback) { await getMediaJobForProject(projectId, id); return updateMediaJob(id, callback); }
async function loadConsentedReferences(project, job) { if (!job.referenceConsent || !job.referenceAssetPaths?.length) return []; return Promise.all(job.referenceAssetPaths.map(async (assetPath) => { const asset = await readGameAsset(project, assetPath.split("/")); return { contentType: asset.contentType, data: asset.content.toString("base64"), path: assetPath }; })); }
async function storeGeneratedAsset(_project, generated, provenance) { const id = `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`; await storeMediaPreview(id, generated.bytes); return { preview: { id, contentType: generated.contentType, filename: generated.filename, provenance } }; }
async function reconcileMediaBilling(userId, reservationId, job) {
  if (!reservationId) return;
  const { reconcileManagedAiReservation } = await import("./usage-budget.mjs");
  // Media providers do not yet return normalized token usage. Reconcile the
  // reservation conservatively instead of silently recording a zero-cost run.
  await reconcileManagedAiReservation({ userId, reservationId, usage: job.usage, model: job.model });
}
async function releaseMediaBilling(userId, reservationId, result) {
  if (!reservationId) return;
  const { releaseManagedAiReservation } = await import("./usage-budget.mjs");
  await releaseManagedAiReservation({ userId, reservationId, reason: result?.message || "media failed" });
}
export { MediaJobStoreError };
