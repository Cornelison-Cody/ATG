const PUBLIC_PATH_PREFIXES = [
  "/api/health",
  "/icon.png",
  "/images/"
];

const PUBLIC_GAME_ASSET_MARKER = "/game-assets/";

export function isEditorAuthConfigured() {
  return Boolean(process.env.ENTRA_TENANT_ID && process.env.ENTRA_CLIENT_ID);
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function isAuthenticatedRequest(request: Request) {
  if (!isProduction()) {
    return true;
  }

  const principal = request.headers.get("x-ms-client-principal");
  const principalName = request.headers.get("x-ms-client-principal-name");
  const objectId = request.headers.get("x-ms-client-principal-id");
  return Boolean(principal || principalName || objectId);
}

export function hasBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  return Boolean(authorization?.startsWith("Bearer "));
}

export function getAuthenticatedUserId(request: Request) {
  if (!isProduction()) {
    return "local-development-user";
  }

  return (
    request.headers.get("x-ms-client-principal-id") ||
    request.headers.get("x-ms-client-principal-name") ||
    ""
  ).trim();
}

export function getAuthenticatedPrincipalName(request: Request) {
  if (!isProduction()) {
    return "local-development-user";
  }

  return (
    request.headers.get("x-ms-client-principal-name") ||
    request.headers.get("x-ms-client-principal-id") ||
    ""
  ).trim();
}

export function requireEditorAuth(request: Request) {
  if (!isProduction()) {
    return null;
  }

  if (!isEditorAuthConfigured()) {
    return Response.json(
      { error: "Editor authentication is not configured for production." },
      { status: 503 }
    );
  }

  if (!isAuthenticatedRequest(request)) {
    return Response.json({ error: "Authentication is required." }, { status: 401 });
  }

  return null;
}

export function isPublicRuntimePath(pathname: string) {
  if (pathname === "/") {
    return true;
  }

  if (pathname.startsWith("/_next/") || pathname === "/favicon.ico") {
    return false;
  }

  if (pathname.startsWith("/tv/") || pathname.startsWith("/join/") || pathname === "/ws/game") {
    return true;
  }

  if (pathname.includes(PUBLIC_GAME_ASSET_MARKER)) {
    return true;
  }

  if (/^\/api\/game\/[^/]+\/join-info$/.test(pathname)) {
    return true;
  }

  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
