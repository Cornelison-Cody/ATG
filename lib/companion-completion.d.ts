import type { ProjectRecord } from "./project-types";
import type { CompanionEvent, CompanionJobSnapshot } from "./companion-jobs";
import type { GameTextFile } from "./project-store";

export class CompanionCompletionError extends Error {
  status: number;
  constructor(message: string, status: number);
}

export function applyCompanionCompletion(options: {
  completeJob: (jobId: string, event: CompanionEvent) => boolean;
  files: GameTextFile[];
  finalMessage: unknown;
  job: CompanionJobSnapshot;
  loadProject: (projectId: string) => Promise<ProjectRecord | null>;
  saveFiles: (project: ProjectRecord, files: GameTextFile[]) => Promise<GameTextFile[]>;
}): Promise<{ message: string; project: ProjectRecord }>;
