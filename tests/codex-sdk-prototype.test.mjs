import assert from "node:assert/strict";
import { mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createWorkspace,
  readWorkspaceChanges,
  runCodexSdkPrototype
} from "../lib/codex-sdk-prototype.mjs";

const fixtureFiles = [
  { content: "<main>Original</main>\n", path: "tv.html" },
  { content: "# Fixture game\n", path: "instructions.md" }
];

test("Codex SDK prototype returns only validated changed game files", async (t) => {
  const root = await makeTestRoot(t);
  const events = [];

  const result = await runCodexSdkPrototype({
    codexFactory: () => fakeCodex(async (workingDirectory) => {
      await writeFile(path.join(workingDirectory, "game", "tv.html"), "<main>Updated</main>\n");
      await writeFile(path.join(workingDirectory, "notes.txt"), "Not persisted\n");
    }),
    files: fixtureFiles,
    message: "Update the TV.",
    onEvent(event) {
      events.push(event.type);
    },
    workspaceRoot: root
  });

  assert.deepEqual(result.changedFiles, [
    { content: "<main>Updated</main>\n", path: "tv.html" }
  ]);
  assert.equal(result.finalResponse, "Fixture complete.");
  assert.equal(result.threadId, "thread-fixture");
  assert.deepEqual(events, ["thread.started", "turn.started", "item.completed", "turn.completed"]);
  assert.deepEqual(await readdir(root), []);
});

test("concurrent fixture projects use isolated disposable workspaces", async (t) => {
  const root = await makeTestRoot(t);
  const seenWorkspaces = [];

  async function runFixture(label) {
    return runCodexSdkPrototype({
      codexFactory: () => fakeCodex(async (workingDirectory) => {
        seenWorkspaces.push(workingDirectory);
        const original = await readFile(path.join(workingDirectory, "game", "tv.html"), "utf8");
        assert.equal(original, `<main>${label}</main>\n`);
        await writeFile(
          path.join(workingDirectory, "game", "tv.html"),
          `<main>${label} updated</main>\n`
        );
      }),
      files: [{ content: `<main>${label}</main>\n`, path: "tv.html" }],
      message: `Update ${label}.`,
      workspaceRoot: root
    });
  }

  const [alpha, beta] = await Promise.all([runFixture("alpha"), runFixture("beta")]);

  assert.notEqual(seenWorkspaces[0], seenWorkspaces[1]);
  assert.equal(alpha.changedFiles[0].content, "<main>alpha updated</main>\n");
  assert.equal(beta.changedFiles[0].content, "<main>beta updated</main>\n");
  assert.deepEqual(await readdir(root), []);
});

test("workspace validation rejects deleted files", async (t) => {
  const root = await makeTestRoot(t);

  await assert.rejects(
    runCodexSdkPrototype({
      codexFactory: () => fakeCodex(async (workingDirectory) => {
        const { rm } = await import("node:fs/promises");
        await rm(path.join(workingDirectory, "game", "tv.html"));
      }),
      files: fixtureFiles,
      message: "Delete the TV.",
      workspaceRoot: root
    }),
    /deleted protected game files: tv\.html/
  );
  assert.deepEqual(await readdir(root), []);
});

test("workspace validation rejects symlinks in the game directory", async (t) => {
  const root = await makeTestRoot(t);
  const workspace = await createWorkspace(fixtureFiles, root);
  await mkdir(path.join(workspace.path, "outside"));
  await writeFile(path.join(workspace.path, "outside", "secret.md"), "secret");
  await symlink(
    path.join(workspace.path, "outside", "secret.md"),
    path.join(workspace.path, "game", "linked.md")
  );

  await assert.rejects(
    readWorkspaceChanges(workspace.path, fixtureFiles),
    /forbidden symlink/
  );
});

test("missing rollout resumes once with a fresh Codex thread", async (t) => {
  const root = await makeTestRoot(t);
  let staleRecoveries = 0;
  let freshStarts = 0;
  const codex = {
    resumeThread() {
      return {
        id: "stale-thread",
        async runStreamed() {
          async function* events() {
            yield {
              type: "turn.failed",
              error: { message: "thread/resume failed: no rollout found for thread id stale-thread" }
            };
          }
          return { events: events() };
        }
      };
    },
    startThread(options) {
      freshStarts += 1;
      return fakeThread(options.workingDirectory, async (workingDirectory) => {
        await writeFile(path.join(workingDirectory, "game", "tv.html"), "<main>Recovered</main>\n");
      });
    }
  };

  const result = await runCodexSdkPrototype({
    codexFactory: () => codex,
    files: fixtureFiles,
    message: "Recover.",
    onStaleThread() {
      staleRecoveries += 1;
    },
    threadId: "stale-thread",
    workspaceRoot: root
  });

  assert.equal(staleRecoveries, 1);
  assert.equal(freshStarts, 1);
  assert.equal(result.changedFiles[0].content, "<main>Recovered</main>\n");
});

test(
  "live Codex SDK smoke test edits only the fixture workspace",
  { skip: process.env.ATG_RUN_CODEX_SDK_LIVE !== "true", timeout: 180_000 },
  async (t) => {
    const root = await makeTestRoot(t);
    const result = await runCodexSdkPrototype({
      files: fixtureFiles,
      message: "Replace only game/instructions.md with exactly: # Live SDK validated\\n",
      workspaceRoot: root
    });

    assert.deepEqual(result.changedFiles, [
      { content: "# Live SDK validated\n", path: "instructions.md" }
    ]);
    assert.ok(result.threadId);
  }
);

function fakeCodex(editWorkspace) {
  return {
    resumeThread(_threadId, options) {
      return fakeThread(options.workingDirectory, editWorkspace);
    },
    startThread(options) {
      return fakeThread(options.workingDirectory, editWorkspace);
    }
  };
}

function fakeThread(workingDirectory, editWorkspace) {
  return {
    id: null,
    async runStreamed() {
      async function* events() {
        yield { thread_id: "thread-fixture", type: "thread.started" };
        yield { type: "turn.started" };
        await editWorkspace(workingDirectory);
        yield {
          item: { id: "message-1", text: "Fixture complete.", type: "agent_message" },
          type: "item.completed"
        };
        yield {
          type: "turn.completed",
          usage: {
            cached_input_tokens: 0,
            input_tokens: 10,
            output_tokens: 2,
            reasoning_output_tokens: 0
          }
        };
      }
      return { events: events() };
    }
  };
}

async function makeTestRoot(t) {
  const root = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(path.join(os.tmpdir(), "atg-codex-sdk-test-"))
  );
  t.after(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(root, { force: true, recursive: true });
  });
  return root;
}
