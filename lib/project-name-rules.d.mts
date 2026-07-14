export const PROJECT_NAME_MAX_LENGTH: 80;
export const PROJECT_VISIBILITIES: readonly ["private", "public"];

export type ProjectNameValidationResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

export type ProjectDetailsValidationResult =
  | { ok: true; name?: string; visibility?: "private" | "public" }
  | { ok: false; error: string };

export function validateProjectName(value: unknown): ProjectNameValidationResult;
export function validateProjectDetailsPatch(value: unknown): ProjectDetailsValidationResult;
