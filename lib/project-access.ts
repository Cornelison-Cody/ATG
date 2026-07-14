import { requireEditorAuth } from "@/lib/api-auth";
import type { ProjectRecord } from "@/lib/project-types";

export async function requireProjectRuntimeAccess(request: Request, project: ProjectRecord) {
  if (project.visibility === "public") {
    return null;
  }

  return requireEditorAuth(request);
}
