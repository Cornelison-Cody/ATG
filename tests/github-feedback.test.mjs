import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGitHubIssueBody,
  buildGitHubIssuePayload,
  GitHubFeedbackError,
  submitGitHubFeedback,
  validateFeedbackSubmission
} from "../lib/github-feedback.mjs";

const config = {
  apiUrl: "https://api.github.com",
  labels: ["atg-feedback"],
  repository: { owner: "Cornelison-Cody", name: "ATG" },
  token: "github-token"
};

test("feedback validation trims content and sanitizes context", () => {
  const valid = validateFeedbackSubmission({
    body: "  ## Broken flow\n<script>alert(1)</script>\nDetails  ",
    context: {
      projectId: "project-a",
      url: "https://atg.example.com/dashboard?token=secret&project=project-a#access-token",
      userAgent: "Test Browser"
    },
    idempotencyKey: "submission-a",
    issueType: "Task",
    submitterEmail: "person@example.com",
    title: "  Feedback title  ",
    userId: "user-a"
  });

  assert.equal(valid.title, "Feedback title");
  assert.match(valid.body, /Broken flow/);
  assert.doesNotMatch(valid.body, /script/);
  assert.equal(valid.context.url, "https://atg.example.com/dashboard?token=%5Bredacted%5D&project=project-a");
  assert.equal(valid.context.submitterEmail, "person@example.com");
  assert.equal(valid.issueType, "Task");
});

test("feedback validation defaults to Bug and rejects unsupported issue types", () => {
  const valid = validateFeedbackSubmission({
    body: "Details",
    idempotencyKey: "submission-default-type",
    title: "Title",
    userId: "user-a"
  });

  assert.equal(valid.issueType, "Bug");

  assert.throws(
    () => validateFeedbackSubmission({
      body: "Details",
      idempotencyKey: "submission-invalid-type",
      issueType: "Story",
      title: "Title",
      userId: "user-a"
    }),
    (error) => error instanceof GitHubFeedbackError && error.status === 400 && /Bug or Task/.test(error.message)
  );
});

test("GitHub issue payload uses Markdown body, context, and type labels", () => {
  const submission = validateFeedbackSubmission({
    body: "## Heading\n\n- First\n- **Second**\n\nUse `code` and [ATG](https://atg.example.com).",
    context: {
      appVersion: "0.1.0",
      projectId: "project-a",
      submittedAt: "2026-07-18T00:00:00.000Z",
      url: "https://atg.example.com/dashboard",
      userAgent: "Test Browser",
      view: "project-editor"
    },
    idempotencyKey: "submission-c",
    issueType: "Task",
    submitterEmail: "person@example.com",
    title: "Preview feedback",
    userId: "user-a"
  });
  const payload = buildGitHubIssuePayload({ config, submission });

  assert.equal(payload.title, "Preview feedback");
  assert.deepEqual(payload.labels, ["atg-feedback", "task"]);
  assert.match(payload.body, /## Heading/);
  assert.match(payload.body, /### ATG context/);
  assert.match(payload.body, /\*\*Submitter:\*\* person@example.com/);
  assert.match(payload.body, /atg-feedback-idempotency-key: submission-c/);
});

test("GitHub issue body includes context without requiring optional fields", () => {
  const body = buildGitHubIssueBody({
    body: "Details",
    context: { submittedAt: "2026-07-18T00:00:00.000Z" },
    idempotencyKey: "submission-body",
    userId: "user-a"
  });

  assert.match(body, /Details/);
  assert.match(body, /\*\*Submitted:\*\* 2026-07-18T00:00:00.000Z/);
  assert.doesNotMatch(body, /Submitter/);
});

test("feedback submission creates a GitHub issue", async () => {
  const calls = [];
  const result = await submitGitHubFeedback({
    body: "Details",
    context: { submittedAt: "2026-07-18T00:00:00.000Z", url: "https://atg.example.com/dashboard" },
    idempotencyKey: "submission-success",
    issueType: "Bug",
    title: "Submit feedback",
    userId: "user-a"
  }, {
    config,
    fetchImpl: async (url, options) => {
      calls.push({ options, url });
      assert.equal(url, "https://api.github.com/repos/Cornelison-Cody/ATG/issues");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Authorization, "Bearer github-token");
      const payload = JSON.parse(options.body);
      assert.deepEqual(payload.labels, ["atg-feedback", "bug"]);
      return Response.json({
        html_url: "https://github.com/Cornelison-Cody/ATG/issues/123",
        id: 10001,
        number: 123
      }, { status: 201 });
    }
  });

  assert.deepEqual(result, {
    issueId: "10001",
    issueNumber: 123,
    issueUrl: "https://github.com/Cornelison-Cody/ATG/issues/123"
  });
  assert.equal(calls.length, 1);
});

test("feedback submission reports GitHub create failures", async () => {
  await assert.rejects(
    () => submitGitHubFeedback({
      body: "Details",
      idempotencyKey: "submission-create-failure",
      title: "Submit feedback",
      userId: "user-a"
    }, {
      config,
      fetchImpl: async () => Response.json({ message: "No" }, { status: 403 })
    }),
    (error) => error instanceof GitHubFeedbackError && error.status === 502 && /token or permissions/.test(error.message)
  );
});

test("feedback submission deduplicates retried submissions in process", async () => {
  let createCount = 0;
  const first = await submitGitHubFeedback({
    body: "Details",
    idempotencyKey: "submission-dedupe",
    title: "Submit feedback",
    userId: "user-a"
  }, {
    config,
    fetchImpl: async () => {
      createCount += 1;
      return Response.json({
        html_url: "https://github.com/Cornelison-Cody/ATG/issues/125",
        id: 10001,
        number: 125
      }, { status: 201 });
    }
  });
  const second = await submitGitHubFeedback({
    body: "Details",
    idempotencyKey: "submission-dedupe",
    title: "Submit feedback",
    userId: "user-a"
  }, {
    config,
    fetchImpl: async () => {
      createCount += 1;
      return Response.json({
        html_url: "https://github.com/Cornelison-Cody/ATG/issues/126",
        id: 10002,
        number: 126
      }, { status: 201 });
    }
  });

  assert.deepEqual(second, first);
  assert.equal(createCount, 1);
});
