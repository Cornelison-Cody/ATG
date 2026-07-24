export const MAX_TITLE_LENGTH: number;
export const MAX_BODY_LENGTH: number;
export const MAX_CONTEXT_LENGTH: number;

export function getGitHubFeedbackConfig(env?: Record<string, string | undefined>): {
  apiUrl: string;
  labels: string[];
  repository: {
    owner: string;
    name: string;
  };
  token: string;
};
export function submitGitHubFeedback(input: Record<string, unknown>, options?: Record<string, unknown>): Promise<{
  issueId: string;
  issueNumber: number;
  issueUrl: string;
}>;
export function validateFeedbackSubmission(input: Record<string, unknown>): Record<string, unknown>;
export function buildGitHubIssuePayload(input: Record<string, unknown>): Record<string, unknown>;
export function buildGitHubIssueBody(input: Record<string, unknown>): string;

export class GitHubFeedbackError extends Error {
  status: number;
  constructor(message: string, status?: number);
}
