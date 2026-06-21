import { requireEditorAuth } from "@/lib/api-auth";
import { getProject, ProjectStoreError } from "@/lib/projects";
import { readGameInstructions, updateGameInstructions } from "@/lib/project-game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const project = await getProject(projectId);

  if (!project || project.status === "deleted") {
    return Response.json({ error: "Project was not found." }, { status: 404 });
  }

  return Response.json({ instructions: await readGameInstructions(project) });
}

export async function PATCH(request: Request, context: RouteContext) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const { projectId } = await context.params;
  const project = await getProject(projectId);

  if (!project || project.status === "deleted") {
    return Response.json({ error: "Project was not found." }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { instructions?: unknown };
    const instructions = await updateGameInstructions(project, body.instructions as string);
    return Response.json({ instructions });
  } catch (error) {
    if (error instanceof ProjectStoreError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
}
