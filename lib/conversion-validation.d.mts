export type ConversionFinding = { code: string; message: string; severity: "blocking" | "warning" };
export type ConversionValidationReport = {
  ok: boolean;
  blockingErrors: ConversionFinding[];
  warnings: ConversionFinding[];
  checks: { code: string; passed: boolean; message: string }[];
};
export function validateConvertedGame(input?: {
  files?: { path: string; content: string }[];
  assets?: { path: string }[];
  runtime?: { loaded?: boolean; error?: string };
  diagnostics?: { engineErrors?: number; assetFailures?: number; audioFailures?: number };
  performance?: { fps?: number; renderer?: string };
}): ConversionValidationReport;
