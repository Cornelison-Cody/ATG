import { getAiWorkerUrl, STORAGE_BACKEND } from "@/lib/env";

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
      storageBackend: STORAGE_BACKEND,
      azureCosmosConfigured: Boolean(process.env.AZURE_COSMOS_ENDPOINT && process.env.AZURE_COSMOS_DATABASE),
      azureBlobConfigured: Boolean(
        process.env.AZURE_STORAGE_CONNECTION_STRING && process.env.AZURE_STORAGE_GAME_ASSETS_CONTAINER
      )
    }
  });
}
