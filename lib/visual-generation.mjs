import { createHash, randomUUID } from "node:crypto";
import { createMediaJob } from "./media-generation.mjs";

const VISUAL_KINDS = new Set(["image", "character", "object", "sprite-variation", "animation-sheet"]);

export function createVisualRequest({ kind, prompt, projectId, referenceAssetPaths = [], referenceConsent = false, model } = {}) {
  if (!VISUAL_KINDS.has(kind)) throw new Error("Unsupported visual generation kind.");
  if (referenceAssetPaths.length && !referenceConsent) throw new Error("Reference-asset consent is required for visual generation.");
  const requestId = randomUUID();
  const normalizedPrompt = prompt?.trim();
  if (!projectId || !normalizedPrompt) throw new Error("A project and visual prompt are required.");
  const fingerprint = hash(JSON.stringify({ kind, prompt: normalizedPrompt, referenceAssetPaths: [...referenceAssetPaths].sort(), model: model || "gpt-image-1" }));
  return { requestId, kind, prompt: normalizedPrompt, projectId, referenceAssetPaths: [...referenceAssetPaths], referenceConsent: Boolean(referenceConsent), model: model || "gpt-image-1", fingerprint, status: "preview" };
}

export function createVisualMediaJob(request) {
  return createMediaJob({ kind: "image", provider: "openai-image", model: request.model, projectId: request.projectId, prompt: buildVisualPrompt(request), referenceConsent: request.referenceConsent });
}

export function buildVisualPrompt(request) {
  const shape = request.kind === "animation-sheet" ? "a transparent animation sheet with evenly spaced frames" : request.kind === "character" ? "a transparent game character" : request.kind === "object" ? "a transparent game object" : request.kind === "sprite-variation" ? "a cohesive sprite variation" : "a standalone 2D game image";
  return `Create ${shape} for an ATG 2D game. ${request.prompt} Keep silhouettes, lighting, palette, and transparent edges consistent across frames and variations. Do not include text, logos, or unsafe content.`;
}

export function createAnimationSheetMetadata({ frameCount, frameWidth, frameHeight, columns = frameCount } = {}) {
  if (![frameCount, frameWidth, frameHeight, columns].every((value) => Number.isInteger(value) && value > 0)) throw new Error("Animation sheets require positive integer dimensions and frame count.");
  const rows = Math.ceil(frameCount / columns);
  return { frames: Array.from({ length: frameCount }, (_, index) => ({ filename: `frame-${index}.png`, frame: { x: (index % columns) * frameWidth, y: Math.floor(index / columns) * frameHeight, w: frameWidth, h: frameHeight }, rotated: false, trimmed: false })), meta: { format: "ATG-1", frameCount, frameWidth, frameHeight, columns, rows } };
}

export function acceptVisualAsset(request, { path, contentType = "image/png", metadata = null } = {}) {
  if (!path || request.status !== "preview") throw new Error("Only preview visuals can be accepted.");
  if (request.kind === "animation-sheet" && !metadata?.frames?.length) throw new Error("Animation sheets require frame metadata.");
  return Object.freeze({ id: request.requestId, path, contentType, kind: request.kind, fingerprint: request.fingerprint, metadata, provenance: { prompt: request.prompt, model: request.model, referenceAssetPaths: request.referenceAssetPaths, creatorConsent: request.referenceConsent } });
}

export function createVisualAssetLibrary() {
  const assets = new Map();
  return {
    find(fingerprint) { return assets.get(fingerprint) || null; },
    accept(request, result) {
      const existing = assets.get(request.fingerprint);
      if (existing) return { asset: existing, reused: true };
      const asset = acceptVisualAsset(request, result);
      assets.set(request.fingerprint, asset);
      return { asset, reused: false };
    },
    discard(request) { return { requestId: request.requestId, discarded: true }; }
  };
}

function hash(value) { return createHash("sha256").update(value).digest("hex").slice(0, 16); }
