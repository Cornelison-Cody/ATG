import { requireEditorAuth } from "@/lib/api-auth";
import {
  canEditProject,
  getProjectPrincipal,
  principalRequiredResponse,
  projectAccessResponse
} from "@/lib/project-access";
import { claimProject, getProject, ProjectStoreError } from "@/lib/projects";
import { deleteGameAsset, listUploadedGameAssets, uploadGameAsset } from "@/lib/project-game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const access = await requireAssetAccess(request, context);
  if (access instanceof Response) {
    return access;
  }

  return Response.json({ assets: await listUploadedGameAssets(access.project) });
}

export async function POST(request: Request, context: RouteContext) {
  const access = await requireAssetAccess(request, context);
  if (access instanceof Response) {
    return access;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "Asset file is required." }, { status: 400 });
    }

    const asset = await uploadGameAsset(access.project, {
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
      filename: file.name
    });
    return Response.json({ asset });
  } catch (error) {
    if (error instanceof ProjectStoreError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json({ error: "Unable to upload asset." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const access = await requireAssetAccess(request, context);
  if (access instanceof Response) {
    return access;
  }

  try {
    const url = new URL(request.url);
    const assetPath = url.searchParams.get("path") ?? "";
    await deleteGameAsset(access.project, assetPath);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof ProjectStoreError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json({ error: "Unable to delete asset." }, { status: 500 });
  }
}

async function requireAssetAccess(request: Request, context: RouteContext) {
  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

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
  if (!canEditProject(projectForAccess, principal)) {
    return projectAccessResponse();
  }

  return { project: projectForAccess };
}
