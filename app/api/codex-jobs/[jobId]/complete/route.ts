import { randomUUID } from "crypto";
import { claimCodexJobCompletion, CodexJobError, completeCodexJob } from "@/lib/codex-job-store.mjs";
import { updateGameTextFiles } from "@/lib/project-game";
import { appendProjectMessages, getProject } from "@/lib/projects";
import { recordCodexUsage } from "@/lib/usage-budget.mjs";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
    const record = await claimCodexJobCompletion(jobId, token);
    const body = await request.json() as {
      errorMessage?: unknown; files?: unknown; finalMessage?: unknown; ok?: unknown; usage?: unknown;
    };
    const project = await getProject(record.projectId);
    if (!project || project.status === "deleted") {
      throw new CodexJobError("Project was not found.", 404);
    }
    if (body.ok === true) {
      const files = await updateGameTextFiles(project, body.files as { path: string; content: string }[]);
      const finalMessage = typeof body.finalMessage === "string" ? body.finalMessage : "Codex completed.";
      await appendProjectMessages(project.id, [{
        id: randomUUID(), role: "assistant", content: finalMessage, status: "done", createdAt: new Date().toISOString()
      }]);
      await recordCodexUsage({
        idempotencyKey: jobId,
        model: typeof record.model === "string" ? record.model : "",
        projectId: record.projectId,
        source: "isolated-codex-job",
        usage: body.usage as Record<string, unknown>,
        userId: record.userId
      });
      await completeCodexJob(jobId, token, { ok: true, files, finalMessage, usage: body.usage });
    } else {
      const errorMessage = typeof body.errorMessage === "string" ? body.errorMessage : "Codex job failed.";
      await appendProjectMessages(project.id, [{
        id: randomUUID(), role: "assistant", content: errorMessage, status: "error", createdAt: new Date().toISOString()
      }]);
      await completeCodexJob(jobId, token, { ok: false, errorMessage });
    }
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof CodexJobError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Completion failed." }, { status });
  }
}
