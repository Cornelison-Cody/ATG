import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const stateRoot = await mkdtemp(path.join(os.tmpdir(), "atg-conversion-http-"));
const port = 38000 + Math.floor(Math.random() * 1000);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.mjs"], {
  cwd: repoRoot,
  env: {
    ...process.env,
    ATG_DATA_ROOT: stateRoot,
    ATG_PROJECTS_ROOT: path.join(stateRoot, "projects"),
    ATG_STATE_ROOT: path.join(stateRoot, ".atg"),
    NODE_ENV: "development",
    PORT: String(port)
  },
  stdio: ["ignore", "pipe", "pipe"]
});

await waitForServer(server);
process.env.ATG_DATA_ROOT = stateRoot;
process.env.ATG_PROJECTS_ROOT = path.join(stateRoot, "projects");
process.env.ATG_STATE_ROOT = path.join(stateRoot, ".atg");
process.env.ATG_STORAGE_BACKEND = "local";

const conversionStore = await import("../lib/conversion-store.mjs");

test.after(async () => {
  server.kill("SIGTERM");
  await rm(stateRoot, { recursive: true, force: true });
});

test("HTTP conversion workflow keeps published files unchanged until accepted", async () => {
  const project = await createProject("HTTP Conversion");
  const legacy = { formatVersion: 1, migrationStatus: "legacy", runtimeVersion: null, type: "legacy" };
  await patchConfig(project.id, legacy);
  const publishedByPath = await fetchGameFiles(project.id);
  const conversion = await startConversion(project.id, "http-success");
  const config = JSON.parse(publishedByPath.get("config.json"));
  const candidateConfig = `${JSON.stringify({ ...config, engine: { formatVersion: 1, migrationStatus: "upgraded", runtimeVersion: "atg-2d-1.3.0", type: "pixi" } }, null, 2)}\n`;
  const candidateFiles = [
    { path: "config.json", content: candidateConfig },
    { path: "game.js", content: `${publishedByPath.get("game.js")}\nwindow.__httpCandidate = true;\n` },
    { path: "phone.html", content: `${publishedByPath.get("phone.html")}\n<script>window.ATG.sendAction("http-candidate");</script>\n<!-- http candidate phone -->\n` }
  ];
  await conversionStore.saveConversionCandidate(conversion.id, { candidateRevision: "candidate-http-success", textFiles: mergeCandidateFiles(publishedByPath, candidateFiles), finalMessage: "Candidate ready." });

  const publishedResponse = await fetch(`${baseUrl}/api/projects/${project.id}/game-assets/game.js`);
  assert.equal(publishedResponse.status, 200);
  assert.equal(await publishedResponse.text(), publishedByPath.get("game.js"));

  const review = await getJson(`${baseUrl}/api/projects/${project.id}/conversions/${conversion.id}`);
  const revision = review.conversion.candidate.candidateRevision;
  const candidateTv = await fetch(`${baseUrl}/api/projects/${project.id}/game-assets/tv.html?conversion=${conversion.id}&revision=${revision}`);
  const candidatePhone = await fetch(`${baseUrl}/api/projects/${project.id}/game-assets/phone.html?conversion=${conversion.id}&revision=${revision}`);
  assert.equal(candidateTv.status, 200);
  assert.equal(candidatePhone.status, 200);
  assert.match(await candidateTv.text(), /ATGEngine/);
  assert.match(await candidatePhone.text(), /http candidate phone/);

  const validation = await postJson(`${baseUrl}/api/projects/${project.id}/conversions/${conversion.id}`, {
    action: "validate",
    performance: { fps: 24 },
    runtime: { loaded: true }
  });
  assert.equal(validation.conversion.validation.blockingErrors.length, 0);
  assert.ok(validation.conversion.validation.warnings.length > 0);

  const blockedAcceptance = await postRaw(`${baseUrl}/api/projects/${project.id}/conversions/${conversion.id}`, { action: "accept" });
  assert.equal(blockedAcceptance.status, 409);
  const accepted = await postJson(`${baseUrl}/api/projects/${project.id}/conversions/${conversion.id}`, { action: "accept", acknowledgeWarnings: true });
  assert.equal(accepted.conversion.status, "accepted");
  const publishedAfter = await fetchGameFiles(project.id);
  assert.equal(publishedAfter.get("game.js"), candidateFiles.find((file) => file.path === "game.js").content);
  assert.equal(JSON.parse(publishedAfter.get("config.json")).engine.type, "pixi");
});

test("HTTP conversion cancellation, retry, blocking validation, and revision conflict are recoverable", async () => {
  const project = await createProject("HTTP Recovery");

  const cancelled = await startConversion(project.id, "http-cancel");
  const cancelResponse = await postJson(`${baseUrl}/api/projects/${project.id}/conversions/${cancelled.id}`, { action: "cancel" });
  assert.equal(cancelResponse.conversion.status, "cancelled");

  const failed = await startConversion(project.id, "http-retry");
  await conversionStore.failConversion(failed.id, "worker interrupted");
  const retryResponse = await postJson(`${baseUrl}/api/projects/${project.id}/conversions/${failed.id}`, { action: "retry" });
  assert.equal(retryResponse.conversion.status, "queued");

  const blocking = await startConversion(project.id, "http-blocking");
  const blockingFiles = await fetchGameFiles(project.id);
  blockingFiles.set("config.json", "{}");
  await conversionStore.saveConversionCandidate(blocking.id, { candidateRevision: "candidate-http-blocking", textFiles: [...blockingFiles].map(([path, content]) => ({ path, content })) });
  const blockingValidation = await postJson(`${baseUrl}/api/projects/${project.id}/conversions/${blocking.id}`, { action: "validate", runtime: { loaded: true } });
  assert.ok(blockingValidation.conversion.validation.blockingErrors.length > 0);
  const blocked = await postRaw(`${baseUrl}/api/projects/${project.id}/conversions/${blocking.id}`, { action: "accept" });
  assert.equal(blocked.status, 409);

  const conflict = await startConversion(project.id, "http-conflict");
  await writeFile(path.join(project.path, "game", "game.js"), "published edit after snapshot");
  const conflictFiles = await fetchGameFiles(project.id);
  const conflictConfig = JSON.parse(conflictFiles.get("config.json"));
  conflictConfig.engine = { formatVersion: 1, migrationStatus: "upgraded", runtimeVersion: "atg-2d-1.3.0", type: "pixi" };
  conflictFiles.set("config.json", `${JSON.stringify(conflictConfig)}\n`);
  await conversionStore.saveConversionCandidate(conflict.id, { candidateRevision: "candidate-http-conflict", textFiles: [...conflictFiles].map(([path, content]) => ({ path, content })) });
  await postJson(`${baseUrl}/api/projects/${project.id}/conversions/${conflict.id}`, { action: "validate", runtime: { loaded: true } });
  const conflictResponse = await postRaw(`${baseUrl}/api/projects/${project.id}/conversions/${conflict.id}`, { action: "accept" });
  assert.equal(conflictResponse.status, 409);
});

test("HTTP runtime upgrade previews are isolated and acceptance pins the selected runtime", async () => {
  const project = await createProject("HTTP Runtime Upgrade");
  await patchConfig(project.id, { formatVersion: 1, migrationStatus: "upgraded", runtimeVersion: "atg-2d-1.2.0", type: "pixi" });
  const listed = await getJson(`${baseUrl}/api/projects/${project.id}/runtime-upgrades`);
  assert.ok(listed.options.some((option) => option.runtimeVersion === "atg-2d-1.3.0"));
  const started = await postRaw(`${baseUrl}/api/projects/${project.id}/runtime-upgrades`, { runtimeVersion: "atg-2d-1.3.0" });
  assert.equal(started.status, 201);
  const upgrade = (await started.json()).upgrade;
  const preview = await fetch(`${baseUrl}/api/projects/${project.id}/game-assets/tv.html?runtimeUpgrade=${upgrade.id}&revision=${encodeURIComponent(upgrade.previewRevision)}`);
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /atg-2d-1\.3\.0/);
  const cancelled = await postJson(`${baseUrl}/api/projects/${project.id}/runtime-upgrades/${upgrade.id}`, { action: "cancel" });
  assert.equal(cancelled.upgrade.status, "cancelled");
  assert.equal((await getJson(`${baseUrl}/api/game/${project.id}/config`)).config.engine.runtimeVersion, "atg-2d-1.2.0");

  const acceptedStart = await postRaw(`${baseUrl}/api/projects/${project.id}/runtime-upgrades`, { runtimeVersion: "atg-2d-1.3.0" });
  const acceptedUpgrade = (await acceptedStart.json()).upgrade;
  const validation = await postJson(`${baseUrl}/api/projects/${project.id}/runtime-upgrades/${acceptedUpgrade.id}`, { action: "validate" });
  assert.equal(validation.upgrade.validation.runtimeVersion, "atg-2d-1.3.0");
  assert.ok(validation.upgrade.validation.warnings.length > 0);
  const accepted = await postJson(`${baseUrl}/api/projects/${project.id}/runtime-upgrades/${acceptedUpgrade.id}`, { action: "accept", acknowledgeWarnings: true });
  assert.equal(accepted.upgrade.status, "accepted");
  assert.equal((await getJson(`${baseUrl}/api/game/${project.id}/config`)).config.engine.runtimeVersion, "atg-2d-1.3.0");
});

test("HTTP media jobs are authenticated, durable, and exclude unsupported media", async () => {
  const project = await createProject("HTTP Media Jobs");
  const listed = await getJson(`${baseUrl}/api/projects/${project.id}/media-jobs`);
  assert.deepEqual(listed.jobs, []);
  const rejected = await postRaw(`${baseUrl}/api/projects/${project.id}/media-jobs`, { kind: "video", prompt: "a movie" });
  assert.equal(rejected.status, 400);
  const missingConsent = await postRaw(`${baseUrl}/api/projects/${project.id}/media-jobs`, { kind: "image", prompt: "a mascot", referenceAssetPaths: ["assets/missing.png"] });
  assert.equal(missingConsent.status, 400);
});

test("HTTP asset uploads validate signatures and protect referenced assets", async () => {
  const project = await createProject("HTTP Asset Validation");
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const upload = new FormData(); upload.append("file", new File([png], "hero.png", { type: "image/png" }));
  const uploaded = await fetch(`${baseUrl}/api/projects/${project.id}/assets`, { method: "POST", body: upload });
  assert.equal(uploaded.status, 200);
  const spoof = new FormData(); spoof.append("file", new File(["not an image"], "fake.png", { type: "image/png" }));
  const rejected = await fetch(`${baseUrl}/api/projects/${project.id}/assets`, { method: "POST", body: spoof });
  assert.equal(rejected.status, 400);
  const atlas = new FormData(); atlas.append("file", new File([JSON.stringify({ frames: { hero: { path: "./assets/hero.png" } } })], "atlas.json", { type: "application/json" }));
  assert.equal((await fetch(`${baseUrl}/api/projects/${project.id}/assets`, { method: "POST", body: atlas })).status, 200);
  const blockedDelete = await fetch(`${baseUrl}/api/projects/${project.id}/assets?path=assets/hero.png`, { method: "DELETE" });
  assert.equal(blockedDelete.status, 409);
});

async function getJson(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200);
  return response.json();
}

async function createProject(name) {
  const response = await postRaw(`${baseUrl}/api/projects`, { name });
  assert.equal(response.status, 201);
  return (await response.json()).project;
}

async function patchConfig(projectId, engine) {
  const response = await fetch(`${baseUrl}/api/game/${projectId}/config`, {
    body: JSON.stringify({ engine }),
    headers: { "content-type": "application/json" },
    method: "PATCH"
  });
  assert.equal(response.status, 200);
}

async function fetchGameFiles(projectId) {
  const files = new Map();
  for (const file of ["config.json", "instructions.md", "styles.css", "game.js", "phone.html", "tv.html"]) {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/game-assets/${file}`);
    assert.equal(response.status, 200);
    files.set(file, await response.text());
  }
  return files;
}

async function startConversion(projectId, conversionId) {
  const response = await postRaw(`${baseUrl}/api/projects/${projectId}/conversions`, { conversionId });
  assert.equal(response.status, 201);
  return (await response.json()).conversion;
}

function mergeCandidateFiles(published, changed) {
  const merged = new Map(published);
  for (const file of changed) merged.set(file.path, file.content);
  return [...merged].map(([path, content]) => ({ path, content }));
}

async function postJson(url, body) {
  const response = await postRaw(url, body);
  assert.equal(response.status, 200);
  return response.json();
}

async function postRaw(url, body) {
  return fetch(url, { body: JSON.stringify(body), headers: { "content-type": "application/json" }, method: "POST" });
}

async function waitForServer(child) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for the integration server.")), 30_000);
    let ready = false;
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    const onData = (chunk) => {
      if (!chunk.toString().includes("ATG dev server ready")) return;
      ready = true;
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      resolve();
    };
    child.stdout.on("data", onData);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      if (!ready && code !== null && code !== 0) {
        clearTimeout(timeout);
        reject(new Error(`Integration server exited with ${code}: ${stderr}`));
      }
    });
  });
}
