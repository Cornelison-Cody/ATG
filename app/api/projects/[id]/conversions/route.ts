import { randomUUID } from "node:crypto";
import { requireEditorAuth } from "@/lib/api-auth";
import { canEditProject, getProjectPrincipal, principalRequiredResponse, projectAccessResponse } from "@/lib/project-access";
import { getProject, ProjectStoreError } from "@/lib/projects";
import { startConversion } from "@/lib/conversion-manager.mjs";
import { ConversionStoreError, listProjectConversions } from "@/lib/conversion-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await authorize(request, context);
    if (access.response) return access.response;
    return Response.json({ conversions: await listProjectConversions(access.project.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return conversionError(error, "Unable to list conversions.");
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = await authorize(request, context);
    if (access.response) return access.response;
    const body = await request.json().catch(() => ({}));
    const conversionId = typeof body.conversionId === "string" && body.conversionId.trim() ? body.conversionId.trim() : randomUUID();
    const conversion = await startConversion(access.project, conversionId);
    return Response.json({ conversion }, { status: 201 });
  } catch (error) {
    return conversionError(error, "Unable to start conversion.");
  }
}

async function authorize(request: Request, context: { params: Promise<{ id: string }> }) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) return { response: authResponse };
  const principal = getProjectPrincipal(request);
  if (!principal) return { response: principalRequiredResponse() };
  const { id } = await context.params;
  const project = await getProject(id);
  if (!project || project.status === "deleted") return { response: Response.json({ error: "Project was not found." }, { status: 404 }) };
  if (!canEditProject(project, principal)) return { response: projectAccessResponse() };
  return { project };
}

function conversionError(error: unknown, fallback: string) {
  const status = error instanceof ConversionStoreError || error instanceof ProjectStoreError ? error.status : 500;
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status });
}
