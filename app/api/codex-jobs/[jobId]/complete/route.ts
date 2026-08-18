import { randomUUID } from "crypto";
import { AI_BILLING_MODES } from "@/lib/ai-billing.mjs";
import { claimCodexJobCompletion, CodexJobError, completeCodexJob } from "@/lib/codex-job-store.mjs";
import { updateGameTextFiles } from "@/lib/project-game";
import { completeConversion, failConversionRun } from "@/lib/conversion-manager.mjs";
import { appendProjectMessages, getProject } from "@/lib/projects";
import { reconcileManagedAiReservation, recordCodexUsage, releaseManagedAiReservation } from "@/lib/usage-budget.mjs";

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
      const changedFiles = body.files as { path: string; content: string }[];
      let files = changedFiles;
      if (typeof record.conversionId === "string" && record.conversionId) {
        await completeConversion(record.conversionId, changedFiles, typeof body.finalMessage === "string" ? body.finalMessage : "Conversion candidate is ready for review.");
      } else {
        files = await updateGameTextFiles(project, changedFiles);
      }
      const finalMessage = typeof body.finalMessage === "string" ? body.finalMessage : "Codex completed.";
      await appendProjectMessages(project.id, [{
        id: randomUUID(), role: "assistant", content: finalMessage, status: "done", createdAt: new Date().toISOString()
      }]);
      const usageResult = await recordCodexUsage({
        idempotencyKey: jobId,
        model: typeof record.model === "string" ? record.model : "",
        projectId: record.projectId,
        source: "isolated-codex-job",
        usage: body.usage as Record<string, unknown>,
        userId: record.userId
      });
      if (record.billingMode === AI_BILLING_MODES.MANAGED && typeof record.reservationId === "string") {
        if (usageResult.recorded) {
          await reconcileManagedAiReservation({
            model: typeof record.model === "string" ? record.model : "",
            reservationId: record.reservationId,
            usage: body.usage as Record<string, unknown>,
            userId: record.userId
          });
        } else {
          await releaseManagedAiReservation({
            reason: usageResult.reason || "missing-usage",
            reservationId: record.reservationId,
            userId: record.userId
          });
        }
      }
      await completeCodexJob(jobId, token, { ok: true, files, finalMessage, usage: body.usage });
    } else {
      const errorMessage = typeof body.errorMessage === "string" ? body.errorMessage : "Codex job failed.";
      if (typeof record.conversionId === "string" && record.conversionId) {
        await failConversionRun(record.conversionId, errorMessage);
      }
      await appendProjectMessages(project.id, [{
        id: randomUUID(), role: "assistant", content: errorMessage, status: "error", createdAt: new Date().toISOString()
      }]);
      if (record.billingMode === AI_BILLING_MODES.MANAGED && typeof record.reservationId === "string") {
        await releaseManagedAiReservation({
          reason: "job-failed",
          reservationId: record.reservationId,
          userId: record.userId
        });
      }
      await completeCodexJob(jobId, token, { ok: false, errorMessage });
    }
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof CodexJobError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Completion failed." }, { status });
  }
}
