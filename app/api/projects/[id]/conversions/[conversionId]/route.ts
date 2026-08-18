import { requireEditorAuth } from "@/lib/api-auth";
import { canEditProject, getProjectPrincipal, principalRequiredResponse, projectAccessResponse } from "@/lib/project-access";
import { getProject } from "@/lib/projects";
import { acceptConversionCandidate, cancelConversionRun, getConversionForProject, retryConversionRun, validateConversionCandidate } from "@/lib/conversion-manager.mjs";
import { ConversionStoreError } from "@/lib/conversion-store.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; conversionId: string }> }) {
  try {
    const access = await authorize(request, context);
    if (access.response) return access.response;
    const { conversionId } = await context.params;
    return Response.json({ conversion: await getConversionForProject(access.project.id, conversionId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return conversionError(error, "Unable to read conversion.");
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string; conversionId: string }> }) {
  try {
    const access = await authorize(request, context);
    if (access.response) return access.response;
    const { conversionId } = await context.params;
    const body = await request.json().catch(() => ({}));
    if (body.action === "accept") {
      return Response.json({ conversion: await acceptConversionCandidate(access.project, conversionId, body.acknowledgeWarnings === true) });
    }
    if (body.action === "cancel") {
      return Response.json({ conversion: await cancelConversionRun(conversionId) });
    }
    if (body.action === "retry") {
      return Response.json({ conversion: await retryConversionRun(conversionId) });
    }
    if (body.action === "validate") {
      return Response.json({ conversion: await validateConversionCandidate(conversionId, body) });
    }
    return Response.json({ error: "Conversion action must be accept, cancel, retry, or validate." }, { status: 400 });
  } catch (error) {
    return conversionError(error, "Unable to update conversion.");
  }
}

async function authorize(request: Request, context: { params: Promise<{ id: string; conversionId: string }> }) {
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
  const status = error instanceof ConversionStoreError ? error.status : 500;
  return Response.json({ error: error instanceof Error ? error.message : fallback }, { status });
}
