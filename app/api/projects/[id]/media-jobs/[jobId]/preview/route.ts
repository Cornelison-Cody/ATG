import { requireEditorAuth } from "@/lib/api-auth";
import { canEditProject, getProjectPrincipal, principalRequiredResponse, projectAccessResponse } from "@/lib/project-access";
import { getProject } from "@/lib/projects";
import { readMediaJobPreview, MediaJobStoreError } from "@/lib/media-job-manager.mjs";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; jobId: string }> }) {
  try {
    const auth = await requireEditorAuth(request); if (auth) return auth;
    const principal = getProjectPrincipal(request); if (!principal) return principalRequiredResponse();
    const { id, jobId } = await context.params; const project = await getProject(id);
    if (!project || !canEditProject(project, principal)) return project ? projectAccessResponse() : Response.json({ error: "Project was not found." }, { status: 404 });
    const preview = await readMediaJobPreview(id, jobId);
    return new Response(preview.content, { headers: { "Cache-Control": "no-store", "Content-Type": preview.contentType, "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Media preview was not found." }, { status: error instanceof MediaJobStoreError ? error.status : 500 }); }
}
