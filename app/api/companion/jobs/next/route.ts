import { requireCompanionAuth } from "@/lib/companion-auth";
import { canUseLocalCompanion } from "@/lib/env";
import { waitForNextCompanionJob } from "@/lib/companion-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResponse = requireCompanionAuth(request);
  if (authResponse) {
    return authResponse;
  }

  if (!canUseLocalCompanion()) {
    return Response.json({ error: "Local companion jobs are disabled." }, { status: 503 });
  }

  const job = await waitForNextCompanionJob(25_000);
  if (!job) {
    return new Response(null, { status: 204 });
  }

  return Response.json({ job });
}
