export class GameFileValidationError extends Error {
  status: number;
  constructor(message: string, status?: number);
}

export type GameTextFileRuleInput = {
  content?: unknown;
  path?: unknown;
};

export function isAllowedGameTextPath(filePath: string): boolean;
export function validateGameTextPath(filePath: unknown): string;
export function normalizeGameTextFiles(files: unknown): { content: string; path: string }[];
