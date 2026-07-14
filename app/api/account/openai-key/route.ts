import { getAuthenticatedUserId } from "@/lib/auth";
import { requireEditorAuth } from "@/lib/api-auth";
import { validateOpenAiApiKey } from "@/lib/openai-key-validation.mjs";
import {
  deleteUserApiKey,
  getUserApiKey,
  hasUserApiKey,
  saveUserApiKey,
  UserSettingsError
} from "@/lib/user-settings.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateUser(request);
  if (auth instanceof Response) {
    return auth;
  }
  return Response.json({
    configured: await hasUserApiKey(auth),
    serverFallbackConfigured: Boolean(process.env.OPENAI_API_KEY)
  });
}

export async function PUT(request: Request) {
  const auth = await authenticateUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const body = (await request.json()) as { apiKey?: unknown };
    await saveUserApiKey(auth, body.apiKey);
    return Response.json({ configured: true });
  } catch (error) {
    return settingsErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const auth = await authenticateUser(request);
  if (auth instanceof Response) {
    return auth;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { apiKey?: unknown };
    const apiKey = typeof body.apiKey === "string" && body.apiKey.trim()
      ? body.apiKey
      : await getUserApiKey(auth);
    if (!apiKey) {
      throw new UserSettingsError("Save an OpenAI API key before testing it.", 400);
    }
    const result = await validateOpenAiApiKey(apiKey);
    return Response.json(result);
  } catch (error) {
    return settingsErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const auth = await authenticateUser(request);
  if (auth instanceof Response) {
    return auth;
  }
  try {
    await deleteUserApiKey(auth);
    return Response.json({ configured: false });
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
  return Response.json({ error: "Unable to update OpenAI API-key settings." }, { status: 500 });
}
