import type { GameTextFile } from "./project-store";
export class CodexJobError extends Error {
  status: number;
  constructor(message: string, status?: number);
}
export type CodexJobEvent = { type: "status" | "final" | "error"; message: string };
export type CodexJob = {
  id: string; projectId: string; status: "queued" | "running" | "done" | "error";
  events: CodexJobEvent[]; result?: { ok: boolean; files?: GameTextFile[]; finalMessage?: string; errorMessage?: string };
  files: GameTextFile[]; prompt: string; editingTarget: "tv" | "phone"; expiresAt: string;
};
export function createCodexJob(input: Record<string, unknown>): Promise<{ job: CodexJob; token: string }>;
export function getCodexJob(id: string): Promise<CodexJob | null>;
export function authenticateCodexJob(id: string, token: string): Promise<Record<string, any>>;
export function appendCodexJobEvent(id: string, token: string, event: CodexJobEvent): Promise<CodexJob>;
export function claimCodexJobCompletion(id: string, token: string): Promise<Record<string, any>>;
export function completeCodexJob(id: string, token: string, result: Record<string, unknown>): Promise<CodexJob>;
