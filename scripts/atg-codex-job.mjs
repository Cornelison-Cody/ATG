#!/usr/bin/env node
import { runCodexSdkPrototype } from "../lib/codex-sdk-prototype.mjs";

const baseUrl = required("ATG_BASE_URL").replace(/\/+$/, "");
const jobId = required("ATG_CODEX_JOB_ID");
const token = required("ATG_CODEX_JOB_TOKEN");
const headers = { Authorization: `Bearer ${token}` };

try {
  const response = await fetch(`${baseUrl}/api/codex-jobs/${jobId}/bundle`, { headers });
  if (!response.ok) throw new Error(`Bundle request failed (${response.status}): ${await response.text()}`);
  const bundle = await response.json();
  const result = await runCodexSdkPrototype({
    apiKey: bundle.apiKey,
    files: bundle.files,
    message: bundle.prompt,
    sandboxMode: "danger-full-access",
    onEvent: async (event) => {
      const message = status(event);
      if (message) await post("events", { type: "status", message });
    }
  });
  await post("complete", {
    ok: true,
    files: result.changedFiles,
    finalMessage: result.finalResponse,
    usage: result.usage
  });
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : "Codex job failed.";
  await post("complete", { ok: false, errorMessage }).catch(() => undefined);
  console.error(errorMessage);
  process.exitCode = 1;
}

async function post(action, body) {
  const response = await fetch(`${baseUrl}/api/codex-jobs/${jobId}/${action}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${action} failed (${response.status}): ${await response.text()}`);
}
function status(event) {
  if (event.type === "turn.started") return "Codex is editing in an isolated Azure job...";
  if (event.type === "item.completed" && event.item.type === "file_change") return "Codex updated game files.";
  if (event.type === "turn.completed") return "Codex completed the isolated turn.";
  return "";
}
function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
