import test from "node:test";
import assert from "node:assert/strict";
import { validateConvertedGame } from "../lib/conversion-validation.mjs";

const goodFiles = [
  { path: "config.json", content: JSON.stringify({ engine: { formatVersion: 1, migrationStatus: "upgraded", runtimeVersion: "atg-2d-1.3.0", type: "pixi" } }) },
  { path: "game.js", content: "window.ATGEngine.ready; window.ATG.sendAction('ready');" },
  { path: "instructions.md", content: "Join the game and answer each round." },
  { path: "phone.html", content: "<button onclick=\"window.ATG.sendAction('ready')\">Ready</button>" },
  { path: "styles.css", content: "body{}" },
  { path: "tv.html", content: "<script>window.ATGEngine.ready.then(() => {});</script>" }
];

test("valid converted games pass metadata, runtime, bridge, asset, and instruction checks", () => {
  const report = validateConvertedGame({ files: goodFiles, assets: [], runtime: { loaded: true }, performance: { fps: 30 } });
  assert.equal(report.ok, true);
  assert.equal(report.blockingErrors.length, 0);
});

test("broken runtime, metadata, bridge, and missing assets block acceptance", () => {
  const report = validateConvertedGame({
    files: goodFiles.map((file) => file.path === "config.json" ? { ...file, content: "{}" } : file.path === "tv.html" ? { ...file, content: "<img src=\"assets/missing.png\">" } : file.path === "phone.html" ? { ...file, content: "<button>Ready</button>" } : file),
    runtime: { loaded: false, error: "Runtime unavailable" }
  });
  assert.equal(report.ok, false);
  assert.deepEqual(new Set(report.blockingErrors.map((finding) => finding.code)), new Set(["engine-metadata", "assets", "phone-bridge", "runtime"]));
});

test("performance and audio compatibility concerns are warnings", () => {
  const report = validateConvertedGame({ files: goodFiles, runtime: { loaded: true }, diagnostics: { audioFailures: 1 }, performance: { fps: 24, renderer: "software" } });
  assert.equal(report.ok, true);
  assert.deepEqual(new Set(report.warnings.map((finding) => finding.code)), new Set(["audio", "performance", "renderer"]));
});
