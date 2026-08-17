import test from "node:test";
import assert from "node:assert/strict";
import { createMediaJob, MEDIA_PROVIDERS, runMediaJob } from "../lib/media-generation.mjs";

test("media jobs support image and sound-effect providers but exclude video and music", () => {
  assert.deepEqual(MEDIA_PROVIDERS.image, ["openai-image"]);
  assert.deepEqual(MEDIA_PROVIDERS["sound-effect"], ["openai-sfx"]);
  assert.throws(() => createMediaJob({ kind: "video", provider: "openai-video", projectId: "p", prompt: "x" }), /Unsupported/);
});

test("jobs report progress, reconcile billing, and store auditable provenance", async () => {
  const job = createMediaJob({ kind: "image", provider: "openai-image", projectId: "p", prompt: "A blue tide", referenceConsent: true });
  const progress = [];
  let reconciled = false;
  await runMediaJob(job, {
    generate: async () => ({ bytes: Buffer.from("png"), contentType: "image/png" }),
    moderate: async () => ({ allowed: true, label: "safe" }),
    store: async ({ provenance }) => ({ path: "assets/generated.png", provenance }),
    billing: { reserve: async () => "reservation", reconcile: async () => { reconciled = true; } },
    onProgress: (event) => progress.push(event.message)
  });
  assert.equal(job.status, "completed");
  assert.equal(reconciled, true);
  assert.ok(progress.includes("Media is ready."));
  assert.equal(job.result.provenance.provider, "openai-image");
  assert.equal(job.result.provenance.creatorConsent.referenceAssets, true);
});

test("moderation failures and generation cancellation never store partial assets", async () => {
  let stored = false;
  let released = false;
  const blocked = createMediaJob({ kind: "sound-effect", provider: "openai-sfx", projectId: "p", prompt: "short buzzer" });
  await runMediaJob(blocked, { generate: async () => Buffer.from("audio"), moderate: async () => ({ allowed: false, reason: "unsafe" }), store: async () => { stored = true; }, billing: { reserve: async () => "r", release: async () => { released = true; } } });
  assert.equal(blocked.status, "failed");
  assert.equal(stored, false);
  assert.equal(released, true);

  const controller = new AbortController();
  controller.abort();
  const cancelled = createMediaJob({ kind: "sound-effect", provider: "openai-sfx", projectId: "p", prompt: "buzzer" });
  await runMediaJob(cancelled, { generate: async () => Buffer.from("audio"), store: async () => { throw new Error("must not store"); }, signal: controller.signal });
  assert.equal(cancelled.status, "cancelled");
});
