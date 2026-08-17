export function createConversionReview({ conversionId, projectId, candidateRevision, warnings = [], blockingErrors = [] }) {
  if (!conversionId || !projectId || !candidateRevision) throw new Error("A conversion candidate identity is required.");
  let status = "review";
  let warningsAcknowledged = false;
  let retryCount = 0;
  const normalizedWarnings = normalizeMessages(warnings);
  const normalizedErrors = normalizeMessages(blockingErrors);

  return {
    get status() { return status; },
    get warnings() { return normalizedWarnings; },
    get blockingErrors() { return normalizedErrors; },
    get warningsAcknowledged() { return warningsAcknowledged; },
    get retryCount() { return retryCount; },
    previewUrls(baseUrl = "/") {
      const root = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
      return {
        tv: `${root}/tv/${encodeURIComponent(projectId)}?conversion=${encodeURIComponent(conversionId)}&revision=${encodeURIComponent(candidateRevision)}`,
        phone: `${root}/join/${encodeURIComponent(projectId)}?conversion=${encodeURIComponent(conversionId)}&revision=${encodeURIComponent(candidateRevision)}`
      };
    },
    acknowledgeWarnings() {
      if (status !== "review") throw new Error(`Conversion review is already ${status}.`);
      warningsAcknowledged = true;
    },
    canAccept() {
      return status === "review" && normalizedErrors.length === 0 && (normalizedWarnings.length === 0 || warningsAcknowledged);
    },
    accept() {
      if (status !== "review") throw new Error(`Conversion review is already ${status}.`);
      if (!this.canAccept()) throw new Error(normalizedErrors.length ? "Blocking conversion errors must be resolved before acceptance." : "Acknowledge conversion warnings before acceptance.");
      status = "accepted";
      return { conversionId, candidateRevision };
    },
    cancel() {
      if (status === "accepted") throw new Error("Accepted conversions cannot be cancelled.");
      status = "cancelled";
      return { conversionId };
    },
    retry() {
      if (status !== "failed") throw new Error("Only failed conversions can be retried.");
      status = "review";
      warningsAcknowledged = false;
      retryCount += 1;
    },
    fail() {
      if (status === "accepted" || status === "cancelled") throw new Error(`Conversion review is already ${status}.`);
      status = "failed";
    }
  };
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.filter((message) => typeof message === "string" && message.trim()).map((message) => message.trim());
}
