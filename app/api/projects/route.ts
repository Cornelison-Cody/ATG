import { requireEditorAuth } from "@/lib/api-auth";
import { getProjectPrincipal, principalRequiredResponse } from "@/lib/project-access";
import { createProject, listProjects, ProjectStoreError, toPublicProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const principal = getProjectPrincipal(request);
  if (!principal) {
    return principalRequiredResponse();
  }

  const projects = await listProjects(principal);
  return Response.json({ projects });
}

export async function POST(request: Request) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const principal = getProjectPrincipal(request);
  if (!principal) {
    return principalRequiredResponse();
  }

  try {
    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name : "";
    const project = await createProject(name, principal);
    return Response.json({ project: toPublicProject(project, principal) }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectStoreError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json({ error: "Unable to create project." }, { status: 500 });
  }
}
