import { getGameUrls } from "@/lib/network";
import { getProject } from "@/lib/projects";
import { readGameConfig } from "@/lib/project-game";

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

  const config = await readGameConfig(project);

  return Response.json({
    config,
    joinUrl: getGameUrls(projectId).joinUrl,
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug
    },
    wsUrl: getGameUrls(projectId).wsUrl
  });
}
