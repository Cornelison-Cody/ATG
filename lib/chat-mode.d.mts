export type ChatMode = "build" | "plan";

export function normalizeChatMode(value: unknown): ChatMode;
export function buildPlanningRequest(
  message: string,
  editingTarget: "tv" | "phone" | "both",
  options?: {
    recentContext?: string;
    engineMetadata?: {
      formatVersion: number;
      migrationStatus: "legacy" | "upgraded";
      runtimeVersion: string | null;
      type: "legacy" | "pixi";
    };
  }
): string;
