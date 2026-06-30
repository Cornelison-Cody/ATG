import { requireCompanionAuth } from "@/lib/companion-auth";
import { applyCompanionCompletion, CompanionCompletionError } from "@/lib/companion-completion.mjs";
import { completeCompanionJob, getCompanionJob } from "@/lib/companion-jobs";
import { updateGameTextFiles } from "@/lib/project-game";
import { getProject, ProjectStoreError } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

type CompleteBody = {
  errorMessage?: unknown;
  files?: unknown;
  finalMessage?: unknown;
  ok?: unknown;
};

export async function POST(request: Request, context: RouteContext) {
  const authResponse = requireCompanionAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const { jobId } = await context.params;
  const job = getCompanionJob(jobId);
  if (!job) {
    return Response.json({ error: "Companion job was not found." }, { status: 404 });
  }

  let body: CompleteBody;
  try {
    body = (await request.json()) as CompleteBody;
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const ok = body.ok !== false;
  if (!ok) {
    const message = typeof body.errorMessage === "string" && body.errorMessage.trim()
      ? body.errorMessage.trim()
      : "Local companion failed.";
    completeCompanionJob(jobId, { type: "error", message });
    return Response.json({ ok: true });
  }

  try {
    const files = Array.isArray(body.files) ? body.files : [];
    const result = await applyCompanionCompletion({
      completeJob: completeCompanionJob,
      files: files as { content: string; path: string }[],
      finalMessage: body.finalMessage,
      job,
      loadProject: getProject,
      saveFiles: updateGameTextFiles
    });
    return Response.json({ message: result.message, ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to apply local companion changes.";
    const status = error instanceof CompanionCompletionError || error instanceof ProjectStoreError
      ? error.status
      : typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
        ? error.status
        : 500;
    return Response.json({ error: message }, { status });
  }
}
