import { requireCompanionAuth } from "@/lib/companion-auth";
import { emitCompanionJobEvent, type CompanionEvent } from "@/lib/companion-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const authResponse = requireCompanionAuth(request);
  if (authResponse) {
    return authResponse;
  }

  let event: CompanionEvent;
  try {
    event = normalizeEvent(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request body must be valid JSON.";
    return Response.json({ error: message }, { status: 400 });
  }

  const { jobId } = await context.params;
  if (!emitCompanionJobEvent(jobId, event)) {
    return Response.json({ error: "Companion job was not found." }, { status: 404 });
  }

  return Response.json({ ok: true });
}

function normalizeEvent(value: unknown): CompanionEvent {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    throw new Error("Companion event type is required.");
  }

  const event = value as { message?: unknown; sessionId?: unknown; type?: unknown };
  if (event.type === "status" || event.type === "final" || event.type === "error") {
    const message = typeof event.message === "string" ? event.message.trim() : "";
    if (!message) {
      throw new Error("Companion event message is required.");
    }
    return { type: event.type, message };
  }

  if (event.type === "session") {
    const sessionId = typeof event.sessionId === "string" ? event.sessionId.trim() : "";
    if (!sessionId) {
      throw new Error("Companion session id is required.");
    }
    return { type: "session", sessionId };
  }

  throw new Error("Companion event type is not supported.");
}
