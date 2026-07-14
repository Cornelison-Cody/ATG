import type { ProjectRecord } from "./project-types";

export type ProjectPrincipal = {
  principalName: string;
  userId: string;
};

export function normalizePrincipalName(value: unknown): string;
export function isProjectOwner(project: ProjectRecord, principal: ProjectPrincipal | null): boolean;
export function isProjectCollaborator(project: ProjectRecord, principal: ProjectPrincipal | null): boolean;
export function getProjectAccessRole(
  project: ProjectRecord,
  principal: ProjectPrincipal | null
): "owner" | "collaborator" | null;
export function canEditProject(project: ProjectRecord, principal: ProjectPrincipal | null): boolean;
export function canManageProject(project: ProjectRecord, principal: ProjectPrincipal | null): boolean;

