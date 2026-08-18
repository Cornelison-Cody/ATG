import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeSource = await readFile(new URL("../app/api/projects/[id]/game-assets/[...path]/route.ts", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../components/engine-diagnostics.tsx", import.meta.url), "utf8");

test("engine diagnostics are injected only for editor Pixi TV previews", () => {
  assert.match(routeSource, /engine\?\.type === "pixi" && new URL\(requestUrl\)\.searchParams\.has\("atgEditorPreview"\)/);
  assert.match(routeSource, /type: "engineDiagnostics"/);
  assert.match(routeSource, /addEventListener\("atg-audio-error"/);
  assert.match(routeSource, /addEventListener\("atg-engine-error"/);
  assert.match(routeSource, /FRAME_BUDGET_MS = 1000 \/ 30/);
  assert.match(routeSource, /ticker\?\.add\(tickerCallback\)/);
  assert.match(routeSource, /p50FrameTimeMs/);
  assert.doesNotMatch(routeSource, /animationFrame = requestAnimationFrame\(onFrame\)/);
});

test("dashboard diagnostics accept messages only from the active preview frame", () => {
  assert.match(componentSource, /event\.source !== frameRef\.current\?\.contentWindow/);
  assert.match(componentSource, /event\.data\?\.type !== "engineDiagnostics"/);
  assert.match(componentSource, /useState<DiagnosticsPayload \| null>/);
  assert.match(componentSource, /droppedFrames/);
});
