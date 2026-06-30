export class CompanionCompletionError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "CompanionCompletionError";
    this.status = status;
  }
}

export async function applyCompanionCompletion({
  completeJob,
  files,
  finalMessage,
  job,
  loadProject,
  saveFiles
}) {
  try {
    const project = await loadProject(job.project.id);
    if (!project || project.status === "deleted") {
      throw new CompanionCompletionError("Project was not found.", 404);
    }

    await saveFiles(project, files);
    const message =
      typeof finalMessage === "string" && finalMessage.trim()
        ? finalMessage.trim()
        : "Local companion finished updating the project.";
    completeJob(job.id, { type: "final", message });
    return { message, project };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to apply local companion changes.";
    completeJob(job.id, { type: "error", message });
    throw error;
  }
}
