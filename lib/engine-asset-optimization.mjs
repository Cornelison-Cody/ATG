import { createHash as nodeCreateHash } from "node:crypto";

const IMAGE_EXTENSIONS = new Set([".gif", ".jpg", ".jpeg", ".png", ".svg", ".webp"]);
const AUDIO_EXTENSIONS = new Set([".flac", ".m4a", ".mp3", ".ogg", ".wav"]);
const VIDEO_EXTENSIONS = new Set([".m4v", ".mp4", ".webm"]);

export function createAssetOptimizationPlan(assets = [], options = {}) {
  const quality = options.quality || "balanced";
  const normalized = assets.map(normalizeAsset).sort((left, right) => left.path.localeCompare(right.path));
  const cacheKey = hash(JSON.stringify({ quality, assets: normalized.map(({ path, contentHash, size }) => ({ path, contentHash, size })) }));
  const outputs = normalized.flatMap((asset) => derivedOutputs(asset, cacheKey, quality));
  const warnings = normalized.filter((asset) => asset.size > 10 * 1024 * 1024).map((asset) => `${asset.path} is larger than the 10 MB interactive-asset budget.`);
  return Object.freeze({ cacheKey, quality, sourceAssets: normalized, outputs, warnings, manifest: createPreloadManifest(outputs) });
}

export async function runAssetOptimization(plan, optimize = async (output) => output) {
  const generated = [];
  for (const output of plan.outputs) {
    generated.push(await optimize(output));
  }
  return Object.freeze({ cacheKey: plan.cacheKey, outputs: generated, manifest: plan.manifest, warnings: plan.warnings });
}

export function createPreloadManifest(outputs = []) {
  return Object.freeze({
    version: 1,
    entries: outputs.map((output) => ({ path: output.path, sourcePath: output.sourcePath, kind: output.kind, bytes: output.bytes })),
    total: outputs.length
  });
}

function normalizeAsset(asset) {
  if (!asset?.path || !Number.isFinite(asset.size) || asset.size < 0) throw new Error("Optimization assets require path and size.");
  const contentHash = asset.contentHash || hash(`${asset.path}:${asset.size}:${asset.updatedAt || ""}`);
  return { path: asset.path, size: asset.size, contentHash, updatedAt: asset.updatedAt || "" };
}

function derivedOutputs(asset, cacheKey, quality) {
  const extension = extensionFor(asset.path);
  const base = asset.path.replace(/\.[^.]+$/, "");
  const variants = IMAGE_EXTENSIONS.has(extension) ? ["1x", "2x"] : ["optimized"];
  return variants.map((variant) => ({
    path: `assets/.optimized/${cacheKey}/${base}-${variant}${extension}`,
    sourcePath: asset.path,
    kind: kindFor(extension),
    quality,
    variant,
    bytes: asset.size
  }));
}

function hash(value) { return nodeCreateHash("sha256").update(value).digest("hex").slice(0, 16); }
function extensionFor(path) { return (path.match(/\.[^.]+$/)?.[0] || "").toLowerCase(); }
function kindFor(extension) { return IMAGE_EXTENSIONS.has(extension) ? "texture" : AUDIO_EXTENSIONS.has(extension) ? "audio" : VIDEO_EXTENSIONS.has(extension) ? "video" : "font"; }
