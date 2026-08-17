import { requireEditorAuth } from "@/lib/api-auth";
import { claimProject, getProject } from "@/lib/projects";
import {
  canEditProject,
  getProjectPrincipal,
  principalRequiredResponse,
  projectAccessResponse,
  requireProjectRuntimeAccess
} from "@/lib/project-access";
import { readGameConfig, updateGameConfig } from "@/lib/project-game";
import { GameEngineMetadataError } from "@/lib/game-engine-metadata.mjs";

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

  try {
    return Response.json({ config: await readGameConfig(project) });
  } catch (error) {
    return gameConfigErrorResponse(error);
  }
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

  const principal = getProjectPrincipal(request);
  if (!principal) {
    return principalRequiredResponse();
  }
  const projectForAccess = project.ownerUserId ? project : await claimProject(project.id, principal);
  if (!canEditProject(projectForAccess, principal)) {
    return projectAccessResponse();
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

  try {
    return Response.json({ config: await updateGameConfig(projectForAccess, configPatch) });
  } catch (error) {
    return gameConfigErrorResponse(error);
  }
}

function gameConfigErrorResponse(error: unknown) {
  if (error instanceof GameEngineMetadataError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  throw error;
}

async function getActiveProject(context: RouteContext) {
  const { projectId } = await context.params;
  const project = await getProject(projectId);
  return project && project.status !== "deleted" ? project : null;
}
