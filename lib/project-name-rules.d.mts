export const PROJECT_NAME_MAX_LENGTH: 80;

export type ProjectNameValidationResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

export function validateProjectName(value: unknown): ProjectNameValidationResult;
export function validateProjectDetailsPatch(value: unknown): ProjectNameValidationResult;
