import { requireEditorAuth } from "@/lib/api-auth";
import {
  canManageProject,
  getProjectPrincipal,
  principalRequiredResponse,
  projectAccessResponse
} from "@/lib/project-access";
import {
  addProjectCollaborator,
  claimProject,
  getProject,
  ProjectStoreError,
  removeProjectCollaborator,
  toPublicProject
} from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  try {
    const access = await requireOwnerAccess(request, context);
    if (access instanceof Response) {
      return access;
    }

    const body = (await request.json()) as { principalName?: unknown };
    const principalName = typeof body.principalName === "string" ? body.principalName : "";
    const project = await addProjectCollaborator(access.project.id, principalName);
    return Response.json({ project: toPublicProject(project, access.principal) });
  } catch (error) {
    return collaboratorErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  try {
    const access = await requireOwnerAccess(request, context);
    if (access instanceof Response) {
      return access;
    }

    const body = (await request.json()) as { principalName?: unknown };
    const principalName = typeof body.principalName === "string" ? body.principalName : "";
    const project = await removeProjectCollaborator(access.project.id, principalName);
    return Response.json({ project: toPublicProject(project, access.principal) });
  } catch (error) {
    return collaboratorErrorResponse(error);
  }
}

async function requireOwnerAccess(request: Request, context: RouteContext) {
  const principal = getProjectPrincipal(request);
  if (!principal) {
    return principalRequiredResponse();
  }

  const { id } = await context.params;
  const project = await getProject(id);
  if (!project || project.status === "deleted") {
    return Response.json({ error: "Project was not found." }, { status: 404 });
  }

  const projectForAccess = project.ownerUserId ? project : await claimProject(id, principal);
  if (!canManageProject(projectForAccess, principal)) {
    return projectAccessResponse("Only the project owner can manage collaborators.");
  }

  return { principal, project: projectForAccess };
}

function collaboratorErrorResponse(error: unknown) {
  if (error instanceof SyntaxError) {
    return Response.json({ error: "Collaborator details must be valid JSON." }, { status: 400 });
  }

  if (error instanceof ProjectStoreError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  return Response.json({ error: "Unable to update collaborators." }, { status: 500 });
}
