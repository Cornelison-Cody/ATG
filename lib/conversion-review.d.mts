export function createConversionReview(options: {
  conversionId: string;
  projectId: string;
  candidateRevision: string;
  warnings?: string[];
  blockingErrors?: string[];
}): {
  readonly status: "review" | "accepted" | "cancelled" | "failed";
  readonly warnings: string[];
  readonly blockingErrors: string[];
  readonly warningsAcknowledged: boolean;
  readonly retryCount: number;
  previewUrls(baseUrl?: string): { tv: string; phone: string };
  acknowledgeWarnings(): void;
  canAccept(): boolean;
  accept(): { conversionId: string; candidateRevision: string };
  cancel(): { conversionId: string };
  retry(): void;
  fail(): void;
};
