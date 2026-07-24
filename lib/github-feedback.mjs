const MAX_TITLE_LENGTH = 140;
const MAX_BODY_LENGTH = 12000;
const MAX_CONTEXT_LENGTH = 4000;
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

const recentSubmissions = new Map();

export {
  MAX_BODY_LENGTH,
  MAX_CONTEXT_LENGTH,
  MAX_TITLE_LENGTH
};

export function getGitHubFeedbackConfig(env = process.env) {
  const config = {
    apiUrl: normalizeApiUrl(env.ATG_GITHUB_API_URL) || "https://api.github.com",
    labels: parseCsv(env.ATG_GITHUB_FEEDBACK_LABELS || "atg-feedback"),
    repository: normalizeRepository(env.ATG_GITHUB_FEEDBACK_REPOSITORY || env.GITHUB_REPOSITORY),
    token: stringValue(env.ATG_GITHUB_FEEDBACK_TOKEN)
  };

  const missing = [];
  if (!config.repository) missing.push("ATG_GITHUB_FEEDBACK_REPOSITORY");
  if (!config.token) missing.push("ATG_GITHUB_FEEDBACK_TOKEN");

  if (missing.length > 0) {
    throw new GitHubFeedbackError(`GitHub feedback is not configured: ${missing.join(", ")}.`, 503);
  }

  return config;
}

export async function submitGitHubFeedback(input, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const config = options.config || getGitHubFeedbackConfig(options.env);
  const submission = validateFeedbackSubmission(input);
  const dedupeKey = `${submission.userId}:${submission.idempotencyKey}`;
  const existing = recentSubmissions.get(dedupeKey);

  if (existing && existing.expiresAt > Date.now()) {
    return existing.promise;
  }

  const promise = createGitHubFeedbackIssue({ config, fetchImpl, submission });
  recentSubmissions.set(dedupeKey, { expiresAt: Date.now() + IDEMPOTENCY_TTL_MS, promise });
  cleanupRecentSubmissions();

  try {
    const result = await promise;
    recentSubmissions.set(dedupeKey, {
      expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
      promise: Promise.resolve(result)
    });
    return result;
  } catch (error) {
    recentSubmissions.delete(dedupeKey);
    throw error;
  }
}

async function createGitHubFeedbackIssue({ config, fetchImpl, submission }) {
  const issuePayload = buildGitHubIssuePayload({ config, submission });
  const issueResponse = await fetchImpl(
    `${config.apiUrl}/repos/${encodeURIComponent(config.repository.owner)}/${encodeURIComponent(config.repository.name)}/issues`,
    {
      body: JSON.stringify(issuePayload),
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        "User-Agent": "azure-tides-gaming-feedback",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      method: "POST"
    }
  );

  if (!issueResponse.ok) {
    throw new GitHubFeedbackError(gitHubErrorMessage("Unable to create the GitHub issue", issueResponse.status), 502);
  }

  const createdIssue = await issueResponse.json();
  const issueNumber = numberValue(createdIssue.number);
  const issueId = numberValue(createdIssue.id);
  const issueUrl = stringValue(createdIssue.html_url);
  if (!issueNumber || !issueUrl) {
    throw new GitHubFeedbackError("GitHub created an issue but did not return an issue URL.", 502);
  }

  return {
    issueId: issueId ? String(issueId) : "",
    issueNumber,
    issueUrl
  };
}

export function validateFeedbackSubmission(input) {
  const title = stringValue(input?.title).replace(/\s+/g, " ").trim();
  const body = sanitizeMarkdown(input?.body);
  const context = normalizeContext(input?.context);
  const issueType = normalizeIssueType(input?.issueType);
  const submitterEmail = limitContextValue(input?.submitterEmail);
  const userId = stringValue(input?.userId);
  const idempotencyKey = stringValue(input?.idempotencyKey);

  if (!userId) {
    throw new GitHubFeedbackError("A user identity is required.", 401);
  }
  if (!idempotencyKey || idempotencyKey.length > 120) {
    throw new GitHubFeedbackError("Feedback submission token is invalid.", 400);
  }
  if (!title) {
    throw new GitHubFeedbackError("Feedback title is required.", 400);
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new GitHubFeedbackError(`Feedback title must be ${MAX_TITLE_LENGTH} characters or fewer.`, 400);
  }
  if (!body) {
    throw new GitHubFeedbackError("Feedback details are required.", 400);
  }
  if (body.length > MAX_BODY_LENGTH) {
    throw new GitHubFeedbackError(`Feedback details must be ${MAX_BODY_LENGTH} characters or fewer.`, 400);
  }

  return { body, context: { ...context, submitterEmail }, idempotencyKey, issueType, title, userId };
}

export function buildGitHubIssuePayload({ config, submission }) {
  return {
    body: buildGitHubIssueBody(submission),
    labels: uniqueLabels([...config.labels, issueTypeLabel(submission.issueType)]),
    title: submission.title
  };
}

export function buildGitHubIssueBody(submission) {
  const lines = [
    submission.body,
    "",
    "---",
    "",
    "### ATG context",
    ...contextLines(submission.context),
    "",
    "<!--",
    `atg-feedback-idempotency-key: ${submission.idempotencyKey}`,
    `atg-feedback-user-hash: ${hashHint(submission.userId)}`,
    "-->"
  ];
  return lines.join("\n").trim();
}

export class GitHubFeedbackError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function contextLines(context) {
  return [
    ["Submitter", context.submitterEmail],
    ["URL", context.url],
    ["Project", context.projectId],
    ["View", context.view],
    ["App version", context.appVersion],
    ["Browser", context.userAgent],
    ["Submitted", context.submittedAt]
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `- **${label}:** ${value}`);
}

function normalizeIssueType(value) {
  const candidate = stringValue(value).trim().toLowerCase();
  if (!candidate || candidate === "bug") {
    return "Bug";
  }
  if (candidate === "task") {
    return "Task";
  }
  throw new GitHubFeedbackError("Feedback type must be Bug or Task.", 400);
}

function issueTypeLabel(issueType) {
  return issueType === "Task" ? "task" : "bug";
}

function normalizeContext(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    appVersion: limitContextValue(source.appVersion),
    projectId: limitContextValue(source.projectId),
    submittedAt: limitContextValue(source.submittedAt) || new Date().toISOString(),
    url: sanitizeUrl(source.url),
    userAgent: limitContextValue(source.userAgent),
    view: limitContextValue(source.view)
  };
}

function sanitizeMarkdown(value) {
  return stringValue(value)
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

function sanitizeUrl(value) {
  const candidate = limitContextValue(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/token|key|secret|code|session|auth/i.test(key)) {
        url.searchParams.set(key, "[redacted]");
      }
    }
    return url.toString();
  } catch {
    return candidate.slice(0, 500);
  }
}

function limitContextValue(value) {
  return stringValue(value).slice(0, MAX_CONTEXT_LENGTH).trim();
}

function normalizeApiUrl(value) {
  const url = stringValue(value).trim().replace(/\/+$/, "");
  if (!url) return "";
  return /^https:\/\/[a-z0-9.-]+(?:\/api\/v3)?$/i.test(url) ? url : "";
}

function normalizeRepository(value) {
  const repository = stringValue(value).trim();
  const match = repository.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) {
    return null;
  }
  return { owner: match[1], name: match[2] };
}

function parseCsv(value) {
  return stringValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 10);
}

function uniqueLabels(labels) {
  const seen = new Set();
  return labels.filter((label) => {
    const key = label.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function numberValue(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function gitHubErrorMessage(prefix, status) {
  if (status === 401 || status === 403) {
    return `${prefix}. GitHub rejected the configured token or permissions.`;
  }
  if (status === 404 || status === 410) {
    return `${prefix}. GitHub could not access the configured repository or issues are disabled.`;
  }
  if (status === 422) {
    return `${prefix}. GitHub rejected the issue fields or labels.`;
  }
  return `${prefix}. GitHub returned ${status}.`;
}

function hashHint(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0").slice(0, 8);
}

function cleanupRecentSubmissions() {
  const now = Date.now();
  for (const [key, value] of recentSubmissions.entries()) {
    if (value.expiresAt <= now) {
      recentSubmissions.delete(key);
    }
  }
}
