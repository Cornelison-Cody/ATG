import { authenticateCodexJob, CodexJobError } from "@/lib/codex-job-store.mjs";
import { AI_BILLING_MODES, getManagedOpenAiApiKey } from "@/lib/ai-billing.mjs";
import { getUserApiKey } from "@/lib/user-settings.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const record = await authenticateCodexJob(jobId, bearer(request));
    const apiKey = record.billingMode === AI_BILLING_MODES.MANAGED
      ? getManagedOpenAiApiKey()
      : record.billingMode === AI_BILLING_MODES.BYOK
        ? await getUserApiKey(record.userId)
        : await getUserApiKey(record.userId);
    if (!apiKey) return Response.json({ error: "No OpenAI API key is configured." }, { status: 503 });
    return Response.json({
      apiKey,
      files: record.files,
      prompt: record.prompt
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return jobError(error);
  }
}

function bearer(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
}
function jobError(error: unknown) {
  const status = error instanceof CodexJobError ? error.status : 500;
  return Response.json({ error: error instanceof Error ? error.message : "Job request failed." }, { status });
}
