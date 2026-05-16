import { requireEditorAuth } from "@/lib/api-auth";
import { getProject, ProjectStoreError, softDeleteProject, toPublicProject } from "@/lib/projects";

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
