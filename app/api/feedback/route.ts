import { getAuthenticatedPrincipalName, getAuthenticatedUserId } from "@/lib/auth";
import { requireEditorAuth } from "@/lib/api-auth";
import { GitHubFeedbackError, submitGitHubFeedback } from "@/lib/github-feedback.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const userId = getAuthenticatedUserId(request);
  const submitterEmail = getAuthenticatedPrincipalName(request);
  if (!userId) {
    return Response.json({ error: "A user identity is required." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const context = parseJsonObject(value(formData, "context"));
    const result = await submitGitHubFeedback({
      body: value(formData, "body"),
      context,
      idempotencyKey: value(formData, "idempotencyKey"),
      issueType: value(formData, "issueType"),
      submitterEmail,
      title: value(formData, "title"),
      userId
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof GitHubFeedbackError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unable to submit feedback.";
    console.error("Feedback submission failed.", {
      status,
      userHash: hashHint(userId)
    });
    return Response.json({ error: message }, { status });
  }
}

function value(formData: FormData, name: string) {
  const item = formData.get(name);
  return typeof item === "string" ? item : "";
}

function parseJsonObject(value: string) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function hashHint(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 8);
}
