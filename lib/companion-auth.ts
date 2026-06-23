import { getCompanionToken } from "./env";

export function requireCompanionAuth(request: Request) {
  const expectedToken = getCompanionToken();
  if (!expectedToken) {
    return Response.json({ error: "Local companion auth is not configured." }, { status: 503 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token || token !== expectedToken) {
    return Response.json({ error: "Companion authentication is required." }, { status: 401 });
  }

  return null;
}
