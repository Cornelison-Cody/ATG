import { claimBackgroundJob, completeBackgroundJob, failBackgroundJob, getBackgroundJob, heartbeatBackgroundJob, listRunnableBackgroundJobs } from "./background-job-store.mjs";

const owner = `${process.env.HOSTNAME || "local"}:${process.pid}`;
const handlers = new Map();

export function registerBackgroundJobHandler(kind, handler) { handlers.set(kind, handler); }

/** Runs queued/expired work locally and is also the Container Apps Job entry point. */
export async function dispatchBackgroundJobs({ once = false } = {}) {
  do {
    const jobs = await listRunnableBackgroundJobs();
    for (const queued of jobs) await runBackgroundJob(queued.id);
    if (once || jobs.length === 0) return;
  } while (true);
}

export async function runBackgroundJob(id) {
  const job = await claimBackgroundJob(id, owner);
  if (!job) return null;
  const handler = handlers.get(job.kind);
  if (!handler) return failBackgroundJob(id, owner, new Error(`No worker is registered for ${job.kind}.`));
  const pulse = setInterval(() => void heartbeatBackgroundJob(id, owner), 30_000);
  try {
    const latest = await getBackgroundJob(id);
    if (latest?.cancellationRequested) return completeBackgroundJob(id, owner, { cancelled: true });
    const outcome = await handler(job, {
      isCancellationRequested: async () => Boolean((await getBackgroundJob(id))?.cancellationRequested),
      progress: (progress) => heartbeatBackgroundJob(id, owner, progress)
    });
    return completeBackgroundJob(id, owner, outcome);
  } catch (error) {
    return failBackgroundJob(id, owner, error);
  } finally { clearInterval(pulse); }
}

if (process.argv[1]?.endsWith("background-worker.mjs")) {
  await import("./background-worker-handlers.mjs");
  await dispatchBackgroundJobs({ once: process.env.ATG_BACKGROUND_WORKER_ONCE === "true" });
}
