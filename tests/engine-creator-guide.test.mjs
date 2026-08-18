import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const docs = await readFile(new URL("../docs/engine-creator-guide.md", import.meta.url), "utf8");
const page = await readFile(new URL("../app/engine-guide/page.tsx", import.meta.url), "utf8");
const menu = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

test("creator guide covers engine boundaries, conversion, media, diagnostics, and performance", () => {
  for (const phrase of ["Upgrade Game", "Cancel Upgrade", "Accept Upgrade", "DOM", "4K and 30 FPS", "Runtime Upgrade", "does not collect engine gameplay telemetry"]) assert.match(docs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("guide is reachable from the project menu and app route", () => {
  assert.match(menu, /href="\/engine-guide"/);
  assert.match(page, /ATG engine creator guide/);
  assert.match(page, /Cancel Upgrade/);
});
