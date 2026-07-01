import { randomUUID } from "crypto";
import type { ThreadEvent, Usage } from "@openai/codex-sdk";
import { requireEditorAuth } from "@/lib/api-auth";
import { runCodexSdkPrototype } from "@/lib/codex-sdk-prototype.mjs";
import { canUseCodexSdkPrototype, getCodexSdkTimeoutMs, getCodexSdkWorkspaceRoot } from "@/lib/env";
import { exportGameTextFiles, updateGameTextFiles } from "@/lib/project-game";
import { buildProjectPrompt } from "@/lib/project-prompt";
import {
  appendProjectMessages,
  type ChatMessage,
  getProject,
  ProjectStoreError,
  updateProjectThread
} from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequest = {
  editingTarget?: unknown;
  message?: unknown;
  projectId?: unknown;
};

type GlobalState = typeof globalThis & {
  atgCodexSdkRunningProjects?: Set<string>;
};

export async function POST(request: Request) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  if (!canUseCodexSdkPrototype()) {
    return Response.json(
      { error: "The Codex SDK prototype endpoint is disabled." },
      { status: 503 }
    );
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const editingTarget = body.editingTarget === "phone" ? "phone" : "tv";

  if (!projectId) {
    return Response.json({ error: "Project id is required." }, { status: 400 });
  }
  if (!message) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }

  const project = await getProject(projectId);
  if (!project || project.status === "deleted") {
    return Response.json({ error: "Project was not found." }, { status: 404 });
  }

  const runningProjects = getRunningProjects();
  if (runningProjects.has(projectId)) {
    return Response.json({ error: "Codex SDK is already running for this project." }, { status: 409 });
  }
  runningProjects.add(projectId);

  let files;
  try {
    files = await exportGameTextFiles(project);
    await appendProjectMessages(projectId, [{
      content: message,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      role: "user",
      status: "done"
    }]);
  } catch (error) {
    runningProjects.delete(projectId);
    return projectStoreErrorResponse(error, "Unable to prepare the Codex SDK workspace.");
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  let streamCancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const timeout = setTimeout(
        () => abortController.abort(new Error("Codex SDK request timed out.")),
        getCodexSdkTimeoutMs()
      );
      const cancelFromRequest = () => abortController.abort(request.signal.reason);
      request.signal.addEventListener("abort", cancelFromRequest, { once: true });

      const send = (payload: Record<string, unknown>) => {
        if (!closed && !streamCancelled) {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        }
      };
      const close = () => {
        if (!closed) {
          closed = true;
          clearTimeout(timeout);
          request.signal.removeEventListener("abort", cancelFromRequest);
          runningProjects.delete(projectId);
          if (!streamCancelled) {
            controller.close();
          }
        }
      };

      send({
        message: project.codexThreadId
          ? "Resuming Codex SDK thread in an isolated workspace..."
          : "Starting Codex SDK thread in an isolated workspace...",
        type: "status"
      });

      try {
        const result = await runCodexSdkPrototype({
          apiKey: process.env.OPENAI_API_KEY || undefined,
          files,
          message: buildProjectPrompt(message, editingTarget),
          model: process.env.ATG_CODEX_SDK_MODEL,
          onEvent: (event) => forwardEvent(event, send),
          signal: abortController.signal,
          threadId: project.codexThreadId,
          workspaceRoot: getCodexSdkWorkspaceRoot()
        });

        if (result.changedFiles.length > 0) {
          send({
            message: `Validating and saving ${result.changedFiles.length} changed game file${result.changedFiles.length === 1 ? "" : "s"}...`,
            type: "status"
          });
          await updateGameTextFiles(project, result.changedFiles);
        }

        if (result.threadId) {
          await updateProjectThread(projectId, result.threadId);
          send({ sessionId: result.threadId, type: "session" });
        }

        await persistAssistantMessage(projectId, result.finalResponse, "done");
        send({
          changedFiles: result.changedFiles.map((file) => file.path),
          message: result.finalResponse,
          type: "final",
          usage: result.usage
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Codex SDK request failed.";
        await persistAssistantMessage(projectId, message, "error").catch(() => undefined);
        send({ message, type: "error" });
      } finally {
        close();
      }
    },
    cancel(reason) {
      streamCancelled = true;
      abortController.abort(reason);
      runningProjects.delete(projectId);
    }
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no"
    }
  });
}

function forwardEvent(
  event: ThreadEvent,
  send: (payload: Record<string, unknown>) => void
) {
  if (event.type === "thread.started") {
    send({ sessionId: event.thread_id, type: "session" });
    return;
  }
  if (event.type === "turn.started") {
    send({ message: "Codex is working in the project sandbox...", type: "status" });
    return;
  }
  if (event.type === "turn.completed") {
    send({ message: usageSummary(event.usage), type: "status" });
    return;
  }
  if (event.type !== "item.completed") {
    return;
  }

  if (event.item.type === "file_change") {
    const safePaths = event.item.changes
      .map((change) => change.path)
      .filter((filePath) => filePath.startsWith("game/"));
    send({
      message: safePaths.length > 0
        ? `Codex updated ${safePaths.join(", ")}.`
        : "Codex updated game files.",
      type: "status"
    });
  } else if (event.item.type === "command_execution") {
    send({ message: "Codex ran a workspace check.", type: "status" });
  } else if (event.item.type === "error") {
    send({ message: event.item.message, type: "status" });
  }
}

function usageSummary(usage: Usage) {
  return `Codex completed the turn (${usage.input_tokens} input, ${usage.output_tokens} output tokens).`;
}

async function persistAssistantMessage(
  projectId: string,
  content: string,
  status: ChatMessage["status"]
) {
  await appendProjectMessages(projectId, [{
    content,
    createdAt: new Date().toISOString(),
    id: randomUUID(),
    role: "assistant",
    status
  }]);
}

function getRunningProjects() {
  const state = globalThis as GlobalState;
  if (!state.atgCodexSdkRunningProjects) {
    state.atgCodexSdkRunningProjects = new Set<string>();
  }
  return state.atgCodexSdkRunningProjects;
}

function projectStoreErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ProjectStoreError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: fallback }, { status: 500 });
}
