import { registerBackgroundJobHandler } from "./background-worker.mjs";
import { executeMediaJob } from "./media-job-manager.mjs";
import { getProjectStore } from "./project-store";
import { runAssetOptimizationJob } from "./asset-optimization-manager.mjs";

registerBackgroundJobHandler("media-generation", async (job, context) => {
  await context.progress({ phase: "generating", completed: 0, total: 1, message: "Generating media" });
  const media = job.payload.mediaJobId && await (await import("./media-job-store.mjs")).getMediaJob(job.payload.mediaJobId);
  const project = media && await getProjectStore().getProject(media.projectId);
  if (!media || !project) throw new Error("The media job project is unavailable.");
  await executeMediaJob(project, media.ownerUserId, media.id);
  return { progress: { phase: "complete", completed: 1, total: 1, message: "Media generated" } };
});

registerBackgroundJobHandler("asset-optimization", async (job, context) => {
  const project = await getProjectStore().getProject(job.projectId);
  if (!project) throw new Error("The asset optimization project is unavailable.");
  return runAssetOptimizationJob(project, job.payload.optimizationId, context);
});
