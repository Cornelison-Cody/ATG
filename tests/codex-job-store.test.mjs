import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("job credentials are hashed, expire on completion, and completion is idempotent", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atg-job-store-test-"));
  const previous = process.env.ATG_DATA_ROOT;
  process.env.ATG_DATA_ROOT = root;
  const store = await import(`../lib/codex-job-store.mjs?test=${Date.now()}`);

  try {
    const { job, token } = await store.createCodexJob({
      editingTarget: "tv",
      files: [{ path: "tv.html", content: "before" }],
      projectId: "project-a",
      prompt: "Update.",
      userId: "user-a"
    });
    await store.appendCodexJobEvent(job.id, token, { type: "status", message: "Running." });
    await store.claimCodexJobCompletion(job.id, token);
    await assert.rejects(
      store.claimCodexJobCompletion(job.id, token),
      /already being processed/
    );
    await store.completeCodexJob(job.id, token, {
      ok: true,
      files: [{ path: "tv.html", content: "after" }],
      finalMessage: "Done."
    });

    await assert.rejects(
      store.completeCodexJob(job.id, token, { ok: true, files: [], finalMessage: "Again." }),
      /authentication failed/
    );
    const raw = await readFile(path.join(root, ".atg", "codex-jobs.json"), "utf8");
    assert.equal(raw.includes(token), false);
    assert.equal(raw.includes("user-a"), true);
    assert.equal((await store.getCodexJob(job.id)).status, "done");
  } finally {
    if (previous === undefined) delete process.env.ATG_DATA_ROOT;
    else process.env.ATG_DATA_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  }
});
