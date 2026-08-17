export type OptimizationAsset = { path: string; size: number; contentHash?: string; updatedAt?: string };
export type OptimizationOutput = { path: string; sourcePath: string; kind: string; quality: string; variant: string; bytes: number };
export function createAssetOptimizationPlan(assets?: OptimizationAsset[], options?: { quality?: "quality" | "balanced" | "size" }): {
  cacheKey: string; quality: string; sourceAssets: OptimizationAsset[]; outputs: OptimizationOutput[]; warnings: string[]; manifest: { version: number; entries: OptimizationOutput[]; total: number };
};
export function runAssetOptimization<T>(plan: ReturnType<typeof createAssetOptimizationPlan>, optimize?: (output: OptimizationOutput) => Promise<T>): Promise<{ cacheKey: string; outputs: T[]; manifest: unknown; warnings: string[] }>;
export function createPreloadManifest(outputs?: OptimizationOutput[]): { version: number; entries: OptimizationOutput[]; total: number };
