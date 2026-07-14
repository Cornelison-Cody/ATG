import { requireEditorAuth } from "@/lib/api-auth";
import {
  getProject,
  ProjectStoreError,
  softDeleteProject,
  toPublicProject,
  updateProjectDetails
} from "@/lib/projects";
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

  const { id } = await context.params;
  const project = await getProject(id);

  if (!project || project.status === "deleted") {
    return Response.json({ error: "Project was not found." }, { status: 404 });
  }

  return Response.json({ project });
}

export async function DELETE(request: Request, context: RouteContext) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  try {
    const { id } = await context.params;
    const project = await softDeleteProject(id);
    return Response.json({ project: toPublicProject(project) });
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
    const body = await request.json();
    const validation = validateProjectDetailsPatch(body);
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: 400 });
    }

    const { id } = await context.params;
    const project = await updateProjectDetails(id, {
      name: validation.name,
      visibility: validation.visibility
    });
    return Response.json({ project: toPublicProject(project) });
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
