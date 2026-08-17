export function captureConversionIdentity(project, { assets = [], instructions = "", savedState = null } = {}) {
  if (!project?.id || !project.slug || !project.path) throw new Error("Project identity requires id, slug, and path.");
  return deepFreeze({
    id: project.id,
    slug: project.slug,
    path: project.path,
    name: project.name,
    ownerUserId: project.ownerUserId || null,
    ownerName: project.ownerName || null,
    collaborators: cloneCollaborators(project.collaborators),
    visibility: project.visibility,
    tvUrl: `/tv/${encodeURIComponent(project.id)}`,
    phoneUrl: `/join/${encodeURIComponent(project.id)}`,
    assets: uniqueAssets(assets),
    instructions: typeof instructions === "string" ? instructions : "",
    savedState: savedState == null ? null : structuredClone(savedState),
    activeSession: null
  });
}

export function acceptConversionIdentity(identity, candidate, revision) {
  if (!identity?.id || !candidate) throw new Error("A conversion identity and candidate are required.");
  if (!revision || typeof revision !== "string") throw new Error("An accepted conversion revision is required.");
  return {
    ...candidate,
    id: identity.id,
    slug: identity.slug,
    path: identity.path,
    name: identity.name,
    ownerUserId: identity.ownerUserId,
    ownerName: identity.ownerName,
    collaborators: cloneCollaborators(identity.collaborators),
    visibility: identity.visibility,
    assets: uniqueAssets(identity.assets),
    instructions: identity.instructions,
    savedState: identity.savedState == null ? null : structuredClone(identity.savedState),
    activeSession: null,
    revision,
    previousRevision: candidate.revision || null
  };
}

export function assertIdentityPreserved(identity, project) {
  const fields = ["id", "slug", "path", "ownerUserId", "ownerName", "visibility"];
  for (const field of fields) {
    if ((identity?.[field] ?? null) !== (project?.[field] ?? null)) throw new Error(`Conversion changed project identity field: ${field}.`);
  }
  const identityAssets = new Set((identity.assets || []).map((asset) => asset.path));
  const projectAssets = new Set((project.assets || []).map((asset) => asset.path));
  if (identityAssets.size !== projectAssets.size || [...identityAssets].some((asset) => !projectAssets.has(asset))) {
    throw new Error("Conversion changed the uploaded asset set.");
  }
  return true;
}

function cloneCollaborators(collaborators) {
  return (Array.isArray(collaborators) ? collaborators : []).map((collaborator) => ({
    principalName: collaborator.principalName,
    invitedAt: collaborator.invitedAt
  }));
}

function uniqueAssets(assets) {
  const seen = new Set();
  return (Array.isArray(assets) ? assets : []).filter((asset) => {
    if (!asset?.path || seen.has(asset.path)) return false;
    seen.add(asset.path);
    return true;
  }).map((asset) => ({ ...asset }));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
