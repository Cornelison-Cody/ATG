import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { chromium } from "@playwright/test";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const stateRoot = await mkdtemp(path.join(os.tmpdir(), "atg-conversion-browser-"));
const port = 39000 + Math.floor(Math.random() * 1000);
const nextDistDir = `.next-browser-${port}`;
const baseUrl = `http://127.0.0.1:${port}`;
const headers = { "x-ms-client-principal-id": "browser-test-user", "x-ms-client-principal-name": "Browser Test User" };
const generatedProjectFiles = ["next-env.d.ts", "tsconfig.json"];
const originalGeneratedProjectFiles = await Promise.all(generatedProjectFiles.map(async (file) => [file, await readFile(path.join(repoRoot, file), "utf8")]));
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ATG_DATA_ROOT: stateRoot,
    ATG_NEXT_DIST_DIR: nextDistDir,
    ATG_PROJECTS_ROOT: path.join(stateRoot, "projects"),
    ATG_STATE_ROOT: path.join(stateRoot, ".atg"),
    NODE_ENV: "development",
    PORT: String(port)
  },
  stdio: ["ignore", "pipe", "pipe"]
});

await waitForServer(server);
test.after(async () => {
  server.kill("SIGTERM");
  await rm(path.join(repoRoot, nextDistDir), { recursive: true, force: true });
  await Promise.all(originalGeneratedProjectFiles.map(([file, content]) => writeFile(path.join(repoRoot, file), content, "utf8")));
  await rm(stateRoot, { recursive: true, force: true });
});

test("browser loads isolated TV and phone runtime-upgrade previews without changing the published pin", async () => {
  const project = await postJson(`${baseUrl}/api/projects`, { name: "Browser Runtime Preview" });
  await patchConfig(project.id, { formatVersion: 1, migrationStatus: "upgraded", runtimeVersion: "atg-2d-1.2.0", type: "pixi" });
  const upgrade = await postJson(`${baseUrl}/api/projects/${project.id}/runtime-upgrades`, { runtimeVersion: "atg-2d-1.3.0" });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ extraHTTPHeaders: headers });
  const tv = await context.newPage();
  const phone = await context.newPage();
  const suffix = `?runtimeUpgrade=${upgrade.id}&revision=${encodeURIComponent(upgrade.previewRevision)}`;
  await tv.goto(`${baseUrl}/api/projects/${project.id}/game-assets/tv.html${suffix}`);
  await phone.goto(`${baseUrl}/api/projects/${project.id}/game-assets/phone.html${suffix}`);
  await assert.doesNotReject(() => tv.waitForFunction(() => Boolean(window.ATG)));
  await assert.doesNotReject(() => phone.waitForFunction(() => Boolean(window.ATG)));
  assert.match(await tv.content(), /atg-2d-1\.3\.0/);
  assert.equal((await getJson(`${baseUrl}/api/game/${project.id}/config`)).config.engine.runtimeVersion, "atg-2d-1.2.0");
  await browser.close();
});

async function waitForServer(child) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for the browser test server.")), 30_000);
    let ready = false;
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const onData = (chunk) => {
      if (!chunk.toString().includes("ATG dev server ready")) return;
      ready = true; clearTimeout(timeout); child.stdout.off("data", onData); resolve();
    };
    child.stdout.on("data", onData);
    child.once("exit", (code) => { if (!ready && code !== 0) { clearTimeout(timeout); reject(new Error(`Browser test server exited with ${code}: ${stderr}`)); } });
  });
}

async function getJson(url) {
  const response = await fetch(url, { headers });
  assert.equal(response.status, 200);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, { body: JSON.stringify(body), headers: { ...headers, "content-type": "application/json" }, method: "POST" });
  assert.ok(response.status === 200 || response.status === 201);
  const payload = await response.json();
  return payload.project || payload.upgrade;
}

async function patchConfig(projectId, engine) {
  const response = await fetch(`${baseUrl}/api/game/${projectId}/config`, { body: JSON.stringify({ engine }), headers: { ...headers, "content-type": "application/json" }, method: "PATCH" });
  assert.equal(response.status, 200);
}
