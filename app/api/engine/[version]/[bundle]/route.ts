import { readFile } from "fs/promises";
import path from "path";
import {
  getAtgEngineBundle,
  getAtgEngineCompatibilityError
} from "@/lib/atg-engine-bundles.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ bundle: string; version: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { bundle: bundleName, version } = await context.params;
  const bundle = getAtgEngineBundle(version, bundleName);
  if (!bundle) {
    return Response.json(
      { error: getAtgEngineCompatibilityError(version) },
      { headers: { "Cache-Control": "no-store" }, status: 404 }
    );
  }

  try {
    const source = await readFile(path.join(process.cwd(), bundle.file));
    return new Response(source, {
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Type": bundle.contentType,
        "Access-Control-Allow-Origin": "*",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "ETag": `\"${bundle.integrity}\"`,
        "X-Content-Type-Options": "nosniff",
        "X-ATG-Engine-Integrity": bundle.integrity,
        "X-ATG-Engine-Runtime": bundle.runtimeVersion
      }
    });
  } catch {
    return Response.json(
      { error: "The requested ATG engine bundle is not deployed." },
      { headers: { "Cache-Control": "no-store" }, status: 503 }
    );
  }
}
