const TERMINAL_STATUSES = new Set(["accepted", "cancelled", "failed"]);

export async function captureConversionSnapshot({
  conversionId,
  project,
  engine,
  readTextFiles,
  readAssets
}) {
  if (!conversionId || typeof conversionId !== "string") throw new Error("A conversion id is required.");
  if (!project?.id || !project.updatedAt) throw new Error("A project id and revision are required.");
  const textFiles = await readTextFiles();
  const assets = await readAssets();
  return freezeSnapshot({
    conversionId,
    projectId: project.id,
    projectRevision: project.updatedAt,
    capturedAt: new Date().toISOString(),
    engine,
    textFiles,
    assets
  });
}

export function createConversionTransaction(snapshot) {
  const initial = freezeSnapshot(snapshot);
  let status = "running";
  let candidate = null;

  return {
    get conversionId() { return initial.conversionId; },
    get status() { return status; },
    get snapshot() { return status === "accepted" ? null : initial; },
    get candidate() { return candidate; },
    stage(nextCandidate) {
      assertMutable(status);
      candidate = freezeSnapshot({ ...nextCandidate, conversionId: initial.conversionId, projectId: initial.projectId });
      status = "review";
      return candidate;
    },
    cancel() {
      if (status === "cancelled") return initial;
      assertNotAccepted(status);
      status = "cancelled";
      candidate = null;
      return initial;
    },
    fail() {
      if (status === "failed") return initial;
      assertNotAccepted(status);
      status = "failed";
      candidate = null;
      return initial;
    },
    accept() {
      if (status === "accepted") return candidate;
      if (status !== "review" || !candidate) throw new Error("A staged conversion candidate is required before acceptance.");
      status = "accepted";
      const promoted = candidate;
      candidate = null;
      return promoted;
    },
    async promote(applyCandidate) {
      if (status !== "review" || !candidate) throw new Error("A staged conversion candidate is required before promotion.");
      if (typeof applyCandidate !== "function") throw new Error("A promotion callback is required.");
      const promoted = candidate;
      const result = await applyCandidate(promoted, initial);
      status = "accepted";
      candidate = null;
      return result;
    }
  };
}

export function createConversionRegistry() {
  const transactions = new Map();
  return {
    get(conversionId) { return transactions.get(conversionId) ?? null; },
    start(snapshot) {
      const existing = transactions.get(snapshot.conversionId);
      if (existing) return existing;
      const transaction = createConversionTransaction(snapshot);
      transactions.set(snapshot.conversionId, transaction);
      return transaction;
    },
    remove(conversionId) { transactions.delete(conversionId); }
  };
}

function freezeSnapshot(snapshot) {
  const normalized = {
    ...snapshot,
    textFiles: normalizeTextFiles(snapshot.textFiles),
    assets: normalizeAssets(snapshot.assets)
  };
  return deepFreeze(normalized);
}

function normalizeTextFiles(files) {
  if (!Array.isArray(files)) throw new Error("Conversion snapshots require text files.");
  return files.map((file) => {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
      throw new Error("Conversion snapshot text files must include path and content.");
    }
    return { path: file.path, content: file.content };
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeAssets(assets) {
  if (!Array.isArray(assets)) throw new Error("Conversion snapshots require an asset list.");
  return assets.map((asset) => {
    if (!asset || typeof asset.path !== "string" || typeof asset.contentType !== "string" || asset.content == null) {
      throw new Error("Conversion snapshot assets must include path, contentType, and content.");
    }
    return { path: asset.path, contentType: asset.contentType, content: cloneBytes(asset.content) };
  }).sort((left, right) => left.path.localeCompare(right.path));
}

function cloneBytes(value) {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new Uint8Array(value);
  throw new Error("Conversion snapshot asset content must be a string or Uint8Array.");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  if (ArrayBuffer.isView(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertMutable(status) {
  if (TERMINAL_STATUSES.has(status)) throw new Error(`Conversion is already ${status}.`);
}

function assertNotAccepted(status) {
  if (status === "accepted") throw new Error("Accepted conversions cannot be rolled back.");
}
