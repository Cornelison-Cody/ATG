#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isAllowedGameTextPath, validateGameTextPath } from "../lib/game-file-rules.mjs";

const baseUrl = trimTrailingSlash(requiredEnv("ATG_BASE_URL"));
const token = requiredEnv("ATG_COMPANION_TOKEN");
const workspaceRoot = process.env.ATG_COMPANION_WORKSPACE_ROOT || path.join(os.tmpdir(), "atg-companion");
const pollDelayMs = Number(process.env.ATG_COMPANION_POLL_DELAY_MS || 1500);

const codexExecAdapter = {
  async run({ cwd, job, onEvent }) {
    return runCodexExec({ cwd, job, onEvent });
  }
};

let isStopping = false;
process.on("SIGINT", () => {
  isStopping = true;
});
process.on("SIGTERM", () => {
  isStopping = true;
});

await mkdir(workspaceRoot, { recursive: true });
console.log(`ATG companion polling ${baseUrl}`);
console.log(`Workspace root: ${workspaceRoot}`);

while (!isStopping) {
  try {
    const job = await pollNextJob();
    if (!job) {
      await delay(pollDelayMs);
      continue;
    }

    await runJob(job);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await delay(pollDelayMs);
  }
}

async function pollNextJob() {
  const response = await fetch(`${baseUrl}/api/companion/jobs/next`, {
    headers: authHeaders()
  });

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Job poll failed (${response.status}): ${await response.text()}`);
  }

  const body = await response.json();
  return body.job;
}

async function runJob(job) {
  const workspace = path.join(workspaceRoot, job.id);
  await rm(workspace, { force: true, recursive: true });
  await mkdir(path.join(workspace, "game"), { recursive: true });
  await writeFile(path.join(workspace, "README.md"), renderReadme(job), "utf8");

  for (const file of job.files) {
    const filePath = validateGameTextPath(file.path);
    const targetPath = path.join(workspace, "game", filePath);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, String(file.content ?? ""), "utf8");
  }

  console.log(`Running job ${job.id} for ${job.project.name} (${job.editingTarget})`);
  console.log(`Workspace: ${workspace}`);

  const result = await codexExecAdapter.run({
    cwd: workspace,
    job,
    onEvent: (event) => postJobEvent(job.id, event)
  });

  if (!result.ok) {
    await completeJob(job.id, {
      errorMessage: result.errorMessage,
      ok: false
    });
    return;
  }

  const files = await readWorkspaceGameFiles(path.join(workspace, "game"));
  await completeJob(job.id, {
    files,
    finalMessage: result.finalMessage,
    ok: true
  });
}

async function runCodexExec({ cwd, job, onEvent }) {
  const args = job.threadId
    ? ["exec", "resume", "--json", "--skip-git-repo-check", job.threadId, job.prompt]
    : ["exec", "--json", "-C", ".", "--sandbox", "workspace-write", "--skip-git-repo-check", job.prompt];

  const child = spawn("codex", args, {
    cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdoutBuffer = "";
  let stderr = "";
  let finalMessage = "";

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";

    for (const line of lines) {
      handleCodexLine(line);
    }
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  if (stdoutBuffer.trim()) {
    handleCodexLine(stdoutBuffer);
  }

  if (exitCode !== 0) {
    return {
      errorMessage: stderr.trim() || `Codex exited with code ${exitCode}.`,
      ok: false
    };
  }

  return {
    finalMessage: finalMessage || "Codex finished without a final text response.",
    ok: true
  };

  function handleCodexLine(line) {
    if (!line.trim()) {
      return;
    }

    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }

    const sessionId = event.thread_id || event.session_id || event.sessionId;
    if (typeof sessionId === "string" && sessionId) {
      void onEvent({ type: "session", sessionId });
    }

    const status = statusFromCodexEvent(event);
    if (status) {
      void onEvent({ type: "status", message: status });
    }

    const final = finalMessageFromCodexEvent(event);
    if (final) {
      finalMessage = final;
    }
  }
}

async function postJobEvent(jobId, event) {
  const response = await fetch(`${baseUrl}/api/companion/jobs/${jobId}/events`, {
    body: JSON.stringify(event),
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    console.error(`Unable to post ${event.type} event (${response.status}): ${await response.text()}`);
  }
}

async function completeJob(jobId, body) {
  const response = await fetch(`${baseUrl}/api/companion/jobs/${jobId}/complete`, {
    body: JSON.stringify(body),
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Unable to complete job ${jobId} (${response.status}): ${await response.text()}`);
  }
}

async function readWorkspaceGameFiles(rootPath, relativePath = "") {
  const entries = await readdir(path.join(rootPath, relativePath), { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const nextPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await readWorkspaceGameFiles(rootPath, nextPath));
    } else if (entry.isFile() && isAllowedGameTextPath(nextPath)) {
      files.push({
        content: await readFile(path.join(rootPath, nextPath), "utf8"),
        path: nextPath
      });
    }
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function statusFromCodexEvent(event) {
  if (event.type === "thread.started" || event.type === "session.created") {
    return "Codex session ready.";
  }
  if (event.type === "turn.started") {
    return "Codex is working in the local companion workspace...";
  }
  if (event.type === "turn.completed") {
    return "Codex completed the turn.";
  }
  return "";
}

function finalMessageFromCodexEvent(event) {
  if (event.type === "agent_message" && typeof event.message === "string") {
    return event.message;
  }
  if (event.message && typeof event.message === "object" && typeof event.message.text === "string") {
    return event.message.text;
  }
  if (event.type === "item.completed" && event.item?.type === "agent_message" && typeof event.item.text === "string") {
    return event.item.text;
  }
  return "";
}

function renderReadme(job) {
  return `# ${job.project.name}

A sandboxed Azure Tides Gaming game workspace synced from ${baseUrl}.
Customize gameplay by editing files under \`game/\`.
`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`
  };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function trimTrailingSlash(value) {
  return value.trim().replace(/\/+$/, "");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
