import { getGameUrls } from "@/lib/network";
import { getProject } from "@/lib/projects";
import { readGameConfig } from "@/lib/project-game";
import { GameEngineMetadataError } from "@/lib/game-engine-metadata.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  const project = await getProject(projectId);

  if (!project || project.status === "deleted") {
    return Response.json({ error: "Project was not found." }, { status: 404 });
  }

  let config;
  try {
    config = await readGameConfig(project);
  } catch (error) {
    if (error instanceof GameEngineMetadataError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

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
