import { randomUUID } from "crypto";
import type { ProjectRecord } from "./project-types";
import type { GameTextFile } from "./project-store";

export type CompanionEvent =
  | { type: "status"; message: string }
  | { type: "session"; sessionId: string }
  | { type: "final"; message: string }
  | { type: "error"; message: string };

export type CompanionJobSnapshot = {
  editingTarget: "tv" | "phone";
  files: GameTextFile[];
  id: string;
  message: string;
  project: {
    id: string;
    name: string;
    slug: string;
  };
  prompt: string;
  threadId: string | null;
};

type CompanionJob = CompanionJobSnapshot & {
  claimedAt: string | null;
  createdAt: string;
  listeners: Set<(event: CompanionEvent) => void>;
  status: "queued" | "claimed" | "done" | "error";
};

type CompanionState = {
  jobs: Map<string, CompanionJob>;
  waiters: Set<() => void>;
};

type GlobalState = typeof globalThis & {
  atgCompanionState?: CompanionState;
};

export function enqueueCompanionJob({
  editingTarget,
  files,
  message,
  project,
  prompt
}: {
  editingTarget: "tv" | "phone";
  files: GameTextFile[];
  message: string;
  project: ProjectRecord;
  prompt: string;
}) {
  const job: CompanionJob = {
    claimedAt: null,
    createdAt: new Date().toISOString(),
    editingTarget,
    files,
    id: randomUUID(),
    listeners: new Set(),
    message,
    project: {
      id: project.id,
      name: project.name,
      slug: project.slug
    },
    prompt,
    status: "queued",
    threadId: project.codexThreadId
  };

  const state = getState();
  state.jobs.set(job.id, job);
  notifyWaiters(state);
  return publicJob(job);
}

export function subscribeToCompanionJob(jobId: string, listener: (event: CompanionEvent) => void) {
  const job = getState().jobs.get(jobId);
  if (!job) {
    return () => undefined;
  }

  job.listeners.add(listener);
  return () => {
    job.listeners.delete(listener);
  };
}

export function emitCompanionJobEvent(jobId: string, event: CompanionEvent) {
  const job = getState().jobs.get(jobId);
  if (!job || job.status === "done" || job.status === "error") {
    return false;
  }

  for (const listener of [...job.listeners]) {
    listener(event);
  }
  return true;
}

export async function waitForNextCompanionJob(timeoutMs: number) {
  const existing = claimNextJob();
  if (existing) {
    return existing;
  }

  await new Promise<void>((resolve) => {
    const state = getState();
    const timer = setTimeout(() => {
      state.waiters.delete(waiter);
      resolve();
    }, timeoutMs);
    const waiter = () => {
      clearTimeout(timer);
      state.waiters.delete(waiter);
      resolve();
    };

    state.waiters.add(waiter);
  });

  return claimNextJob();
}

export function getCompanionJob(jobId: string) {
  const job = getState().jobs.get(jobId);
  return job ? publicJob(job) : null;
}

export function completeCompanionJob(jobId: string, event: CompanionEvent) {
  const job = getState().jobs.get(jobId);
  if (!job) {
    return false;
  }

  if (event.type === "final") {
    job.status = "done";
  } else if (event.type === "error") {
    job.status = "error";
  }

  for (const listener of [...job.listeners]) {
    listener(event);
  }

  setTimeout(() => getState().jobs.delete(jobId), 60_000);
  return true;
}

function claimNextJob() {
  for (const job of getState().jobs.values()) {
    if (job.status === "queued") {
      job.status = "claimed";
      job.claimedAt = new Date().toISOString();
      return publicJob(job);
    }
  }

  return null;
}

function publicJob(job: CompanionJob): CompanionJobSnapshot {
  return {
    editingTarget: job.editingTarget,
    files: job.files,
    id: job.id,
    message: job.message,
    project: job.project,
    prompt: job.prompt,
    threadId: job.threadId
  };
}

function notifyWaiters(state: CompanionState) {
  for (const waiter of [...state.waiters]) {
    waiter();
  }
}

function getState() {
  const globalState = globalThis as GlobalState;
  if (!globalState.atgCompanionState) {
    globalState.atgCompanionState = {
      jobs: new Map(),
      waiters: new Set()
    };
  }

  return globalState.atgCompanionState;
}
