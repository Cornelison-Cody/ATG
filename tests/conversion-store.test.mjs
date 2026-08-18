import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const stateRoot = await mkdtemp(path.join(os.tmpdir(), "atg-conversion-store-"));
process.env.ATG_STORAGE_BACKEND = "local";
process.env.ATG_STATE_ROOT = stateRoot;

const store = await import("../lib/conversion-store.mjs");

test.after(async () => {
  await rm(stateRoot, { recursive: true, force: true });
});

test("conversion records persist candidates and lifecycle transitions", async () => {
  const snapshot = { projectId: "project-1", fingerprint: "published-r1", textFiles: [], assets: [], identity: {} };
  const created = await store.createOrGetConversion({ conversionId: "conversion-1", projectId: "project-1", snapshot });
  assert.equal(created.status, "queued");
  assert.equal((await store.getConversion("conversion-1")).status, "queued");

  await store.markConversionRunning("conversion-1");
  await store.saveConversionCandidate("conversion-1", { textFiles: [{ path: "game.js", content: "candidate" }] });
  const review = await store.getConversion("conversion-1");
  assert.equal(review.status, "review");
  assert.equal(review.candidate.textFiles[0].content, "candidate");

  await store.cancelConversion("conversion-1");
  const cancelled = await store.getConversion("conversion-1");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.candidate, null);

  const persisted = JSON.parse(await readFile(path.join(stateRoot, "conversions.json"), "utf8"));
  assert.equal(persisted.records["conversion-1"].status, "cancelled");
});

test("failed conversions can be retried idempotently and accepted records cannot be cancelled", async () => {
  const snapshot = { projectId: "project-2", fingerprint: "published-r2", textFiles: [], assets: [], identity: {} };
  await store.createOrGetConversion({ conversionId: "conversion-2", projectId: "project-2", snapshot });
  await store.markConversionRunning("conversion-2");
  await store.failConversion("conversion-2", "worker stopped");
  await store.retryConversion("conversion-2");
  assert.equal((await store.getConversion("conversion-2")).status, "queued");
  await store.markConversionRunning("conversion-2");
  await store.saveConversionCandidate("conversion-2", { textFiles: [] });
  await store.acceptConversion("conversion-2");
  await assert.rejects(() => store.cancelConversion("conversion-2"), /cannot be cancelled/);
});

test("conversion route keeps successful Codex output out of published writes", async () => {
  const route = await readFile(new URL("../app/api/codex-jobs/[jobId]/complete/route.ts", import.meta.url), "utf8");
  assert.match(route, /typeof record\.conversionId === "string"/);
  assert.match(route, /completeConversion\(record\.conversionId/);
  assert.match(route, /updateGameTextFiles\(project/);
});
