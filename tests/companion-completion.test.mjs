import assert from "node:assert/strict";
import test from "node:test";
import { applyCompanionCompletion, CompanionCompletionError } from "../lib/companion-completion.mjs";

const job = {
  id: "job-1",
  project: { id: "project-1", name: "Trivia", slug: "trivia" }
};

test("companion completion persists deployed files before publishing final", async () => {
  const events = [];
  const storedFiles = new Map();
  const files = [{ content: "<main>Updated</main>", path: "tv.html" }];
  const project = { id: "project-1", status: "active" };

  const result = await applyCompanionCompletion({
    completeJob(jobId, event) {
      events.push({ event, jobId, stored: storedFiles.get("tv.html") });
      return true;
    },
    files,
    finalMessage: "Updated the TV.",
    job,
    loadProject: async () => project,
    saveFiles: async (_project, nextFiles) => {
      for (const file of nextFiles) {
        storedFiles.set(file.path, file.content);
      }
      return nextFiles;
    }
  });

  assert.equal(storedFiles.get("tv.html"), "<main>Updated</main>");
  assert.deepEqual(events, [
    {
      event: { message: "Updated the TV.", type: "final" },
      jobId: "job-1",
      stored: "<main>Updated</main>"
    }
  ]);
  assert.equal(result.message, "Updated the TV.");
});

test("companion completion publishes persistence failures as errors", async () => {
  const events = [];

  await assert.rejects(
    applyCompanionCompletion({
      completeJob(_jobId, event) {
        events.push(event);
        return true;
      },
      files: [{ content: "broken", path: "game.js" }],
      finalMessage: "Done",
      job,
      loadProject: async () => ({ id: "project-1", status: "active" }),
      saveFiles: async () => {
        throw new Error("Blob upload failed.");
      }
    }),
    /Blob upload failed/
  );

  assert.deepEqual(events, [{ message: "Blob upload failed.", type: "error" }]);
});

test("companion completion reports a missing project", async () => {
  const events = [];

  await assert.rejects(
    applyCompanionCompletion({
      completeJob(_jobId, event) {
        events.push(event);
        return true;
      },
      files: [],
      finalMessage: "Done",
      job,
      loadProject: async () => null,
      saveFiles: async () => []
    }),
    (error) => error instanceof CompanionCompletionError && error.status === 404
  );

  assert.deepEqual(events, [{ message: "Project was not found.", type: "error" }]);
});
