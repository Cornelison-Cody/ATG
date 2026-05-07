import { getAiWorkerUrl } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "azure-tides-gaming",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    dependencies: {
      aiWorkerConfigured: Boolean(getAiWorkerUrl()),
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      objectStorageConfigured: Boolean(process.env.OBJECT_STORAGE_BUCKET)
    }
  });
}
