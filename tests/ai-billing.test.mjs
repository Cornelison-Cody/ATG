import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = await mkdtemp(path.join(os.tmpdir(), "atg-ai-billing-test-"));
const previousDataRoot = process.env.ATG_DATA_ROOT;
const previousEnabled = process.env.ATG_MANAGED_AI_ENABLED;
const previousManagedKey = process.env.ATG_MANAGED_OPENAI_API_KEY;
process.env.ATG_DATA_ROOT = root;

const billing = await import("../lib/ai-billing.mjs");
const settings = await import("../lib/user-settings.mjs");
const usage = await import("../lib/usage-budget.mjs");

test.after(async () => {
  if (previousDataRoot === undefined) delete process.env.ATG_DATA_ROOT;
  else process.env.ATG_DATA_ROOT = previousDataRoot;
  if (previousEnabled === undefined) delete process.env.ATG_MANAGED_AI_ENABLED;
  else process.env.ATG_MANAGED_AI_ENABLED = previousEnabled;
  if (previousManagedKey === undefined) delete process.env.ATG_MANAGED_OPENAI_API_KEY;
  else process.env.ATG_MANAGED_OPENAI_API_KEY = previousManagedKey;
  await rm(root, { recursive: true, force: true });
});

test("managed AI requires kill switch and managed key", async () => {
  delete process.env.ATG_MANAGED_AI_ENABLED;
  delete process.env.ATG_MANAGED_OPENAI_API_KEY;
  await assert.rejects(
    billing.prepareAiBillingForRun({ projectId: "project-a", userId: "billing-user-a" }),
    /temporarily disabled/
  );

  process.env.ATG_MANAGED_AI_ENABLED = "true";
  await assert.rejects(
    billing.prepareAiBillingForRun({ projectId: "project-a", userId: "billing-user-a" }),
    /not configured/
  );
});

test("managed AI reserves credit and BYOK uses only personal keys", async () => {
  process.env.ATG_MANAGED_AI_ENABLED = "true";
  process.env.ATG_MANAGED_OPENAI_API_KEY = "sk-managed";

  const managed = await billing.prepareAiBillingForRun({
    projectId: "project-a",
    reservationId: "reservation-a",
    userId: "billing-user-b"
  });
  assert.equal(managed.billingMode, "managed");
  assert.equal(managed.apiKey, "sk-managed");
  assert.equal((await usage.getManagedAiCreditSummary("billing-user-b")).remainingCreditUsd, 4.75);

  await settings.saveUserApiKey("billing-user-b", "sk-user");
  await settings.saveUserAiBillingMode("billing-user-b", "byok");
  const byok = await billing.prepareAiBillingForRun({
    projectId: "project-a",
    reservationId: "reservation-b",
    userId: "billing-user-b"
  });
  assert.equal(byok.billingMode, "byok");
  assert.equal(byok.apiKey, "sk-user");
  assert.equal(byok.reservationId, "");
});
