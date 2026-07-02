import { appendCodexJobEvent, CodexJobError } from "@/lib/codex-job-store.mjs";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;
    const body = await request.json() as { type?: unknown; message?: unknown };
    if (body.type !== "status" || typeof body.message !== "string") {
      return Response.json({ error: "A sanitized status event is required." }, { status: 400 });
    }
    await appendCodexJobEvent(jobId, bearer(request), { type: "status", message: body.message.slice(0, 500) });
    return Response.json({ ok: true });
  } catch (error) {
    const status = error instanceof CodexJobError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Event failed." }, { status });
  }
}
function bearer(request: Request) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
}
