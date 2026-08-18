export function listCompatibleRuntimeUpgrades(currentVersion: string, options?: { runtimes?: string[]; compatibility?: (candidate: string, current: string) => { compatible?: boolean; warnings?: string[]; blockingErrors?: string[] } }): { runtimeVersion: string; compatible: boolean; warnings: string[]; blockingErrors: string[] }[];
export function createRuntimeUpgrade(options: { projectId: string; currentMetadata: Record<string, unknown>; candidate: Record<string, unknown>; currentRevision: string }): Record<string, unknown>;
export function acceptRuntimeUpgrade(upgrade: Record<string, any>, options: { acknowledgeWarnings?: boolean; revision: string }): Record<string, unknown>;
export function cancelRuntimeUpgrade(upgrade: Record<string, any>): Record<string, unknown>;
