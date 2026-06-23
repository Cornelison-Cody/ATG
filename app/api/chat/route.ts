import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { requireEditorAuth } from "@/lib/api-auth";
import { enqueueCompanionJob, subscribeToCompanionJob, type CompanionEvent } from "@/lib/companion-jobs";
import { canUseLocalCodex, canUseLocalCompanion, getAiWorkerUrl } from "@/lib/env";
import { exportGameTextFiles } from "@/lib/project-game";
import {
  appendProjectMessages,
  ChatMessage,
  getProject,
  ProjectStoreError,
  updateProjectThread
} from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequest = {
  editingTarget?: unknown;
  projectId?: unknown;
  message?: unknown;
};

type CodexEvent = {
  type?: string;
  thread_id?: string;
  session_id?: string;
  sessionId?: string;
  message?: unknown;
  item?: unknown;
};

type GlobalState = typeof globalThis & {
  atgRunningProjects?: Set<string>;
};

export async function POST(request: Request) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
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
    return Response.json({ error: "Codex is already running for this project." }, { status: 409 });
  }

  runningProjects.add(projectId);

  const now = new Date().toISOString();
  const userMessage: ChatMessage = {
    id: randomUUID(),
    role: "user",
    content: message,
    status: "done",
    createdAt: now
  };

  try {
    await appendProjectMessages(projectId, [userMessage]);
  } catch (error) {
    runningProjects.delete(projectId);
    return projectStoreErrorResponse(error, "Unable to update chat history.");
  }

  const aiWorkerUrl = getAiWorkerUrl();
  if (aiWorkerUrl) {
    return streamHostedWorker({
      aiWorkerUrl,
      editingTarget,
      message,
      projectId,
      threadId: project.codexThreadId
    });
  }

  if (!canUseLocalCodex() && canUseLocalCompanion()) {
    try {
      return await streamLocalCompanion({
        editingTarget,
        message,
        project,
        projectId
      });
    } catch (error) {
      runningProjects.delete(projectId);
      return projectStoreErrorResponse(error, "Unable to create local companion job.");
    }
  }

  if (!canUseLocalCodex()) {
    runningProjects.delete(projectId);
    const errorMessage = "Production chat editing requires AI_WORKER_URL or ENABLE_LOCAL_COMPANION=true with a connected local companion.";
    await persistAssistantMessage(projectId, errorMessage, "error");
    return Response.json({ error: errorMessage }, { status: 501 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (payload: Record<string, string>) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        }
      };
      const close = () => {
        if (!closed) {
          closed = true;
          runningProjects.delete(projectId);
          controller.close();
        }
      };

      send({
        type: "status",
        message: project.codexThreadId ? "Resuming Codex session..." : "Starting Codex session..."
      });

      const args = buildCodexArgs(project.codexThreadId, buildProjectPrompt(message, editingTarget));
      const child = spawn("codex", args, {
        cwd: project.path,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdoutBuffer = "";
      let stderr = "";
      let finalMessage = "";
      let nextThreadId = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          handleCodexLine(line);
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", async (error) => {
        const errorMessage = error.message;
        await persistAssistantMessage(projectId, errorMessage, "error");
        send({ type: "error", message: errorMessage });
        close();
      });

      child.on("close", async (code) => {
        if (stdoutBuffer.trim()) {
          handleCodexLine(stdoutBuffer);
        }

        if (nextThreadId) {
          await updateProjectThread(projectId, nextThreadId);
        }

        if (code === 0) {
          const responseMessage = finalMessage || "Codex finished without a final text response.";
          await persistAssistantMessage(projectId, responseMessage, "done");
          send({ type: "final", message: responseMessage });
        } else {
          const errorMessage = stderr.trim() || `Codex exited with code ${code}.`;
          await persistAssistantMessage(projectId, errorMessage, "error");
          send({ type: "error", message: errorMessage });
        }

        close();
      });

      function handleCodexLine(line: string) {
        if (!line.trim()) {
          return;
        }

        let event: CodexEvent;
        try {
          event = JSON.parse(line) as CodexEvent;
        } catch {
          return;
        }

        const threadId = extractSessionId(event);
        if (threadId) {
          nextThreadId = threadId;
          send({ type: "session", sessionId: threadId });
        }

        const status = extractStatus(event);
        if (status) {
          send({ type: "status", message: status });
        }

        const final = extractFinalMessage(event);
        if (final) {
          finalMessage = final;
        }
      }
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

async function streamLocalCompanion({
  editingTarget,
  message,
  project,
  projectId
}: {
  editingTarget: "tv" | "phone";
  message: string;
  project: NonNullable<Awaited<ReturnType<typeof getProject>>>;
  projectId: string;
}) {
  const runningProjects = getRunningProjects();
  const files = await exportGameTextFiles(project);
  const job = enqueueCompanionJob({
    editingTarget,
    files,
    message,
    project,
    prompt: buildProjectPrompt(message, editingTarget)
  });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let unsubscribe: () => void = () => undefined;
      const send = (payload: CompanionEvent) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
        }
      };
      const close = () => {
        if (!closed) {
          closed = true;
          if (timeout) {
            clearTimeout(timeout);
          }
          unsubscribe();
          runningProjects.delete(projectId);
          controller.close();
        }
      };
      const fail = async (message: string) => {
        await persistAssistantMessage(projectId, message, "error");
        send({ type: "error", message });
        close();
      };

      send({ type: "status", message: "Waiting for local companion..." });

      unsubscribe = subscribeToCompanionJob(job.id, async (event) => {
        if (event.type === "session") {
          await updateProjectThread(projectId, event.sessionId);
          send(event);
          return;
        }

        if (event.type === "final") {
          await persistAssistantMessage(projectId, event.message, "done");
          send(event);
          close();
          return;
        }

        if (event.type === "error") {
          await persistAssistantMessage(projectId, event.message, "error");
          send(event);
          close();
          return;
        }

        send(event);
      });

      timeout = setTimeout(() => {
        void fail("No local companion picked up this request.");
      }, 60_000);
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

async function streamHostedWorker({
  aiWorkerUrl,
  editingTarget,
  message,
  projectId,
  threadId
}: {
  aiWorkerUrl: string;
  editingTarget: "tv" | "phone";
  message: string;
  projectId: string;
  threadId: string | null;
}) {
  const runningProjects = getRunningProjects();
  const response = await fetch(`${aiWorkerUrl}/chat`, {
    body: JSON.stringify({
      message: buildProjectPrompt(message, editingTarget),
      projectId,
      threadId
    }),
    headers: {
      "Content-Type": "application/json",
      ...(process.env.AI_WORKER_TOKEN ? { Authorization: `Bearer ${process.env.AI_WORKER_TOKEN}` } : {})
    },
    method: "POST"
  });

  if (!response.ok || !response.body) {
    runningProjects.delete(projectId);
    const errorMessage = `AI worker request failed (${response.status}).`;
    await persistAssistantMessage(projectId, errorMessage, "error");
    return Response.json({ error: errorMessage }, { status: 502 });
  }

  let finalMessage = "";
  let errorMessage = "";
  let nextThreadId = "";
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body?.getReader();
      if (!reader) {
        errorMessage = "AI worker response body was unavailable.";
        await persistAssistantMessage(projectId, errorMessage, "error");
        runningProjects.delete(projectId);
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message: errorMessage })}\n`));
        controller.close();
        return;
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          const text = decoder.decode(value, { stream: true });
          controller.enqueue(encoder.encode(text));
          buffer += text;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const event = parseStreamEvent(line);
            if (event?.type === "final" && typeof event.message === "string") {
              finalMessage = event.message;
            }
            if (event?.type === "error" && typeof event.message === "string") {
              errorMessage = event.message;
            }
            if (event?.type === "session" && typeof event.sessionId === "string") {
              nextThreadId = event.sessionId;
            }
          }
        }

        if (buffer.trim()) {
          const event = parseStreamEvent(buffer);
          if (event?.type === "final" && typeof event.message === "string") {
            finalMessage = event.message;
          }
          if (event?.type === "error" && typeof event.message === "string") {
            errorMessage = event.message;
          }
          if (event?.type === "session" && typeof event.sessionId === "string") {
            nextThreadId = event.sessionId;
          }
        }

        if (nextThreadId) {
          await updateProjectThread(projectId, nextThreadId);
        }
        await persistAssistantMessage(projectId, errorMessage || finalMessage || "AI worker completed.", errorMessage ? "error" : "done");
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI worker stream failed.";
        await persistAssistantMessage(projectId, message, "error");
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message })}\n`));
      } finally {
        runningProjects.delete(projectId);
        controller.close();
      }
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

function parseStreamEvent(line: string) {
  try {
    return JSON.parse(line) as { type?: string; message?: unknown; sessionId?: unknown };
  } catch {
    return null;
  }
}

function buildCodexArgs(threadId: string | null, message: string) {
  if (threadId) {
    return [
      "exec",
      "resume",
      "--json",
      "--skip-git-repo-check",
      threadId,
      message
    ];
  }

  return [
    "exec",
    "--json",
    "-C",
    ".",
    "--sandbox",
    "workspace-write",
    "--skip-git-repo-check",
    message
  ];
}

function buildProjectPrompt(message: string, editingTarget: "tv" | "phone") {
  const targetFile = editingTarget === "tv" ? "game/tv.html" : "game/phone.html";
  const targetRole = editingTarget === "tv" ? "TV display" : "phone player controller";

  return `You are working inside one sandboxed Azure Tides Gaming game workspace, not the ATG platform app. The live game UI is customized by editing files under game/: tv.html, phone.html, styles.css, game.js, config.json, and instructions.md. The creator is currently editing the ${targetRole}. Treat this request as targeting ${targetFile} and related shared game files unless the user explicitly says otherwise. Use game/instructions.md for player-facing game rules, setup, and gameplay instructions. Do not edit the parent ATG platform app unless the user explicitly asks for platform changes. The platform owns QR joining, phone player name/color identity, color selection, WebSocket connection, connection state, menus, player roster plumbing, and the TV Back to Editor control. Use the injected window.ATG SDK from project HTML/JS for custom TV and phone interactions.\n\nUser request:\n${message}`;
}

async function persistAssistantMessage(
  projectId: string,
  content: string,
  status: ChatMessage["status"]
) {
  await appendProjectMessages(projectId, [
    {
      id: randomUUID(),
      role: "assistant",
      content,
      status,
      createdAt: new Date().toISOString()
    }
  ]);
}

function getRunningProjects() {
  const state = globalThis as GlobalState;
  if (!state.atgRunningProjects) {
    state.atgRunningProjects = new Set<string>();
  }

  return state.atgRunningProjects;
}

function projectStoreErrorResponse(error: unknown, fallback: string) {
  if (error instanceof ProjectStoreError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  return Response.json({ error: fallback }, { status: 500 });
}

function extractSessionId(event: CodexEvent) {
  if (typeof event.thread_id === "string") {
    return event.thread_id;
  }

  if (typeof event.session_id === "string") {
    return event.session_id;
  }

  if (typeof event.sessionId === "string") {
    return event.sessionId;
  }

  return "";
}

function extractStatus(event: CodexEvent) {
  if (event.type === "thread.started" || event.type === "session.created") {
    return "Codex session ready.";
  }

  if (event.type === "turn.started") {
    return "Codex is working in the project sandbox...";
  }

  if (event.type === "turn.completed") {
    return "Codex completed the turn.";
  }

  return "";
}

function extractFinalMessage(event: CodexEvent) {
  if (event.type === "agent_message" && typeof event.message === "string") {
    return event.message;
  }

  if (event.message && typeof event.message === "object" && "text" in event.message) {
    const text = (event.message as { text?: unknown }).text;
    return typeof text === "string" ? text : "";
  }

  if (event.type === "item.completed" && event.item && typeof event.item === "object") {
    const item = event.item as { type?: unknown; text?: unknown };
    if (item.type === "agent_message" && typeof item.text === "string") {
      return item.text;
    }
  }

  return "";
}
