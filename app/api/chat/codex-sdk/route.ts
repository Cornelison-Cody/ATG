import { randomUUID } from "crypto";
import type { ThreadEvent, Usage } from "@openai/codex-sdk";
import { getAuthenticatedUserId } from "@/lib/auth";
import { requireEditorAuth } from "@/lib/api-auth";
import { AiBillingError, AI_BILLING_MODES, prepareAiBillingForRun } from "@/lib/ai-billing.mjs";
import { createCodexJob, getCodexJob, completeCodexJob } from "@/lib/codex-job-store.mjs";
import { startAzureCodexJob } from "@/lib/codex-job-launcher";
import { runCodexSdkPrototype } from "@/lib/codex-sdk-prototype.mjs";
import { canUseCodexSdkPrototype, getCodexSdkTimeoutMs, getCodexSdkWorkspaceRoot, isProduction } from "@/lib/env";
import { completeConversion, failConversionRun, prepareConversion } from "@/lib/conversion-manager.mjs";
import { exportGameTextFiles, readGameConfig, updateGameTextFiles } from "@/lib/project-game";
import { buildPlanningRequest, normalizeChatMode } from "@/lib/chat-mode.mjs";
import { buildProjectPrompt } from "@/lib/project-prompt.mjs";
import { reconcileManagedAiReservation, recordCodexUsage, releaseManagedAiReservation } from "@/lib/usage-budget.mjs";
import {
  canEditProject,
  getProjectPrincipal,
  principalRequiredResponse,
  projectAccessResponse
} from "@/lib/project-access";
import {
  appendProjectMessages,
  claimProject,
  type ChatMessage,
  getProject,
  ProjectStoreError,
  updateProjectThread
} from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatRequest = {
  editingTarget?: unknown;
  chatMode?: unknown;
  conversionId?: unknown;
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

  const userId = getAuthenticatedUserId(request);
  if (!userId) {
    return Response.json({ error: "A user identity is required." }, { status: 401 });
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const conversionId = typeof body.conversionId === "string" ? body.conversionId.trim() : "";
  const editingTarget = body.editingTarget === "both" ? "both" : body.editingTarget === "phone" ? "phone" : "tv";
  const chatMode = normalizeChatMode(body.chatMode);

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

  const principal = getProjectPrincipal(request);
  if (!principal) {
    return principalRequiredResponse();
  }
  const projectForAccess = project.ownerUserId ? project : await claimProject(projectId, principal);
  if (!canEditProject(projectForAccess, principal)) {
    return projectAccessResponse();
  }

  const runningProjects = getRunningProjects();
  if (runningProjects.has(projectId)) {
    return Response.json({ error: "Codex SDK is already running for this project." }, { status: 409 });
  }
  runningProjects.add(projectId);

  let config;
  let files;
  let billing;
  try {
    billing = await prepareAiBillingForRun({ projectId, userId });
    files = await exportGameTextFiles(projectForAccess);
    config = await readGameConfig(projectForAccess);
    await appendProjectMessages(projectId, [{
      content: message,
      createdAt: new Date().toISOString(),
      id: randomUUID(),
      role: "user",
      status: "done"
    }]);
    if (conversionId) {
      await prepareConversion(conversionId);
    }
  } catch (error) {
    runningProjects.delete(projectId);
    if (billing?.billingMode === AI_BILLING_MODES.MANAGED) {
      await releaseManagedAiReservation({
        reason: "prepare-failed",
        reservationId: billing.reservationId,
        userId
      }).catch(() => undefined);
    }
    if (error instanceof AiBillingError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return projectStoreErrorResponse(error, "Unable to prepare the Codex SDK workspace.");
  }

  if (isProduction()) {
    return streamAzureJob({
      chatMode,
      config,
      editingTarget,
      files,
      message,
      project: projectForAccess,
      projectId,
      conversionId,
      billing,
      runningProjects,
      userId
    });
  }

  const encoder = new TextEncoder();
  const abortController = new AbortController();
  const directUsageKey = randomUUID();
  const planningContext = formatRecentProjectConversation(projectForAccess.messages);
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
        message: projectForAccess.codexThreadId
          ? "Resuming Codex SDK thread in an isolated workspace..."
          : "Starting Codex SDK thread in an isolated workspace...",
        type: "status"
      });

      try {
        const result = await runCodexSdkPrototype({
          apiKey: billing.apiKey,
          files,
          message: buildProjectPrompt(
            chatMode === "plan" ? buildPlanningRequest(message, editingTarget, {
              engineMetadata: config.engine,
              recentContext: planningContext
            }) : message,
            editingTarget,
            config.engine
          ),
          model: process.env.ATG_CODEX_SDK_MODEL,
          onEvent: (event) => forwardEvent(event, send),
          onStaleThread: () => send({
            message: "The previous Codex session expired. Starting a fresh session...",
            type: "status"
          }),
          signal: abortController.signal,
          threadId: projectForAccess.codexThreadId,
          workspaceRoot: getCodexSdkWorkspaceRoot()
        });

        if (conversionId) {
          send({ message: "Storing the conversion candidate without changing the published game...", type: "status" });
          await completeConversion(conversionId, result.changedFiles, result.finalResponse);
        } else if (result.changedFiles.length > 0) {
          send({
            message: `Validating and saving ${result.changedFiles.length} changed game file${result.changedFiles.length === 1 ? "" : "s"}...`,
            type: "status"
          });
          await updateGameTextFiles(projectForAccess, result.changedFiles);
        }

        if (result.threadId) {
          await updateProjectThread(projectId, result.threadId);
          send({ sessionId: result.threadId, type: "session" });
        }

        const usageResult = await recordCodexUsage({
          idempotencyKey: directUsageKey,
          model: process.env.ATG_CODEX_SDK_MODEL,
          projectId,
          source: "direct-codex-sdk",
          usage: result.usage,
          userId
        });
        if (billing.billingMode === AI_BILLING_MODES.MANAGED) {
          if (usageResult.recorded) {
            await reconcileManagedAiReservation({
              model: process.env.ATG_CODEX_SDK_MODEL,
              reservationId: billing.reservationId,
              usage: result.usage,
              userId
            });
          } else {
            await releaseManagedAiReservation({
              reason: usageResult.reason || "missing-usage",
              reservationId: billing.reservationId,
              userId
            });
          }
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
        if (billing.billingMode === AI_BILLING_MODES.MANAGED) {
          await releaseManagedAiReservation({
            reason: "run-failed",
            reservationId: billing.reservationId,
            userId
          }).catch(() => undefined);
        }
        if (conversionId) {
          await failConversionRun(conversionId, message).catch(() => undefined);
        }
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

async function streamAzureJob({
  billing, chatMode, config, conversionId, editingTarget, files, message, project, projectId, runningProjects, userId
}: {
  billing: { apiKey: string; billingMode: "managed" | "byok"; reservationId: string };
  chatMode: "build" | "plan";
  config: Awaited<ReturnType<typeof readGameConfig>>;
  conversionId: string;
  editingTarget: "tv" | "phone" | "both";
  files: { path: string; content: string }[];
  message: string;
  project: NonNullable<Awaited<ReturnType<typeof getProject>>>;
  projectId: string;
  runningProjects: Set<string>;
  userId: string;
}) {
  const recentContext = formatRecentProjectConversation(project.messages);
  let job;
  let token = "";
  const encoder = new TextEncoder();

  try {
    const created = await createCodexJob({
      editingTarget,
      files,
      billingMode: billing.billingMode,
      model: process.env.ATG_CODEX_SDK_MODEL || "",
      projectId,
      conversionId: conversionId || null,
      prompt: `${buildProjectPrompt(
        chatMode === "plan" ? buildPlanningRequest(message, editingTarget, {
          engineMetadata: config.engine,
          recentContext
        }) : message,
        editingTarget,
        config.engine
      )}${chatMode === "build" && recentContext ? `\n\nRecent project conversation:\n${recentContext}` : ""}`,
      reservationId: billing.reservationId,
      userId
    });
    job = created.job;
    token = created.token;
    await startAzureCodexJob(job.id, token);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unable to start isolated Codex job.";
    if (job && token) {
      await completeCodexJob(job.id, token, { ok: false, errorMessage });
    }
    if (billing.billingMode === AI_BILLING_MODES.MANAGED) {
      await releaseManagedAiReservation({
        reason: "start-failed",
        reservationId: billing.reservationId,
        userId
      }).catch(() => undefined);
    }
    if (conversionId) await failConversionRun(conversionId, errorMessage).catch(() => undefined);
    runningProjects.delete(projectId);
    await persistAssistantMessage(projectId, errorMessage, "error");
    return Response.json({ error: errorMessage }, { status: 502 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let eventIndex = 0;
      const deadline = Date.now() + getCodexSdkTimeoutMs();
      try {
        while (Date.now() < deadline) {
          const snapshot = await getCodexJob(job.id);
          if (!snapshot) throw new Error("Codex job disappeared.");
          for (const event of snapshot.events.slice(eventIndex)) {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          }
          eventIndex = snapshot.events.length;
          if (snapshot.status === "done" || snapshot.status === "error") break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        const final = await getCodexJob(job.id);
        if (final && final.status !== "done" && final.status !== "error") {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "error", message: "Isolated Codex job timed out." })}\n`));
        }
      } catch (error) {
        controller.enqueue(encoder.encode(`${JSON.stringify({
          type: "error", message: error instanceof Error ? error.message : "Unable to monitor Codex job."
        })}\n`));
      } finally {
        runningProjects.delete(projectId);
        controller.close();
      }
    }
  });
  return new Response(stream, { headers: streamHeaders() });
}

function streamHeaders() {
  return {
    "Cache-Control": "no-cache, no-transform",
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "X-Accel-Buffering": "no"
  };
}

function formatRecentProjectConversation(messages: ChatMessage[]) {
  return messages.slice(-10)
    .map((item) => `${item.role}: ${item.content}`)
    .join("\n");
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
