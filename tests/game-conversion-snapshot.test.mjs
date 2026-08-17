import test from "node:test";
import assert from "node:assert/strict";
import { captureConversionSnapshot, createConversionRegistry, createConversionTransaction } from "../lib/game-conversion-snapshot.mjs";

test("snapshots capture revision, metadata, text files, and binary assets", async () => {
  const snapshot = await captureConversionSnapshot({
    conversionId: "conversion-1",
    project: { id: "project-1", updatedAt: "revision-1" },
    engine: { type: "legacy", runtimeVersion: null },
    readTextFiles: async () => [{ path: "tv.html", content: "legacy" }, { path: "config.json", content: "{}" }],
    readAssets: async () => [{ path: "assets/logo.png", contentType: "image/png", content: new Uint8Array([1, 2, 3]) }]
  });

  assert.equal(snapshot.projectRevision, "revision-1");
  assert.deepEqual(snapshot.textFiles.map((file) => file.path), ["config.json", "tv.html"]);
  assert.deepEqual([...snapshot.assets[0].content], [1, 2, 3]);
  assert.throws(() => snapshot.textFiles.push({ path: "x", content: "x" }), TypeError);
});

test("cancel and failure restore the exact snapshot and acceptance ends rollback", () => {
  const snapshot = {
    conversionId: "conversion-2",
    projectId: "project-1",
    projectRevision: "revision-1",
    capturedAt: "2026-01-01T00:00:00.000Z",
    engine: { type: "legacy" },
    textFiles: [{ path: "tv.html", content: "legacy" }],
    assets: []
  };
  const cancelled = createConversionTransaction(snapshot);
  cancelled.stage({ ...snapshot, textFiles: [{ path: "tv.html", content: "candidate" }] });
  assert.deepEqual(cancelled.cancel().textFiles, snapshot.textFiles);
  assert.equal(cancelled.status, "cancelled");
  assert.deepEqual(cancelled.cancel().textFiles, snapshot.textFiles);

  const accepted = createConversionTransaction(snapshot);
  accepted.stage({ ...snapshot, textFiles: [{ path: "tv.html", content: "candidate" }] });
  const promoted = accepted.accept();
  assert.equal(promoted.textFiles[0].content, "candidate");
  assert.equal(accepted.snapshot, null);
  assert.throws(() => accepted.cancel(), /cannot be rolled back/);
});

test("staging and retries are idempotent for terminal failures", () => {
  const snapshot = { conversionId: "conversion-3", projectId: "p", projectRevision: "r", capturedAt: "t", engine: {}, textFiles: [], assets: [] };
  const transaction = createConversionTransaction(snapshot);
  assert.deepEqual(transaction.fail(), snapshot);
  assert.deepEqual(transaction.fail(), snapshot);
  assert.throws(() => transaction.stage(snapshot), /already failed/);
});

test("failed promotion keeps the candidate reviewable for retry", async () => {
  const snapshot = { conversionId: "conversion-4", projectId: "p", projectRevision: "r", capturedAt: "t", engine: {}, textFiles: [], assets: [] };
  const transaction = createConversionTransaction(snapshot);
  transaction.stage({ ...snapshot, textFiles: [{ path: "tv.html", content: "candidate" }] });
  await assert.rejects(() => transaction.promote(async () => { throw new Error("storage unavailable"); }), /storage unavailable/);
  assert.equal(transaction.status, "review");
  await transaction.promote(async (candidate) => candidate.textFiles[0].content);
  assert.equal(transaction.status, "accepted");
});

test("retries reuse one conversion transaction by id", () => {
  const snapshot = { conversionId: "conversion-5", projectId: "p", projectRevision: "r", capturedAt: "t", engine: {}, textFiles: [], assets: [] };
  const registry = createConversionRegistry();
  assert.equal(registry.start(snapshot), registry.start({ ...snapshot, projectRevision: "newer" }));
  registry.remove(snapshot.conversionId);
  assert.equal(registry.get(snapshot.conversionId), null);
});
