import { requireEditorAuth } from "@/lib/api-auth";
import { getProject } from "@/lib/projects";
import { requireProjectRuntimeAccess } from "@/lib/project-access";
import { readGameConfig, updateGameConfig } from "@/lib/project-game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const project = await getActiveProject(context);
  if (!project) {
    return Response.json({ error: "Project was not found." }, { status: 404 });
  }

  const authResponse = await requireProjectRuntimeAccess(request, project);
  if (authResponse) {
    return authResponse;
  }

  return Response.json({ config: await readGameConfig(project) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const project = await getActiveProject(context);
  if (!project) {
    return Response.json({ error: "Project was not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const configPatch =
    typeof body === "object" && body !== null && "config" in body
      ? (body as { config?: unknown }).config
      : body;

  return Response.json({ config: await updateGameConfig(project, configPatch) });
}

async function getActiveProject(context: RouteContext) {
  const { projectId } = await context.params;
  const project = await getProject(projectId);
  return project && project.status !== "deleted" ? project : null;
}
