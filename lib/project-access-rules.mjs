export function normalizePrincipalName(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isProjectOwner(project, principal) {
  return Boolean(project.ownerUserId && principal?.userId && project.ownerUserId === principal.userId);
}

export function isProjectCollaborator(project, principal) {
  const principalName = normalizePrincipalName(principal?.principalName);
  return Boolean(
    principalName &&
      project.collaborators?.some(
        (collaborator) => normalizePrincipalName(collaborator.principalName) === principalName
      )
  );
}

export function getProjectAccessRole(project, principal) {
  if (!principal) {
    return null;
  }

  if (!project.ownerUserId || isProjectOwner(project, principal)) {
    return "owner";
  }

  if (isProjectCollaborator(project, principal)) {
    return "collaborator";
  }

  return null;
}

export function canEditProject(project, principal) {
  return Boolean(getProjectAccessRole(project, principal));
}

export function canManageProject(project, principal) {
  return getProjectAccessRole(project, principal) === "owner";
}

