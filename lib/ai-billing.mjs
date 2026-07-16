import { randomUUID } from "node:crypto";
import { getUserAiBillingMode, getUserApiKey, AI_BILLING_MODES } from "./user-settings.mjs";
import {
  getManagedAiCreditSummary,
  getManagedReservationUsd,
  reserveManagedAiCredit
} from "./usage-budget.mjs";

export { AI_BILLING_MODES };

export async function getAiBillingStatus(userId) {
  const [mode, userApiKey, managedCredit] = await Promise.all([
    getUserAiBillingMode(userId),
    getUserApiKey(userId),
    getManagedAiCreditSummary(userId)
  ]);
  return {
    mode,
    byok: {
      configured: Boolean(userApiKey)
    },
    managed: {
      enabled: isManagedAiEnabled(),
      keyConfigured: isManagedAiKeyConfigured(),
      eligible: isManagedAiEligible(),
      monthlyCreditUsd: managedCredit.monthlyCreditUsd,
      remainingCreditUsd: managedCredit.remainingCreditUsd,
      reservationUsd: managedCredit.reservationUsd,
      resetAt: managedCredit.period.resetAt
    }
  };
}

export async function prepareAiBillingForRun({ projectId, reservationId = randomUUID(), userId }) {
  const mode = await getUserAiBillingMode(userId);
  if (mode === AI_BILLING_MODES.BYOK) {
    const apiKey = await getUserApiKey(userId);
    if (!apiKey) {
      throw new AiBillingError("Save a personal OpenAI API key or switch to ATG-managed AI.", 400);
    }
    return { apiKey, billingMode: AI_BILLING_MODES.BYOK, reservationId: "" };
  }

  if (!isManagedAiEligible()) {
    throw new AiBillingError("ATG-managed AI is not available for this account.", 403);
  }
  if (!isManagedAiEnabled()) {
    throw new AiBillingError("ATG-managed AI is temporarily disabled. Switch to BYOK to continue.", 503);
  }
  const apiKey = getManagedOpenAiApiKey();
  if (!apiKey) {
    throw new AiBillingError("ATG-managed AI is not configured. Switch to BYOK to continue.", 503);
  }
  const reservation = await reserveManagedAiCredit({
    amountUsd: getManagedReservationUsd(),
    projectId,
    reservationId,
    userId
  });
  return { apiKey, billingMode: AI_BILLING_MODES.MANAGED, reservationId: reservation.reservationId };
}

export function getManagedOpenAiApiKey() {
  return process.env.ATG_MANAGED_OPENAI_API_KEY || "";
}

export function isManagedAiEnabled() {
  return process.env.ATG_MANAGED_AI_ENABLED === "true";
}

export function isManagedAiKeyConfigured() {
  return Boolean(getManagedOpenAiApiKey());
}

export function isManagedAiEligible() {
  return true;
}

export class AiBillingError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}
