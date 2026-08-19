import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const store = await readFile(new URL("../lib/project-store.ts", import.meta.url), "utf8");
const conversion = await readFile(new URL("../lib/conversion-manager.mjs", import.meta.url), "utf8");

test("Azure storage contract publishes immutable game generations through one pointer", () => {
  assert.match(store, /generationBlobName\(project, generation/);
  assert.match(store, /item\.gameGeneration = generation/);
  assert.match(store, /if \(item\.gameGeneration !== project\.gameGeneration\)/);
  assert.match(conversion, /replaceGameTextFilesAtomically/);
});
