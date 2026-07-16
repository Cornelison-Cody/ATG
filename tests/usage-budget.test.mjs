import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function loadStore() {
  const root = await mkdtemp(path.join(os.tmpdir(), "atg-usage-budget-test-"));
  const previous = process.env.ATG_DATA_ROOT;
  process.env.ATG_DATA_ROOT = root;
  const store = await import(`../lib/usage-budget.mjs?test=${Date.now()}-${Math.random()}`);
  return {
    root,
    store,
    async cleanup() {
      if (previous === undefined) delete process.env.ATG_DATA_ROOT;
      else process.env.ATG_DATA_ROOT = previous;
      await rm(root, { recursive: true, force: true });
    }
  };
}

test("monthly budgets validate and summarize without enforcing edits", async () => {
  const { store, cleanup } = await loadStore();
  try {
    assert.equal(store.normalizeMonthlyBudget("12.34567"), 12.3457);
    assert.throws(() => store.normalizeMonthlyBudget(-1), /cannot be negative/);
    assert.throws(() => store.normalizeMonthlyBudget(Number.POSITIVE_INFINITY), /finite/);
    assert.throws(() => store.normalizeMonthlyBudget(10001), /too large/);

    await store.saveMonthlyBudget("user-a", "5");
    const summary = await store.getUsageBudgetSummary("user-a", new Date("2026-07-15T12:00:00Z"));
    assert.equal(summary.budget.monthlyBudgetUsd, 5);
    assert.equal(summary.budget.remainingBudgetUsd, 5);
    assert.equal(summary.period.key, "2026-07");
    assert.equal(summary.period.startAt, "2026-07-01T00:00:00.000Z");
    assert.equal(summary.period.resetAt, "2026-08-01T00:00:00.000Z");
  } finally {
    await cleanup();
  }
});

test("known model usage is priced, aggregated monthly, and idempotent", async () => {
  const { store, cleanup } = await loadStore();
  try {
    await store.saveMonthlyBudget("user-a", 1);
    const usage = {
      cached_input_tokens: 100,
      input_tokens: 1000,
      output_tokens: 50,
      reasoning_output_tokens: 20
    };

    const first = await store.recordCodexUsage({
      idempotencyKey: "job-1",
      model: "gpt-5.3-codex",
      projectId: "project-a",
      timestamp: "2026-07-02T01:00:00Z",
      usage,
      userId: "user-a"
    });
    const duplicate = await store.recordCodexUsage({
      idempotencyKey: "job-1",
      model: "gpt-5.3-codex",
      projectId: "project-a",
      timestamp: "2026-07-02T01:00:00Z",
      usage,
      userId: "user-a"
    });

    assert.equal(first.recorded, true);
    assert.equal(duplicate.recorded, false);
    assert.equal(duplicate.reason, "duplicate");

    const summary = await store.getUsageBudgetSummary("user-a", new Date("2026-07-20T00:00:00Z"));
    assert.equal(summary.totals.recordCount, 1);
    assert.equal(summary.totals.inputTokens, 1000);
    assert.equal(summary.totals.cachedInputTokens, 100);
    assert.equal(summary.totals.outputTokens, 50);
    assert.equal(summary.totals.reasoningOutputTokens, 20);
    assert.equal(summary.totals.estimatedRecords, 1);
    assert.equal(summary.totals.unpricedRecords, 0);
    assert.equal(summary.totals.estimatedSpendUsd, 0.0023);
    assert.equal(summary.budget.remainingBudgetUsd, 0.9977);
  } finally {
    await cleanup();
  }
});

test("unknown models keep token totals without inventing a cost", async () => {
  const { store, cleanup } = await loadStore();
  try {
    await store.recordCodexUsage({
      idempotencyKey: "job-2",
      model: "future-codex",
      projectId: "project-a",
      timestamp: "2026-07-03T01:00:00Z",
      usage: { input_tokens: 120, output_tokens: 12 },
      userId: "user-a"
    });

    const summary = await store.getUsageBudgetSummary("user-a", new Date("2026-07-20T00:00:00Z"));
    assert.equal(summary.totals.recordCount, 1);
    assert.equal(summary.totals.inputTokens, 120);
    assert.equal(summary.totals.estimatedSpendUsd, 0);
    assert.equal(summary.totals.estimatedRecords, 0);
    assert.equal(summary.totals.unpricedRecords, 1);
    assert.equal(summary.recentUsage[0].cost.estimatedUsd, null);
  } finally {
    await cleanup();
  }
});

test("usage summaries are isolated by user and month", async () => {
  const { store, cleanup } = await loadStore();
  try {
    await store.recordCodexUsage({
      idempotencyKey: "july-a",
      model: "gpt-5.3-codex",
      projectId: "project-a",
      timestamp: "2026-07-03T01:00:00Z",
      usage: { input_tokens: 100, output_tokens: 10 },
      userId: "user-a"
    });
    await store.recordCodexUsage({
      idempotencyKey: "august-a",
      model: "gpt-5.3-codex",
      projectId: "project-a",
      timestamp: "2026-08-03T01:00:00Z",
      usage: { input_tokens: 200, output_tokens: 20 },
      userId: "user-a"
    });
    await store.recordCodexUsage({
      idempotencyKey: "july-b",
      model: "gpt-5.3-codex",
      projectId: "project-b",
      timestamp: "2026-07-03T01:00:00Z",
      usage: { input_tokens: 300, output_tokens: 30 },
      userId: "user-b"
    });

    const julyUserA = await store.getUsageBudgetSummary("user-a", new Date("2026-07-15T00:00:00Z"));
    const augustUserA = await store.getUsageBudgetSummary("user-a", new Date("2026-08-15T00:00:00Z"));
    const julyUserB = await store.getUsageBudgetSummary("user-b", new Date("2026-07-15T00:00:00Z"));

    assert.equal(julyUserA.totals.inputTokens, 100);
    assert.equal(augustUserA.totals.inputTokens, 200);
    assert.equal(julyUserB.totals.inputTokens, 300);
  } finally {
    await cleanup();
  }
});

test("managed AI credit reserves, reconciles, and summarizes monthly allowance", async () => {
  const { store, cleanup } = await loadStore();
  try {
    const initial = await store.getManagedAiCreditSummary("user-a", new Date("2026-07-20T00:00:00Z"));
    assert.equal(initial.monthlyCreditUsd, 5);
    assert.equal(initial.reservationUsd, 0.25);
    assert.equal(initial.remainingCreditUsd, 5);

    const reservation = await store.reserveManagedAiCredit({
      projectId: "project-a",
      reservationId: "reservation-a",
      timestamp: "2026-07-20T00:00:00Z",
      userId: "user-a"
    });
    const duplicate = await store.reserveManagedAiCredit({
      projectId: "project-a",
      reservationId: "reservation-a",
      timestamp: "2026-07-20T00:00:00Z",
      userId: "user-a"
    });
    assert.equal(reservation.status, "reserved");
    assert.equal(duplicate.status, "reserved");

    const reserved = await store.getManagedAiCreditSummary("user-a", new Date("2026-07-20T00:00:00Z"));
    assert.equal(reserved.reservedUsd, 0.25);
    assert.equal(reserved.remainingCreditUsd, 4.75);

    await store.reconcileManagedAiReservation({
      model: "gpt-5.3-codex",
      reservationId: "reservation-a",
      usage: { cached_input_tokens: 0, input_tokens: 1000, output_tokens: 100 },
      userId: "user-a"
    });
    const reconciled = await store.getManagedAiCreditSummary("user-a", new Date("2026-07-20T00:00:00Z"));
    assert.equal(reconciled.reservedUsd, 0);
    assert.equal(reconciled.spentUsd, 0.0032);
    assert.equal(reconciled.remainingCreditUsd, 4.9968);
  } finally {
    await cleanup();
  }
});

test("managed AI credit releases failed reservations and isolates users", async () => {
  const { store, cleanup } = await loadStore();
  try {
    await store.reserveManagedAiCredit({
      amountUsd: 4.9,
      projectId: "project-a",
      reservationId: "reservation-a",
      userId: "user-a"
    });
    await assert.rejects(
      store.reserveManagedAiCredit({
        amountUsd: 0.2,
        projectId: "project-a",
        reservationId: "reservation-b",
        userId: "user-a"
      }),
      /credit is exhausted/
    );
    await store.releaseManagedAiReservation({
      reason: "failed-start",
      reservationId: "reservation-a",
      userId: "user-a"
    });
    const userA = await store.getManagedAiCreditSummary("user-a");
    const userB = await store.getManagedAiCreditSummary("user-b");
    assert.equal(userA.remainingCreditUsd, 5);
    assert.equal(userB.remainingCreditUsd, 5);
  } finally {
    await cleanup();
  }
});
