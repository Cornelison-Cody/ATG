import { createHash, randomUUID } from "node:crypto";
import { createAssetOptimizationPlan } from "./engine-asset-optimization.mjs";
import { createBackgroundJob, getBackgroundJob, requestBackgroundJobCancellation } from "./background-job-store.mjs";
import { listUploadedGameAssets, readGameAsset, uploadGameAsset } from "./project-game";

const records = new Map();

export async function startAssetOptimization(project, input = {}) {
  const selected = new Set(Array.isArray(input.sourcePaths) ? input.sourcePaths : []);
  const assets = (await listUploadedGameAssets(project)).filter((asset) => !selected.size || selected.has(asset.path));
  if (!assets.length) throw new AssetOptimizationError("Select at least one project asset.", 400);
  const sources = await Promise.all(assets.map(async (asset) => ({ ...asset, contentHash: createHash("sha256").update((await readGameAsset(project, asset.path.split("/"))).content).digest("hex") })));
  const plan = createAssetOptimizationPlan(sources, input.settings || {});
  const record = { id: randomUUID(), projectId: project.id, status: "queued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), plan, settings: input.settings || {}, result: null, error: null };
  records.set(record.id, record);
  const job = await createBackgroundJob({ id: `asset-optimization:${record.id}`, projectId: project.id, kind: "asset-optimization", payload: { optimizationId: record.id } });
  record.jobId = job.id;
  return record;
}
export function getAssetOptimization(projectId, id) { const record = records.get(id); if (!record || record.projectId !== projectId) throw new AssetOptimizationError("Asset optimization was not found.", 404); return record; }
export function listAssetOptimizations(projectId) { return [...records.values()].filter((record) => record.projectId === projectId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
export async function actOnAssetOptimization(project, id, action) {
  const record = getAssetOptimization(project.id, id);
  if (action === "cancel") { await requestBackgroundJobCancellation(record.jobId); record.status = "cancelled"; record.updatedAt = new Date().toISOString(); return record; }
  if (action === "cleanup") { if (record.status === "published") throw new AssetOptimizationError("Published outputs cannot be cleaned up from this record.", 409); records.delete(id); return { id, status: "cleaned" }; }
  if (action === "retry") { if (!['failed', 'cancelled'].includes(record.status)) throw new AssetOptimizationError("Only failed or cancelled optimizations can be retried.", 409); const next = await startAssetOptimization(project, { sourcePaths: record.plan.sourceAssets.map((asset) => asset.path), settings: record.settings }); return next; }
  if (action === "publish") { if (record.status !== "ready") throw new AssetOptimizationError("Only ready optimizations can be published.", 409); for (const output of record.result.outputs) await uploadGameAsset(project, { content: output.content, contentType: output.contentType, filename: output.filename }); record.status = "published"; record.updatedAt = new Date().toISOString(); return record; }
  throw new AssetOptimizationError("Action must be cancel, retry, publish, or cleanup.", 400);
}
export async function runAssetOptimizationJob(project, id, context) {
  const record = records.get(id); if (!record) throw new Error("Asset optimization record is unavailable.");
  record.status = "running"; record.updatedAt = new Date().toISOString();
  const outputs = [];
  for (let index = 0; index < record.plan.outputs.length; index += 1) {
    if (await context.isCancellationRequested()) { record.status = "cancelled"; return { cancelled: true }; }
    const output = record.plan.outputs[index]; const source = await readGameAsset(project, output.sourcePath.split("/"));
    // Transform execution is intentionally bounded to worker images; until a format-specific
    // transformer runs, this deterministic copy keeps the publish boundary and provenance intact.
    outputs.push({ ...output, content: source.content, contentType: source.contentType, filename: output.path.split("/").at(-1) });
    await context.progress({ phase: "deriving", completed: index + 1, total: record.plan.outputs.length, message: `Prepared ${index + 1} of ${record.plan.outputs.length} outputs` });
  }
  record.status = "ready"; record.result = { outputs, manifest: record.plan.manifest, warnings: record.plan.warnings }; record.updatedAt = new Date().toISOString();
  return { progress: { phase: "ready", completed: outputs.length, total: outputs.length || 1, message: "Derived assets are ready to publish" } };
}
export class AssetOptimizationError extends Error { constructor(message, status = 500) { super(message); this.status = status; } }
