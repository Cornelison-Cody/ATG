import { createHash } from "node:crypto";
import { exportGameTextFiles, listUploadedGameAssets, readGameAsset, readGameConfig, updateGameTextFiles } from "./project-game";
import {
  acceptConversion,
  cancelConversion,
  createOrGetConversion,
  ConversionStoreError,
  failConversion,
  getConversion,
  markConversionRunning,
  retryConversion,
  saveConversionCandidate
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

export async function failConversionRun(conversionId, errorMessage) {
  return failConversion(conversionId, errorMessage);
}

export async function cancelConversionRun(conversionId) {
  return cancelConversion(conversionId);
}

export async function retryConversionRun(conversionId) {
  return retryConversion(conversionId);
}

export async function acceptConversionCandidate(project, conversionId) {
  const record = await getRequiredConversion(conversionId);
  if (record.projectId !== project.id) throw new ConversionStoreError("Conversion belongs to another project.", 409);
  const current = await capturePublishedConversion(project, conversionId);
  if (current.fingerprint !== record.snapshot.fingerprint) {
    throw new ConversionStoreError("The published game changed while conversion was running. Start a new conversion.", 409);
  }
  await updateGameTextFiles(project, record.candidate.textFiles);
  return acceptConversion(conversionId);
}

export async function getConversionForProject(projectId, conversionId) {
  const record = await getConversion(conversionId);
  if (!record || record.projectId !== projectId) throw new ConversionStoreError("Conversion was not found.", 404);
  return record;
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
