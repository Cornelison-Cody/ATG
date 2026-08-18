import { createHash } from "node:crypto";
import { exportGameTextFiles, listUploadedGameAssets, readGameAsset, readGameConfig, updateGameTextFiles } from "./project-game";
import { validateConvertedGame } from "./conversion-validation.mjs";
import {
  acceptConversion,
  cancelConversion,
  createOrGetConversion,
  ConversionStoreError,
  failConversion,
  getConversion,
  markConversionRunning,
  retryConversion,
  saveConversionCandidate,
  saveConversionValidation
} from "./conversion-store.mjs";

export async function startConversion(project, conversionId) {
  const snapshot = await capturePublishedConversion(project, conversionId);
  return createOrGetConversion({ conversionId, projectId: project.id, snapshot });
}

export async function prepareConversion(conversionId) {
  return markConversionRunning(conversionId);
}

export async function completeConversion(conversionId, changedFiles, finalMessage, warnings = []) {
  const record = await getRequiredConversion(conversionId);
  const changed = Array.isArray(changedFiles) ? changedFiles : [];
  const source = new Map(record.snapshot.textFiles.map((file) => [file.path, file.content]));
  for (const file of changed) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
      throw new ConversionStoreError("Conversion output contains an invalid text file.", 400);
    }
    source.set(file.path, file.content);
  }
  return saveConversionCandidate(conversionId, {
    textFiles: [...source.entries()].map(([path, content]) => ({ path, content })).sort((a, b) => a.path.localeCompare(b.path)),
    warnings: Array.isArray(warnings) ? warnings.filter((warning) => typeof warning === "string") : [],
    finalMessage: typeof finalMessage === "string" ? finalMessage : "Conversion candidate is ready for review.",
    candidateRevision: createHash("sha256").update(JSON.stringify([...source.entries()])).digest("hex").slice(0, 16),
    createdAt: new Date().toISOString()
  });
}

export async function validateConversionCandidate(conversionId, diagnostics = {}) {
  const record = await getRequiredConversion(conversionId);
  if (!record.candidate) throw new ConversionStoreError("A conversion candidate is required.", 409);
  const validation = validateConvertedGame({
    files: record.candidate.textFiles,
    assets: record.snapshot.assets,
    diagnostics: diagnostics.diagnostics,
    performance: diagnostics.performance,
    runtime: diagnostics.runtime
  });
  return saveConversionValidation(conversionId, validation);
}

export async function failConversionRun(conversionId, errorMessage) {
  return failConversion(conversionId, errorMessage);
}

export async function cancelConversionRun(conversionId) {
  return cancelConversion(conversionId);
}

export async function retryConversionRun(conversionId) {
  return retryConversion(conversionId);
}

export async function acceptConversionCandidate(project, conversionId, acknowledgeWarnings = false) {
  const record = await getRequiredConversion(conversionId);
  if (record.projectId !== project.id) throw new ConversionStoreError("Conversion belongs to another project.", 409);
  const current = await capturePublishedConversion(project, conversionId);
  if (current.fingerprint !== record.snapshot.fingerprint) {
    throw new ConversionStoreError("The published game changed while conversion was running. Start a new conversion.", 409);
  }
  if (!record.validation) throw new ConversionStoreError("Validate the conversion candidate before accepting it.", 409);
  if (record.validation.blockingErrors.length) throw new ConversionStoreError("Blocking conversion findings must be resolved before acceptance.", 409);
  if (record.validation.warnings.length && !acknowledgeWarnings) throw new ConversionStoreError("Acknowledge conversion warnings before acceptance.", 409);
  await updateGameTextFiles(project, record.candidate.textFiles);
  return acceptConversion(conversionId);
}

export async function getConversionForProject(projectId, conversionId) {
  const record = await getConversion(conversionId);
  if (!record || record.projectId !== projectId) throw new ConversionStoreError("Conversion was not found.", 404);
  return record;
}

export async function readConversionPreviewAsset(projectId, conversionId, revision, assetPath) {
  const record = await getConversionForProject(projectId, conversionId);
  if (record.status !== "review" || !record.candidate || record.candidate.candidateRevision !== revision) {
    throw new ConversionStoreError("Conversion preview is no longer available.", 404);
  }
  const textFile = record.candidate.textFiles.find((file) => file.path === assetPath);
  if (textFile) {
    return { content: Buffer.from(textFile.content), contentType: previewContentType(assetPath), engine: readCandidateEngine(record) };
  }
  const asset = record.snapshot.assets.find((item) => item.path === assetPath);
  if (asset) {
    return { content: Buffer.from(asset.content, "base64"), contentType: asset.contentType, engine: readCandidateEngine(record) };
  }
  throw new ConversionStoreError("Conversion preview asset was not found.", 404);
}

async function capturePublishedConversion(project, conversionId) {
  const textFiles = await exportGameTextFiles(project);
  const assets = [];
  for (const summary of await listUploadedGameAssets(project)) {
    const asset = await readGameAsset(project, summary.path.split("/"));
    assets.push({
      path: summary.path,
      contentType: asset.contentType,
      content: Buffer.from(asset.content).toString("base64")
    });
  }
  const config = await readGameConfig(project);
  const identity = {
    id: project.id,
    slug: project.slug,
    name: project.name,
    ownerUserId: project.ownerUserId || null,
    ownerName: project.ownerName || null,
    collaborators: project.collaborators || [],
    visibility: project.visibility,
    tvUrl: `/tv/${encodeURIComponent(project.id)}`,
    phoneUrl: `/join/${encodeURIComponent(project.id)}`
  };
  const normalized = { conversionId, projectId: project.id, textFiles, assets, engine: config.engine, identity };
  const fingerprint = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  return { ...normalized, projectRevision: project.updatedAt, capturedAt: new Date().toISOString(), fingerprint };
}

async function getRequiredConversion(conversionId) {
  const record = await getConversion(conversionId);
  if (!record) throw new ConversionStoreError("Conversion was not found.", 404);
  return record;
}

function readCandidateEngine(record) {
  const config = record.candidate.textFiles.find((file) => file.path === "config.json");
  try {
    return config ? JSON.parse(config.content).engine || null : null;
  } catch {
    return null;
  }
}

function previewContentType(assetPath) {
  if (assetPath.endsWith(".html")) return "text/html; charset=utf-8";
  if (assetPath.endsWith(".css")) return "text/css; charset=utf-8";
  if (assetPath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (assetPath.endsWith(".json")) return "application/json; charset=utf-8";
  if (assetPath.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "text/plain; charset=utf-8";
}
