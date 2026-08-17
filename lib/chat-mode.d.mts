export type ChatMode = "build" | "plan";

export function normalizeChatMode(value: unknown): ChatMode;
export function buildPlanningRequest(
  message: string,
  editingTarget: "tv" | "phone",
  options?: { recentContext?: string }
): string;
