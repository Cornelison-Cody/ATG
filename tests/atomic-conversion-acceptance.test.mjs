import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const storeSource = await readFile(new URL("../lib/project-store.ts", import.meta.url), "utf8");
const managerSource = await readFile(new URL("../lib/conversion-manager.mjs", import.meta.url), "utf8");

test("conversion acceptance uses the atomic game promotion boundary", () => {
  assert.match(managerSource, /replaceGameTextFilesAtomically\(project, record\.candidate\.textFiles\)/);
  assert.doesNotMatch(managerSource, /await updateGameTextFiles\(project, record\.candidate\.textFiles\)/);
});

test("local promotions stage a complete immutable game tree before moving the pointer", () => {
  assert.match(storeSource, /game-generations/, "generations are retained instead of directory-swapped");
  assert.match(storeSource, /await cp\(sourcePath, stagePath, \{ recursive: true, errorOnExist: true \}\)/);
  assert.match(storeSource, /item\.gameGeneration = generation/);
  assert.match(storeSource, /appendGenerationReceipt/);
});

test("Azure promotions publish immutable generations through a single project pointer", () => {
  assert.match(storeSource, /const generation = randomUUID\(\)/);
  assert.match(storeSource, /const targetPrefix = generationBlobName\(project, generation, `\$\{GAME_DIR\}\/`\)/);
  assert.match(storeSource, /fresh\.gameGeneration = generation/);
  assert.match(storeSource, /function generationBlobName\(/);
});
