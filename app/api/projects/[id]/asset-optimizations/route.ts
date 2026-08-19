import { requireEditorAuth } from "@/lib/api-auth";
import { canEditProject, getProjectPrincipal, principalRequiredResponse, projectAccessResponse } from "@/lib/project-access";
import { getProject } from "@/lib/projects";
import { AssetOptimizationError, listAssetOptimizations, startAssetOptimization } from "@/lib/asset-optimization-manager.mjs";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) { try { const access = await authorize(request, context); if (access instanceof Response) return access; return Response.json({ optimizations: listAssetOptimizations(access.id) }); } catch (error) { return respond(error); } }
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { try { const access = await authorize(request, context); if (access instanceof Response) return access; return Response.json({ optimization: await startAssetOptimization(access, await request.json().catch(() => ({})) ) }, { status: 202 }); } catch (error) { return respond(error); } }
async function authorize(request: Request, context: { params: Promise<{ id: string }> }) { const auth = await requireEditorAuth(request); if (auth) return auth; const principal = getProjectPrincipal(request); if (!principal) return principalRequiredResponse(); const { id } = await context.params; const project = await getProject(id); if (!project || project.status === "deleted") return Response.json({ error: "Project was not found." }, { status: 404 }); if (!canEditProject(project, principal)) return projectAccessResponse(); return project; }
function respond(error: unknown) { return Response.json({ error: error instanceof Error ? error.message : "Asset optimization failed." }, { status: error instanceof AssetOptimizationError ? error.status : 500 }); }
