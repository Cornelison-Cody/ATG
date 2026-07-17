import { CosmosClient } from "@azure/cosmos";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const localPath = path.join(
  process.env.ATG_STATE_ROOT || path.join(process.env.ATG_DATA_ROOT || process.cwd(), ".atg"),
  "ai-usage-budget.json"
);
const containerName = process.env.AZURE_COSMOS_AI_USAGE_CONTAINER || "ai-usage-budget";
const MAX_MONTHLY_BUDGET_USD = 10_000;
const DEFAULT_MANAGED_MONTHLY_CREDIT_USD = 5;
const DEFAULT_MANAGED_RESERVATION_USD = 0.25;
let localQueue = Promise.resolve();

export const PRICING_VERSION = "2026-07-15";
export const PRICING_SOURCE_URL = "https://developers.openai.com/api/docs/pricing";

const pricingTable = {
  "gpt-5.3-codex": {
    cachedInputUsdPerMillion: 0.175,
    inputUsdPerMillion: 1.75,
    outputUsdPerMillion: 14,
    version: PRICING_VERSION
  }
};

export async function recordCodexUsage(input) {
  const usage = normalizeUsage(input?.usage);
  if (!usage) {
    return { recorded: false, reason: "missing-usage" };
  }

  const userId = normalizeString(input.userId);
  const projectId = normalizeString(input.projectId);
  const idempotencyKey = normalizeString(input.idempotencyKey || input.jobId);
  if (!userId || !projectId || !idempotencyKey) {
    throw new UsageBudgetError("Usage records require userId, projectId, and idempotencyKey.", 400);
  }

  const model = normalizeString(input.model) || "unknown";
  const now = input.timestamp ? new Date(input.timestamp) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new UsageBudgetError("Usage timestamp is invalid.", 400);
  }

  const price = priceForModel(model);
  const record = {
    id: usageDocumentId(userId, idempotencyKey),
    type: "ai-usage",
    cachedInputTokens: usage.cached_input_tokens,
    cost: calculateCost(usage, price),
    createdAt: now.toISOString(),
    idempotencyKey,
    inputTokens: usage.input_tokens,
    model,
    outputTokens: usage.output_tokens,
    periodKey: utcMonthKey(now),
    pricingSourceUrl: PRICING_SOURCE_URL,
    pricingVersion: price?.version || PRICING_VERSION,
    projectId,
    reasoningOutputTokens: usage.reasoning_output_tokens,
    source: normalizeString(input.source) || "codex-sdk",
    userIdHash: userDocumentId(userId)
  };

  const existing = await readUsageRecord(record.id);
  if (existing) {
    return { recorded: false, reason: "duplicate", record: publicUsageRecord(existing) };
  }

  await saveUsageRecord(record);
  return { recorded: true, record: publicUsageRecord(record) };
}

export async function getUsageBudgetSummary(userId, now = new Date()) {
  const period = periodFor(now);
  const [budget, records] = await Promise.all([
    readBudgetRecord(userId),
    listUsageRecords(userId, period.key)
  ]);

  const totals = records.reduce((sum, record) => {
    sum.cachedInputTokens += safeInteger(record.cachedInputTokens);
    sum.inputTokens += safeInteger(record.inputTokens);
    sum.outputTokens += safeInteger(record.outputTokens);
    sum.reasoningOutputTokens += safeInteger(record.reasoningOutputTokens);
    if (record.cost?.estimatedUsd != null) {
      sum.estimatedSpendUsd += record.cost.estimatedUsd;
      sum.estimatedRecords += 1;
    } else {
      sum.unpricedRecords += 1;
    }
    return sum;
  }, {
    cachedInputTokens: 0,
    estimatedRecords: 0,
    estimatedSpendUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    unpricedRecords: 0
  });

  const monthlyBudgetUsd = budget?.monthlyBudgetUsd ?? null;
  const remainingBudgetUsd = monthlyBudgetUsd == null
    ? null
    : Math.max(0, monthlyBudgetUsd - totals.estimatedSpendUsd);
  const consumedPercent = monthlyBudgetUsd == null || monthlyBudgetUsd === 0
    ? null
    : Math.min(999, (totals.estimatedSpendUsd / monthlyBudgetUsd) * 100);

  return {
    budget: {
      consumedPercent: consumedPercent == null ? null : roundDisplay(consumedPercent),
      monthlyBudgetUsd,
      remainingBudgetUsd: remainingBudgetUsd == null ? null : roundCurrency(remainingBudgetUsd)
    },
    lastUpdatedAt: latestTimestamp(records) || budget?.updatedAt || null,
    period,
    pricing: {
      sourceUrl: PRICING_SOURCE_URL,
      version: PRICING_VERSION
    },
    recentUsage: records
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 6)
      .map(publicUsageRecord),
    totals: {
      cachedInputTokens: totals.cachedInputTokens,
      estimatedRecords: totals.estimatedRecords,
      estimatedSpendUsd: roundCurrency(totals.estimatedSpendUsd),
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      reasoningOutputTokens: totals.reasoningOutputTokens,
      recordCount: records.length,
      unpricedRecords: totals.unpricedRecords
    },
    valuesAreEstimated: true
  };
}

export async function getManagedAiCreditSummary(userId, now = new Date()) {
  const period = periodFor(now);
  const state = await readManagedPeriodState(userId, period.key);
  const monthlyCreditUsd = getManagedMonthlyCreditUsd();
  const reservedUsd = roundCurrency(state?.reservedUsd || 0);
  const spentUsd = roundCurrency(state?.spentUsd || 0);
  const grantUsd = roundCurrency(state?.grantUsd ?? monthlyCreditUsd);
  const remainingCreditUsd = Math.max(0, roundCurrency(grantUsd - reservedUsd - spentUsd));
  return {
    monthlyCreditUsd,
    period,
    remainingCreditUsd,
    reservationUsd: getManagedReservationUsd(),
    reservedUsd,
    spentUsd
  };
}

export async function reserveManagedAiCredit(input) {
  const userId = normalizeString(input?.userId);
  const projectId = normalizeString(input?.projectId);
  const reservationId = normalizeString(input?.reservationId || input?.idempotencyKey);
  if (!userId || !projectId || !reservationId) {
    throw new UsageBudgetError("Managed AI reservation requires userId, projectId, and reservationId.", 400);
  }
  const now = input.timestamp ? new Date(input.timestamp) : new Date();
  const period = periodFor(now);
  const amountUsd = normalizeManagedAmount(input.amountUsd ?? getManagedReservationUsd());

  if (useAzure()) {
    return reserveManagedAiCreditAzure({ amountUsd, now, period, projectId, reservationId, userId });
  }
  return updateLocalManagedReservation({ amountUsd, now, period, projectId, reservationId, userId });
}

export async function reconcileManagedAiReservation(input) {
  const userId = normalizeString(input?.userId);
  const reservationId = normalizeString(input?.reservationId);
  if (!userId || !reservationId) {
    throw new UsageBudgetError("Managed AI reconciliation requires userId and reservationId.", 400);
  }
  const reservation = await readManagedLedgerRecord(managedLedgerId(userId, reservationId, "reservation"));
  if (!reservation) {
    throw new UsageBudgetError("Managed AI reservation was not found.", 404);
  }
  if (reservation.status === "reconciled") {
    return publicManagedReservation(reservation);
  }
  if (reservation.status === "released") {
    throw new UsageBudgetError("Managed AI reservation was already released.", 409);
  }

  const cost = estimateUsageCost(input.usage, input.model);
  const actualUsd = cost?.estimatedUsd == null
    ? safeMoney(reservation.reservedUsd)
    : roundCurrency(cost.estimatedUsd);

  if (useAzure()) {
    await updateManagedPeriodStateAzure(
      userId,
      reservation.periodKey,
      (state) => {
        state.reservedUsd = roundCurrency(Math.max(0, safeMoney(state.reservedUsd) - safeMoney(reservation.reservedUsd)));
        state.spentUsd = roundCurrency(safeMoney(state.spentUsd) + actualUsd);
        return state;
      }
    );
    reservation.actualUsd = actualUsd;
    reservation.reconciledAt = new Date().toISOString();
    reservation.status = "reconciled";
    await saveManagedLedgerRecord(reservation);
    return publicManagedReservation(reservation);
  }

  await updateLocal((database) => {
    const localReservation = database.managedLedger[reservation.id];
    if (!localReservation || localReservation.status !== "reserved") return;
    const state = ensureManagedPeriodState(database, userId, reservation.periodKey);
    state.reservedUsd = roundCurrency(Math.max(0, safeMoney(state.reservedUsd) - safeMoney(localReservation.reservedUsd)));
    state.spentUsd = roundCurrency(safeMoney(state.spentUsd) + actualUsd);
    localReservation.actualUsd = actualUsd;
    localReservation.reconciledAt = new Date().toISOString();
    localReservation.status = "reconciled";
  });
  return publicManagedReservation(await readManagedLedgerRecord(reservation.id));
}

export async function releaseManagedAiReservation(input) {
  const userId = normalizeString(input?.userId);
  const reservationId = normalizeString(input?.reservationId);
  if (!userId || !reservationId) {
    throw new UsageBudgetError("Managed AI release requires userId and reservationId.", 400);
  }
  const reservation = await readManagedLedgerRecord(managedLedgerId(userId, reservationId, "reservation"));
  if (!reservation || reservation.status === "released") {
    return { released: false };
  }
  if (reservation.status === "reconciled") {
    return { released: false, reason: "already-reconciled" };
  }

  if (useAzure()) {
    await updateManagedPeriodStateAzure(
      userId,
      reservation.periodKey,
      (state) => {
        state.reservedUsd = roundCurrency(Math.max(0, safeMoney(state.reservedUsd) - safeMoney(reservation.reservedUsd)));
        return state;
      }
    );
    reservation.releasedAt = new Date().toISOString();
    reservation.releaseReason = normalizeString(input.reason) || "released";
    reservation.status = "released";
    await saveManagedLedgerRecord(reservation);
    return { released: true };
  }

  await updateLocal((database) => {
    const localReservation = database.managedLedger[reservation.id];
    if (!localReservation || localReservation.status !== "reserved") return;
    const state = ensureManagedPeriodState(database, userId, reservation.periodKey);
    state.reservedUsd = roundCurrency(Math.max(0, safeMoney(state.reservedUsd) - safeMoney(localReservation.reservedUsd)));
    localReservation.releasedAt = new Date().toISOString();
    localReservation.releaseReason = normalizeString(input.reason) || "released";
    localReservation.status = "released";
  });
  return { released: true };
}

export function getManagedMonthlyCreditUsd() {
  return normalizeManagedAmount(process.env.ATG_MANAGED_AI_MONTHLY_CREDIT_USD || DEFAULT_MANAGED_MONTHLY_CREDIT_USD);
}

export function getManagedReservationUsd() {
  return normalizeManagedAmount(process.env.ATG_MANAGED_AI_RESERVATION_USD || DEFAULT_MANAGED_RESERVATION_USD);
}

export async function saveMonthlyBudget(userId, value) {
  const monthlyBudgetUsd = normalizeMonthlyBudget(value);
  const now = new Date().toISOString();
  const record = {
    id: userDocumentId(userId),
    monthlyBudgetUsd,
    type: "ai-budget",
    updatedAt: now
  };
  await saveBudgetRecord(record);
  return record;
}

export async function deleteMonthlyBudget(userId) {
  await deleteBudgetRecord(userId);
}

export function normalizeMonthlyBudget(value) {
  const amount = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isFinite(amount)) {
    throw new UsageBudgetError("Monthly budget must be a finite dollar amount.", 400);
  }
  if (amount < 0) {
    throw new UsageBudgetError("Monthly budget cannot be negative.", 400);
  }
  if (amount > MAX_MONTHLY_BUDGET_USD) {
    throw new UsageBudgetError("Monthly budget is too large.", 400);
  }
  return roundCurrency(amount);
}

export function normalizeManagedAmount(value) {
  const amount = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new UsageBudgetError("Managed AI amount must be a non-negative dollar amount.", 400);
  }
  if (amount > MAX_MONTHLY_BUDGET_USD) {
    throw new UsageBudgetError("Managed AI amount is too large.", 400);
  }
  return roundCurrency(amount);
}

export function estimateUsageCost(usage, model) {
  const normalized = normalizeUsage(usage);
  if (!normalized) return null;
  return calculateCost(normalized, priceForModel(model));
}

export function utcMonthKey(date = new Date()) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) {
    throw new UsageBudgetError("Date is invalid.", 400);
  }
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function periodFor(date = new Date()) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) {
    throw new UsageBudgetError("Date is invalid.", 400);
  }
  const start = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
  const reset = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1));
  return {
    endAt: reset.toISOString(),
    key: utcMonthKey(value),
    resetAt: reset.toISOString(),
    startAt: start.toISOString(),
    timezone: "UTC"
  };
}

export class UsageBudgetError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function calculateCost(usage, price) {
  if (!price) {
    return { estimatedUsd: null, modelPriceKnown: false };
  }
  const cachedInputTokens = Math.min(usage.cached_input_tokens, usage.input_tokens);
  const uncachedInputTokens = Math.max(0, usage.input_tokens - cachedInputTokens);
  const estimatedUsd = (
    (uncachedInputTokens * price.inputUsdPerMillion) +
    (cachedInputTokens * price.cachedInputUsdPerMillion) +
    (usage.output_tokens * price.outputUsdPerMillion)
  ) / 1_000_000;
  return {
    cachedInputUsdPerMillion: price.cachedInputUsdPerMillion,
    estimatedUsd,
    inputUsdPerMillion: price.inputUsdPerMillion,
    modelPriceKnown: true,
    outputUsdPerMillion: price.outputUsdPerMillion
  };
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const normalized = {
    cached_input_tokens: nonNegativeInteger(usage.cached_input_tokens),
    input_tokens: nonNegativeInteger(usage.input_tokens),
    output_tokens: nonNegativeInteger(usage.output_tokens),
    reasoning_output_tokens: nonNegativeInteger(usage.reasoning_output_tokens)
  };
  if (
    normalized.cached_input_tokens === 0 &&
    normalized.input_tokens === 0 &&
    normalized.output_tokens === 0 &&
    normalized.reasoning_output_tokens === 0
  ) {
    return null;
  }
  return normalized;
}

function nonNegativeInteger(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function priceForModel(model) {
  const key = normalizeString(model).toLowerCase();
  return pricingTable[key] || null;
}

function publicUsageRecord(record) {
  return {
    cachedInputTokens: safeInteger(record.cachedInputTokens),
    cost: record.cost?.estimatedUsd == null
      ? { estimatedUsd: null, modelPriceKnown: false }
      : {
          estimatedUsd: roundCurrency(record.cost.estimatedUsd),
          modelPriceKnown: true
        },
    createdAt: record.createdAt,
    inputTokens: safeInteger(record.inputTokens),
    model: record.model,
    outputTokens: safeInteger(record.outputTokens),
    pricingVersion: record.pricingVersion,
    projectId: record.projectId,
    reasoningOutputTokens: safeInteger(record.reasoningOutputTokens),
    source: record.source
  };
}

function latestTimestamp(records) {
  return records
    .map((record) => record.createdAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function roundDisplay(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function safeInteger(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;
}

async function readUsageRecord(id) {
  if (useAzure()) {
    try {
      const { resource } = await container().item(id, id).read();
      return resource || null;
    } catch (error) {
      if (error?.code === 404) return null;
      throw error;
    }
  }
  const database = await readLocal();
  return database.usage[id] || null;
}

async function saveUsageRecord(record) {
  if (useAzure()) {
    try {
      await container().items.create(record);
    } catch (error) {
      if (error?.code !== 409) {
        throw error;
      }
    }
    return;
  }
  await updateLocal((database) => {
    if (!database.usage[record.id]) {
      database.usage[record.id] = record;
    }
  });
}

async function listUsageRecords(userId, periodKey) {
  const userIdHash = userDocumentId(userId);
  if (useAzure()) {
    const query = {
      parameters: [
        { name: "@type", value: "ai-usage" },
        { name: "@userIdHash", value: userIdHash },
        { name: "@periodKey", value: periodKey }
      ],
      query: "SELECT * FROM c WHERE c.type = @type AND c.userIdHash = @userIdHash AND c.periodKey = @periodKey"
    };
    const { resources } = await container().items.query(query).fetchAll();
    return resources || [];
  }
  const database = await readLocal();
  return Object.values(database.usage)
    .filter((record) => record.userIdHash === userIdHash && record.periodKey === periodKey);
}

async function readBudgetRecord(userId) {
  const id = userDocumentId(userId);
  if (useAzure()) {
    try {
      const { resource } = await container().item(id, id).read();
      return resource?.type === "ai-budget" ? resource : null;
    } catch (error) {
      if (error?.code === 404) return null;
      throw error;
    }
  }
  const database = await readLocal();
  return database.budgets[id] || null;
}

async function saveBudgetRecord(record) {
  if (useAzure()) {
    await container().items.upsert(record);
    return;
  }
  await updateLocal((database) => {
    database.budgets[record.id] = record;
  });
}

async function deleteBudgetRecord(userId) {
  const id = userDocumentId(userId);
  if (useAzure()) {
    try {
      await container().item(id, id).delete();
    } catch (error) {
      if (error?.code !== 404) throw error;
    }
    return;
  }
  await updateLocal((database) => {
    delete database.budgets[id];
  });
}

async function reserveManagedAiCreditAzure(input) {
  const existing = await readManagedLedgerRecord(managedLedgerId(input.userId, input.reservationId, "reservation"));
  if (existing) {
    return publicManagedReservation(existing);
  }

  let reservation;
  await updateManagedPeriodStateAzure(
    input.userId,
    input.period.key,
    (state) => {
      const remaining = safeMoney(state.grantUsd) - safeMoney(state.reservedUsd) - safeMoney(state.spentUsd);
      if (remaining < input.amountUsd) {
        throw new UsageBudgetError("ATG-managed AI credit is exhausted. Switch to BYOK to continue.", 402);
      }
      state.reservedUsd = roundCurrency(safeMoney(state.reservedUsd) + input.amountUsd);
      reservation = buildManagedReservation(input);
      return state;
    }
  );
  await saveManagedLedgerRecord(reservation);
  return publicManagedReservation(reservation);
}

async function updateLocalManagedReservation(input) {
  let result;
  await updateLocal((database) => {
    const existing = database.managedLedger[managedLedgerId(input.userId, input.reservationId, "reservation")];
    if (existing) {
      result = publicManagedReservation(existing);
      return;
    }
    const state = ensureManagedPeriodState(database, input.userId, input.period.key);
    const remaining = safeMoney(state.grantUsd) - safeMoney(state.reservedUsd) - safeMoney(state.spentUsd);
    if (remaining < input.amountUsd) {
      throw new UsageBudgetError("ATG-managed AI credit is exhausted. Switch to BYOK to continue.", 402);
    }
    state.reservedUsd = roundCurrency(safeMoney(state.reservedUsd) + input.amountUsd);
    const reservation = buildManagedReservation(input);
    database.managedLedger[reservation.id] = reservation;
    database.managedLedger[managedLedgerId(input.userId, input.period.key, "grant")] ||= buildManagedGrant(input.userId, input.period.key);
    result = publicManagedReservation(reservation);
  });
  return result;
}

async function updateManagedPeriodStateAzure(userId, periodKey, mutate) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readManagedPeriodState(userId, periodKey);
    const state = current || buildManagedPeriodState(userId, periodKey);
    const next = mutate({ ...state });
    next.updatedAt = new Date().toISOString();
    try {
      if (current?._etag) {
        await container().item(state.id, state.id).replace(next, {
          accessCondition: { type: "IfMatch", condition: current._etag }
        });
      } else {
        await container().items.create(next);
        await saveManagedLedgerRecord(buildManagedGrant(userId, periodKey));
      }
      return next;
    } catch (error) {
      if (error?.code === 409 || error?.code === 412) {
        continue;
      }
      throw error;
    }
  }
  throw new UsageBudgetError("Unable to update managed AI credit safely. Try again.", 409);
}

async function readManagedPeriodState(userId, periodKey) {
  const id = managedPeriodId(userId, periodKey);
  if (useAzure()) {
    try {
      const { resource } = await container().item(id, id).read();
      return resource?.type === "managed-ai-period" ? resource : null;
    } catch (error) {
      if (error?.code === 404) return null;
      throw error;
    }
  }
  const database = await readLocal();
  return database.managedPeriods[id] || null;
}

async function readManagedLedgerRecord(id) {
  if (useAzure()) {
    try {
      const { resource } = await container().item(id, id).read();
      return resource?.type === "managed-ai-ledger" ? resource : null;
    } catch (error) {
      if (error?.code === 404) return null;
      throw error;
    }
  }
  const database = await readLocal();
  return database.managedLedger[id] || null;
}

async function saveManagedLedgerRecord(record) {
  if (useAzure()) {
    await container().items.upsert(record);
    return;
  }
  await updateLocal((database) => {
    database.managedLedger[record.id] = record;
  });
}

async function readLocal() {
  try {
    const parsed = JSON.parse(await readFile(localPath, "utf8"));
    return normalizeDatabase(parsed);
  } catch (error) {
    if (error?.code === "ENOENT") return normalizeDatabase();
    throw error;
  }
}

async function updateLocal(mutate) {
  localQueue = localQueue.catch(() => undefined).then(async () => {
    const database = await readLocal();
    mutate(database);
    await mkdir(path.dirname(localPath), { recursive: true });
    const temporary = `${localPath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(database, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, localPath);
  });
  await localQueue;
}

function normalizeDatabase(database = {}) {
  return {
    budgets: database && typeof database.budgets === "object" ? database.budgets : {},
    managedLedger: database && typeof database.managedLedger === "object" ? database.managedLedger : {},
    managedPeriods: database && typeof database.managedPeriods === "object" ? database.managedPeriods : {},
    usage: database && typeof database.usage === "object" ? database.usage : {}
  };
}

function ensureManagedPeriodState(database, userId, periodKey) {
  const id = managedPeriodId(userId, periodKey);
  if (!database.managedPeriods[id]) {
    database.managedPeriods[id] = buildManagedPeriodState(userId, periodKey);
  }
  return database.managedPeriods[id];
}

function buildManagedPeriodState(userId, periodKey) {
  return {
    grantUsd: getManagedMonthlyCreditUsd(),
    id: managedPeriodId(userId, periodKey),
    periodKey,
    reservedUsd: 0,
    spentUsd: 0,
    type: "managed-ai-period",
    updatedAt: new Date().toISOString(),
    userIdHash: userDocumentId(userId)
  };
}

function buildManagedGrant(userId, periodKey) {
  return {
    creditUsd: getManagedMonthlyCreditUsd(),
    createdAt: new Date().toISOString(),
    entryKind: "grant",
    id: managedLedgerId(userId, periodKey, "grant"),
    periodKey,
    type: "managed-ai-ledger",
    userIdHash: userDocumentId(userId)
  };
}

function buildManagedReservation({ amountUsd, now, period, projectId, reservationId, userId }) {
  return {
    createdAt: now.toISOString(),
    entryKind: "reservation",
    id: managedLedgerId(userId, reservationId, "reservation"),
    periodKey: period.key,
    projectId,
    reservationId,
    reservedUsd: amountUsd,
    status: "reserved",
    type: "managed-ai-ledger",
    userIdHash: userDocumentId(userId)
  };
}

function publicManagedReservation(record) {
  if (!record) return null;
  return {
    actualUsd: record.actualUsd == null ? null : roundCurrency(record.actualUsd),
    periodKey: record.periodKey,
    remainingReservedUsd: record.status === "reserved" ? roundCurrency(record.reservedUsd) : 0,
    reservationId: record.reservationId,
    reservedUsd: roundCurrency(record.reservedUsd),
    status: record.status
  };
}

function usageDocumentId(userId, idempotencyKey) {
  return createHash("sha256").update(`${userId}\0${idempotencyKey}`).digest("hex");
}

function managedPeriodId(userId, periodKey) {
  return createHash("sha256").update(`${userId}\0${periodKey}\0managed-period`).digest("hex");
}

function managedLedgerId(userId, key, kind) {
  return createHash("sha256").update(`${userId}\0${key}\0${kind}`).digest("hex");
}

function userDocumentId(userId) {
  return createHash("sha256").update(userId).digest("hex");
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeMoney(value) {
  return Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
}

function container() {
  return new CosmosClient({
    endpoint: required("AZURE_COSMOS_ENDPOINT"),
    key: required("AZURE_COSMOS_KEY")
  }).database(required("AZURE_COSMOS_DATABASE")).container(containerName);
}

function useAzure() {
  return (process.env.ATG_STORAGE_BACKEND || "local").toLowerCase() === "azure";
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new UsageBudgetError(`${name} is required.`, 503);
  return value;
}
