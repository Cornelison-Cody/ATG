import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("runtime acceptance uses the published generation promotion boundary", async () => {
  const source = await readFile(new URL("../lib/runtime-upgrade-manager.mjs", import.meta.url), "utf8");
  assert.match(source, /exportGameTextFiles\(project\)/);
  assert.match(source, /replaceGameTextFilesAtomically\(project, files\)/);
  assert.doesNotMatch(source, /await updateGameConfig\(project, \{ engine: nextEngine \}\)/);
});
