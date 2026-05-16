import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { hasBearerToken, isAuthenticatedRequest, isEditorAuthConfigured, isProduction } from "@/lib/auth";

const jwksByTenant = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function requireEditorAuth(request: Request) {
  if (!isProduction()) {
    return null;
  }

  if (!isEditorAuthConfigured()) {
    return Response.json(
      { error: "Editor authentication is not configured for production." },
      { status: 503 }
    );
  }

  if (isAuthenticatedRequest(request)) {
    return null;
  }

  if (hasBearerToken(request)) {
    const bearerResult = await validateServicePrincipalToken(request);
    if (bearerResult.ok) {
      return null;
    }

    return Response.json({ error: bearerResult.error }, { status: 401 });
  }

  return Response.json({ error: "Authentication is required." }, { status: 401 });
}

async function validateServicePrincipalToken(request: Request) {
  const tenantId = process.env.ENTRA_TENANT_ID;
  const configuredAudience = process.env.ENTRA_API_AUDIENCE;
  const clientId = process.env.ENTRA_CLIENT_ID;
  const allowedAppIds = parseList(process.env.ENTRA_ALLOWED_APP_IDS);

  if (!tenantId || !clientId) {
    return { ok: false, error: "Editor authentication is not configured for production." };
  }

  if (allowedAppIds.length === 0) {
    return { ok: false, error: "Service principal authentication is not configured." };
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { ok: false, error: "Authentication is required." };
  }

  try {
    const audience = configuredAudience || `api://${clientId}`;
    const issuer = [
      `https://login.microsoftonline.com/${tenantId}/v2.0`,
      `https://sts.windows.net/${tenantId}/`
    ];
    const { payload } = await jwtVerify(token, getTenantJwks(tenantId), {
      audience,
      issuer
    });

    const callerAppId = getCallerAppId(payload);
    if (!callerAppId || !allowedAppIds.includes(callerAppId)) {
      return { ok: false, error: "Service principal is not authorized for this app." };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Bearer token is invalid or expired." };
  }
}

function getTenantJwks(tenantId: string) {
  const existing = jwksByTenant.get(tenantId);
  if (existing) {
    return existing;
  }

  const jwks = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`));
  jwksByTenant.set(tenantId, jwks);
  return jwks;
}

function getCallerAppId(payload: JWTPayload) {
  const appid = typeof payload.appid === "string" ? payload.appid : "";
  const azp = typeof payload.azp === "string" ? payload.azp : "";
  return azp || appid;
}

function parseList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
