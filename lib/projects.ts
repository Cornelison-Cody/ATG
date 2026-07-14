import { getProjectStore, ProjectOwnerInput, ProjectStoreError, toPublicProject } from "./project-store";
import type { ChatMessage, ProjectRecord, PublicProject } from "./project-types";

export type { ChatMessage, ProjectRecord, PublicProject };
export { ProjectStoreError, toPublicProject };

export async function listProjects(principal?: ProjectOwnerInput) {
  return getProjectStore().listProjects(principal);
}

export async function getProject(projectId: string) {
  return getProjectStore().getProject(projectId);
}

export async function createProject(name: string, owner: ProjectOwnerInput) {
  return getProjectStore().createProject(name, owner);
}

export async function claimProject(projectId: string, owner: ProjectOwnerInput) {
  return getProjectStore().claimProject(projectId, owner);
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

export async function addProjectCollaborator(projectId: string, principalName: string) {
  return getProjectStore().addProjectCollaborator(projectId, principalName);
}

export async function removeProjectCollaborator(projectId: string, principalName: string) {
  return getProjectStore().removeProjectCollaborator(projectId, principalName);
}

export async function appendProjectMessages(projectId: string, messages: ChatMessage[]) {
  return getProjectStore().appendProjectMessages(projectId, messages);
}

export async function updateProjectThread(projectId: string, codexThreadId: string) {
  return getProjectStore().updateProjectThread(projectId, codexThreadId);
}
