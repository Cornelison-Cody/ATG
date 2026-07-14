import { getProjectStore, ProjectStoreError, toPublicProject } from "./project-store";
import type { ChatMessage, ProjectRecord, PublicProject } from "./project-types";

export type { ChatMessage, ProjectRecord, PublicProject };
export { ProjectStoreError, toPublicProject };

export async function listProjects() {
  return getProjectStore().listProjects();
}

export async function getProject(projectId: string) {
  return getProjectStore().getProject(projectId);
}

export async function createProject(name: string) {
  return getProjectStore().createProject(name);
}

export async function updateProjectDetails(
  projectId: string,
  patch: { name?: string; visibility?: ProjectRecord["visibility"] }
) {
  return getProjectStore().updateProjectDetails(projectId, patch);
}

export async function softDeleteProject(projectId: string) {
  return getProjectStore().softDeleteProject(projectId);
}

export async function appendProjectMessages(projectId: string, messages: ChatMessage[]) {
  return getProjectStore().appendProjectMessages(projectId, messages);
}

export async function updateProjectThread(projectId: string, codexThreadId: string) {
  return getProjectStore().updateProjectThread(projectId, codexThreadId);
}
