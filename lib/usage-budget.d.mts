import type { Usage } from "@openai/codex-sdk";

export const PRICING_VERSION: string;
export const PRICING_SOURCE_URL: string;

export class UsageBudgetError extends Error {
  status: number;
  constructor(message: string, status?: number);
}

export function recordCodexUsage(input: {
  idempotencyKey?: string;
  jobId?: string;
  model?: string;
  projectId: string;
  source?: string;
  timestamp?: string;
  usage: Partial<Usage> | null | undefined;
  userId: string;
}): Promise<{ recorded: boolean; reason?: string; record?: Record<string, unknown> }>;

export function getUsageBudgetSummary(userId: string, now?: Date): Promise<Record<string, unknown>>;
export function saveMonthlyBudget(userId: string, value: unknown): Promise<Record<string, unknown>>;
export function deleteMonthlyBudget(userId: string): Promise<void>;
export function normalizeMonthlyBudget(value: unknown): number;
export function estimateUsageCost(usage: Partial<Usage> | null | undefined, model: string): Record<string, unknown> | null;
export function utcMonthKey(date?: Date | string): string;
export function periodFor(date?: Date | string): {
  endAt: string;
  key: string;
  resetAt: string;
  startAt: string;
  timezone: "UTC";
};
