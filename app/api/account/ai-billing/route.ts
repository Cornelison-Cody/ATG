import { getAuthenticatedUserId } from "@/lib/auth";
import { requireEditorAuth } from "@/lib/api-auth";
import { getAiBillingStatus } from "@/lib/ai-billing.mjs";
import { saveUserAiBillingMode, UserSettingsError } from "@/lib/user-settings.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  const auth = await authenticateUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const body = (await request.json()) as { mode?: unknown };
    await saveUserAiBillingMode(auth, body.mode);
    return Response.json(await getAiBillingStatus(auth));
  } catch (error) {
    return settingsErrorResponse(error);
  }
}

async function authenticateUser(request: Request) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }
  const userId = getAuthenticatedUserId(request);
  return userId || Response.json({ error: "A user identity is required." }, { status: 401 });
}

function settingsErrorResponse(error: unknown) {
  if (error instanceof UserSettingsError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "Unable to update AI billing mode." }, { status: 500 });
}
