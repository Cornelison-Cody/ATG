export function buildGameAssetUrl(projectId, target, revision) {
  const path = `/api/projects/${encodeURIComponent(projectId)}/game-assets/${target}.html`;
  return revision ? `${path}?v=${encodeURIComponent(revision)}` : path;
}
