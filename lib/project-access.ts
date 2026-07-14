import { requireEditorAuth } from "@/lib/api-auth";
import { getAuthenticatedPrincipalName, getAuthenticatedUserId } from "@/lib/auth";
import type { ProjectRecord } from "@/lib/project-types";
import {
  canEditProject,
  canManageProject,
  getProjectAccessRole,
  normalizePrincipalName
} from "./project-access-rules.mjs";

export type ProjectPrincipal = {
  principalName: string;
  userId: string;
};

export function getProjectPrincipal(request: Request): ProjectPrincipal | null {
  const userId = getAuthenticatedUserId(request);
  const principalName = normalizePrincipalName(getAuthenticatedPrincipalName(request) || userId);

  if (!userId || !principalName) {
    return null;
  }

  return { principalName, userId };
}

export { canEditProject, canManageProject, getProjectAccessRole, normalizePrincipalName };

export function projectAccessResponse(message = "You do not have access to this project.") {
  return Response.json({ error: message }, { status: 403 });
}

export function principalRequiredResponse() {
  return Response.json({ error: "A user identity is required." }, { status: 401 });
}

export async function requireProjectRuntimeAccess(request: Request, project: ProjectRecord) {
  if (project.visibility === "public") {
    return null;
  }

  const authResponse = await requireEditorAuth(request);
  if (authResponse) {
    return authResponse;
  }

  const principal = getProjectPrincipal(request);
  if (!principal) {
    return principalRequiredResponse();
  }

  if (canEditProject(project, principal)) {
    return null;
  }

  return projectAccessResponse();
}
