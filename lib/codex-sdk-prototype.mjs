import { Codex } from "@openai/codex-sdk";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isAllowedGameTextPath, normalizeGameTextFiles } from "./game-file-rules.mjs";

const WORKSPACE_INSTRUCTIONS = `# ATG game workspace

Only edit files under \`game/\`. Do not create or modify files outside that directory.
The editable game files are HTML, CSS, JavaScript, JSON, Markdown, and SVG assets.
Do not delete game files. Do not create symlinks.
`;

export async function runCodexSdkPrototype({
  apiKey,
  codexFactory,
  files,
  message,
  model,
  onEvent = () => undefined,
  signal,
  threadId,
  workspaceRoot
}) {
  const initialFiles = normalizeGameTextFiles(files);
  const workspace = await createWorkspace(initialFiles, workspaceRoot);

  try {
    const codexOptions = apiKey ? { apiKey } : undefined;
    const codex = codexFactory ? codexFactory(codexOptions) : new Codex(codexOptions);
    const threadOptions = {
      approvalPolicy: "never",
      ...(model ? { model } : {}),
      networkAccessEnabled: false,
      sandboxMode: "workspace-write",
      skipGitRepoCheck: true,
      workingDirectory: workspace.path
    };
    const thread = threadId
      ? codex.resumeThread(threadId, threadOptions)
      : codex.startThread(threadOptions);
    const { events } = await thread.runStreamed(message, { signal });
    let finalResponse = "";
    let nextThreadId = threadId || "";
    let usage = null;

    for await (const event of events) {
      if (event.type === "thread.started") {
        nextThreadId = event.thread_id;
      } else if (event.type === "item.completed" && event.item.type === "agent_message") {
        finalResponse = event.item.text;
      } else if (event.type === "turn.completed") {
        usage = event.usage;
      } else if (event.type === "turn.failed") {
        throw new Error(event.error.message);
      } else if (event.type === "error") {
        throw new Error(event.message);
      }

      await onEvent(event);
    }

    const workspaceResult = await readWorkspaceChanges(workspace.path, initialFiles);
    return {
      changedFiles: workspaceResult.changedFiles,
      finalResponse: finalResponse || "Codex finished without a final text response.",
      threadId: nextThreadId || thread.id || "",
      usage,
      workspaceId: workspace.id
    };
  } finally {
    await rm(workspace.path, { force: true, recursive: true });
  }
}

export async function createWorkspace(files, workspaceRoot) {
  const base = path.resolve(workspaceRoot || path.join(os.tmpdir(), "atg-codex-sdk"));
  await mkdir(base, { recursive: true, mode: 0o700 });
  const workspacePath = await mkdtemp(path.join(base, "run-"));
  const gamePath = path.join(workspacePath, "game");
  await mkdir(gamePath, { recursive: true, mode: 0o700 });

  for (const file of normalizeGameTextFiles(files)) {
    const target = resolveInside(gamePath, file.path);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, file.content, { encoding: "utf8", mode: 0o600 });
  }

  await writeFile(path.join(workspacePath, "AGENTS.md"), WORKSPACE_INSTRUCTIONS, {
    encoding: "utf8",
    mode: 0o600
  });

  return { id: randomUUID(), path: workspacePath };
}

export async function readWorkspaceChanges(workspacePath, initialFiles) {
  const gamePath = path.join(path.resolve(workspacePath), "game");
  const currentFiles = [];
  await collectGameFiles(gamePath, gamePath, currentFiles);
  const normalizedCurrent = normalizeGameTextFiles(currentFiles);
  const initial = new Map(normalizeGameTextFiles(initialFiles).map((file) => [file.path, file.content]));
  const current = new Map(normalizedCurrent.map((file) => [file.path, file.content]));
  const deletedPaths = [...initial.keys()].filter((filePath) => !current.has(filePath));

  if (deletedPaths.length > 0) {
    throw new Error(`Codex deleted protected game files: ${deletedPaths.join(", ")}.`);
  }

  return {
    changedFiles: normalizedCurrent.filter((file) => initial.get(file.path) !== file.content)
  };
}

async function collectGameFiles(root, directory, files) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
    const metadata = await lstat(absolutePath);

    if (metadata.isSymbolicLink()) {
      throw new Error(`Codex created a forbidden symlink: game/${relativePath}.`);
    }

    if (metadata.isDirectory()) {
      await collectGameFiles(root, absolutePath, files);
      continue;
    }

    if (metadata.isFile() && isAllowedGameTextPath(relativePath)) {
      files.push({
        content: await readFile(absolutePath, "utf8"),
        path: relativePath
      });
    }
  }
}

function resolveInside(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Game file path escaped the Codex workspace.");
  }
  return resolved;
}
