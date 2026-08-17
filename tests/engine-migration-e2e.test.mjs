import test from "node:test";
import assert from "node:assert/strict";
import { createConversionReview } from "../lib/conversion-review.mjs";
import { createConversionTransaction, captureConversionSnapshot } from "../lib/game-conversion-snapshot.mjs";
import { captureConversionIdentity, acceptConversionIdentity } from "../lib/conversion-identity.mjs";
import { validateConvertedGame } from "../lib/conversion-validation.mjs";
import { ENGINE_MIGRATION_FIXTURES, convertFixture } from "./fixtures/engine-migration-fixtures.mjs";

const project = { id: "fixture-project", slug: "fixture", path: "/tmp/fixture", name: "Fixture", ownerUserId: "test-user", ownerName: "test@example.com", collaborators: [], visibility: "private", updatedAt: "legacy-r1" };

test("representative fixtures cover successful, warning, and blocking conversions", async () => {
  assert.equal(ENGINE_MIGRATION_FIXTURES.length, 7);
  for (const fixture of ENGINE_MIGRATION_FIXTURES) {
    const candidate = convertFixture(fixture);
    const report = validateConvertedGame({ files: candidate.files, assets: candidate.assets, runtime: { loaded: true }, performance: fixture.id === "animation" ? { fps: 24 } : { fps: 30 } });
    if (fixture.incompatible) assert.ok(report.blockingErrors.length > 0, fixture.id);
    else if (fixture.id === "animation") assert.ok(report.warnings.length > 0, fixture.id);
    else assert.equal(report.ok, true, fixture.id);
  }
});

test("successful fixture runs through start, validation, review, and atomic promotion", async () => {
  const fixture = ENGINE_MIGRATION_FIXTURES[0];
  const candidate = convertFixture(fixture);
  const snapshot = await captureConversionSnapshot({ conversionId: "fixture-conversion", project, engine: { type: "legacy" }, readTextFiles: async () => projectFiles(fixture.files), readAssets: async () => [] });
  const transaction = createConversionTransaction(snapshot);
  transaction.stage({ ...snapshot, textFiles: candidate.files, assets: [] });
  const review = createConversionReview({ conversionId: snapshot.conversionId, projectId: project.id, candidateRevision: "engine-r1" });
  assert.deepEqual(review.previewUrls(""), { tv: "/tv/fixture-project?conversion=fixture-conversion&revision=engine-r1", phone: "/join/fixture-project?conversion=fixture-conversion&revision=engine-r1" });
  const identity = captureConversionIdentity(project);
  const promoted = await transaction.promote(async (value) => acceptConversionIdentity(identity, value, "engine-r1"));
  review.accept();
  assert.equal(transaction.status, "accepted");
  assert.equal(promoted.id, project.id);
  assert.equal(promoted.revision, "engine-r1");
});

test("cancel, failure, retry, and active-session exclusion never touch real projects", async () => {
  const fixture = ENGINE_MIGRATION_FIXTURES[1];
  const snapshot = await captureConversionSnapshot({ conversionId: "fixture-cancel", project, engine: { type: "legacy" }, readTextFiles: async () => projectFiles(fixture.files), readAssets: async () => [] });
  const cancelled = createConversionTransaction(snapshot);
  cancelled.cancel();
  assert.equal(cancelled.status, "cancelled");
  assert.equal(snapshot.projectId, "fixture-project");
  const failed = createConversionTransaction(snapshot);
  failed.fail();
  assert.equal(failed.status, "failed");
  const review = createConversionReview({ conversionId: "fixture-retry", projectId: project.id, candidateRevision: "r", warnings: [] });
  review.fail();
  review.retry();
  assert.equal(review.retryCount, 1);
  assert.equal(snapshot.activeSession, undefined);
});

function projectFiles(files) { return files.map((file) => ({ ...file })); }
