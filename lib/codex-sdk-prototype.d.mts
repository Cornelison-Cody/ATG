import type { ThreadEvent, Usage } from "@openai/codex-sdk";
import type { GameTextFile } from "./project-store";

type ThreadLike = {
  id: string | null;
  runStreamed(
    message: string,
    options: { signal?: AbortSignal }
  ): Promise<{ events: AsyncGenerator<ThreadEvent> }>;
};

type CodexLike = {
  startThread(options: Record<string, unknown>): ThreadLike;
  resumeThread(id: string, options: Record<string, unknown>): ThreadLike;
};

export function runCodexSdkPrototype(options: {
  apiKey?: string;
  codexFactory?: (options?: { apiKey: string }) => CodexLike;
  files: GameTextFile[];
  message: string;
  model?: string;
  onEvent?: (event: ThreadEvent) => void | Promise<void>;
  signal?: AbortSignal;
  threadId?: string | null;
  workspaceRoot?: string;
}): Promise<{
  changedFiles: GameTextFile[];
  finalResponse: string;
  threadId: string;
  usage: Usage | null;
  workspaceId: string;
}>;

export function createWorkspace(
  files: GameTextFile[],
  workspaceRoot?: string
): Promise<{ id: string; path: string }>;

export function readWorkspaceChanges(
  workspacePath: string,
  initialFiles: GameTextFile[]
): Promise<{ changedFiles: GameTextFile[] }>;
