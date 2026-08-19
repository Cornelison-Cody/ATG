import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = await mkdtemp(path.join(os.tmpdir(), "atg-media-lease-"));
process.env.ATG_STORAGE_BACKEND = "local"; process.env.ATG_STATE_ROOT = root;
const store = await import("../lib/media-job-store.mjs");
test.after(() => rm(root, { recursive: true, force: true }));
test("media jobs have restart-recoverable ownership leases", async () => {
  await store.createMediaJobRecord({ id: "lease", projectId: "p", status: "queued", updatedAt: new Date().toISOString() });
  assert.ok(await store.claimMediaJob("lease", "worker-a", 60_000));
  assert.equal(await store.claimMediaJob("lease", "worker-b", 60_000), null);
  await store.releaseMediaJobLease("lease", "worker-a");
  assert.ok(await store.claimMediaJob("lease", "worker-b", 60_000));
});
