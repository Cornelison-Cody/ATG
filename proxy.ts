import { NextRequest, NextResponse } from "next/server";
import { hasBearerToken, isAuthenticatedRequest, isEditorAuthConfigured, isPublicRuntimePath } from "./lib/auth";

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (isPublicRuntimePath(pathname)) {
    return NextResponse.next();
  }

  if (!isEditorAuthConfigured()) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Editor authentication is not configured for production." },
        { status: 503 }
      );
    }

    return new NextResponse("Editor authentication is not configured for production.", {
      status: 503
    });
  }

  if (isAuthenticatedRequest(request)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/") && hasBearerToken(request)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/.auth/login/aad";
  loginUrl.searchParams.set("post_login_redirect_uri", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
