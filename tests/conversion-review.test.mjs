import test from "node:test";
import assert from "node:assert/strict";
import { createConversionReview } from "../lib/conversion-review.mjs";

test("conversion review exposes isolated TV and phone candidate previews", () => {
  const review = createConversionReview({ conversionId: "c-1", projectId: "p-1", candidateRevision: "r-2" });
  assert.deepEqual(review.previewUrls("https://atg.test/"), {
    tv: "https://atg.test/tv/p-1?conversion=c-1&revision=r-2",
    phone: "https://atg.test/join/p-1?conversion=c-1&revision=r-2"
  });
});

test("blocking errors prevent acceptance while warnings require acknowledgment", () => {
  const review = createConversionReview({ conversionId: "c-2", projectId: "p", candidateRevision: "r", warnings: ["Audio fallback"], blockingErrors: [] });
  assert.equal(review.canAccept(), false);
  assert.throws(() => review.accept(), /Acknowledge conversion warnings/);
  review.acknowledgeWarnings();
  assert.equal(review.canAccept(), true);
  assert.deepEqual(review.accept(), { conversionId: "c-2", candidateRevision: "r" });

  const blocked = createConversionReview({ conversionId: "c-3", projectId: "p", candidateRevision: "r", blockingErrors: ["Runtime failed"] });
  assert.equal(blocked.canAccept(), false);
  assert.throws(() => blocked.accept(), /Blocking conversion errors/);
});

test("cancel restores the legacy path and failed reviews can retry", () => {
  const cancelled = createConversionReview({ conversionId: "c-4", projectId: "p", candidateRevision: "r" });
  assert.deepEqual(cancelled.cancel(), { conversionId: "c-4" });
  assert.throws(() => cancelled.accept(), /already cancelled/);

  const retry = createConversionReview({ conversionId: "c-5", projectId: "p", candidateRevision: "r" });
  retry.fail();
  retry.retry();
  assert.equal(retry.retryCount, 1);
  assert.equal(retry.status, "review");
});
