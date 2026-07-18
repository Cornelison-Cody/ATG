export const AI_BILLING_MODES: Readonly<{
  BYOK: "byok";
  MANAGED: "managed";
}>;

export class AiBillingError extends Error {
  status: number;
  constructor(message: string, status?: number);
}

export function getAiBillingStatus(userId: string): Promise<Record<string, unknown>>;
export function prepareAiBillingForRun(input: {
  projectId: string;
  reservationId?: string;
  userId: string;
}): Promise<{ apiKey: string; billingMode: "managed" | "byok"; reservationId: string }>;
export function getManagedOpenAiApiKey(): string;
export function isManagedAiEnabled(): boolean;
export function isManagedAiKeyConfigured(): boolean;
export function isManagedAiEligible(userId: string): boolean;
export function managedAiBetaAllowlist(): Set<string>;
