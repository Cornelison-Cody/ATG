import { requireEditorAuth } from "@/lib/api-auth";
import {
  canEditProject,
  canManageProject,
  getProjectAccessRole,
  getProjectPrincipal,
  principalRequiredResponse,
  projectAccessResponse
} from "@/lib/project-access";
import {
  claimProject,
  getProject,
  ProjectStoreError,
  softDeleteProject,
  toPublicProject,
  updateProjectDetails
} from "@/lib/projects";
import { getProjectStore } from "@/lib/project-store";
import { validateProjectDetailsPatch } from "@/lib/project-name-rules.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const principal = getProjectPrincipal(request);
  if (!principal) {
    return principalRequiredResponse();
  }

  const { id } = await context.params;
  let project = await getProject(id);

  if (!project || project.status === "deleted") {
    return Response.json({ error: "Project was not found." }, { status: 404 });
  }

  if (!project.ownerUserId) {
    project = await claimProject(id, principal);
  }

  if (!canEditProject(project, principal)) {
    return projectAccessResponse();
  }

  const config = await getProjectStore().readGameConfig(project);
  return Response.json({ project: { ...project, engine: config.engine, accessRole: getProjectAccessRole(project, principal) } });
}

export async function DELETE(request: Request, context: RouteContext) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  try {
    const { id } = await context.params;
    const principal = getProjectPrincipal(request);
    if (!principal) {
      return principalRequiredResponse();
    }

    const existingProject = await getProject(id);
    if (!existingProject || existingProject.status === "deleted") {
      return Response.json({ error: "Project was not found." }, { status: 404 });
    }
    const projectForAccess = existingProject.ownerUserId ? existingProject : await claimProject(id, principal);
    if (!canManageProject(projectForAccess, principal)) {
      return projectAccessResponse("Only the project owner can delete this project.");
    }

    const project = await softDeleteProject(id);
    return Response.json({ project: toPublicProject(project, principal) });
  } catch (error) {
    if (error instanceof ProjectStoreError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json({ error: "Unable to delete project." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  try {
    const principal = getProjectPrincipal(request);
    if (!principal) {
      return principalRequiredResponse();
    }

    const body = await request.json();
    const validation = validateProjectDetailsPatch(body);
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    const { id } = await context.params;
    const existingProject = await getProject(id);
    if (!existingProject || existingProject.status === "deleted") {
      return Response.json({ error: "Project was not found." }, { status: 404 });
    }
    const projectForAccess = existingProject.ownerUserId ? existingProject : await claimProject(id, principal);
    if (!canEditProject(projectForAccess, principal)) {
      return projectAccessResponse();
    }
    if (validation.visibility !== undefined && !canManageProject(projectForAccess, principal)) {
      return projectAccessResponse("Only the project owner can change visibility.");
    }

    const project = await updateProjectDetails(id, {
      name: validation.name,
      visibility: validation.visibility
    });
    return Response.json({ project: toPublicProject(project, principal) });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Project details must be valid JSON." }, { status: 400 });
    }

    if (error instanceof ProjectStoreError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json({ error: "Unable to update project." }, { status: 500 });
  }
}
