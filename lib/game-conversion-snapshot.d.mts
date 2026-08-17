export type ConversionFile = { path: string; content: string };
export type ConversionAsset = { path: string; contentType: string; content: string | Uint8Array };
export type ConversionSnapshot = {
  conversionId: string;
  projectId: string;
  projectRevision: string;
  capturedAt: string;
  engine: unknown;
  textFiles: ConversionFile[];
  assets: ConversionAsset[];
};

export function captureConversionSnapshot(options: {
  conversionId: string;
  project: { id: string; updatedAt: string };
  engine: unknown;
  readTextFiles: () => Promise<ConversionFile[]>;
  readAssets: () => Promise<ConversionAsset[]>;
}): Promise<ConversionSnapshot>;

export function createConversionTransaction(snapshot: ConversionSnapshot): {
  readonly conversionId: string;
  readonly status: "running" | "review" | "accepted" | "cancelled" | "failed";
  readonly snapshot: ConversionSnapshot | null;
  readonly candidate: ConversionSnapshot | null;
  stage(candidate: ConversionSnapshot): ConversionSnapshot;
  cancel(): ConversionSnapshot;
  fail(): ConversionSnapshot;
  accept(): ConversionSnapshot;
  promote<T>(applyCandidate: (candidate: ConversionSnapshot, snapshot: ConversionSnapshot) => Promise<T>): Promise<T>;
};

export function createConversionRegistry(): {
  get(conversionId: string): ReturnType<typeof createConversionTransaction> | null;
  start(snapshot: ConversionSnapshot): ReturnType<typeof createConversionTransaction>;
  remove(conversionId: string): void;
};
