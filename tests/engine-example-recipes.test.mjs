import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ENGINE_EXAMPLE_RECIPES, validateEngineExampleRecipes } from "../lib/engine-example-recipes.mjs";

const docs = await readFile(new URL("../docs/engine-authoring-recipes.md", import.meta.url), "utf8");

test("example recipe manifest covers the six roadmap game patterns", () => {
  assert.equal(validateEngineExampleRecipes(), true);
  assert.deepEqual(ENGINE_EXAMPLE_RECIPES.map((recipe) => recipe.id), ["trivia", "buzzer", "board", "action", "timer", "teams"]);
});

test("recipes document the engine contracts and every example", () => {
  for (const title of ["Trivia round", "Buzzer race", "Board path", "Action arena", "Timer challenge", "Team relay"]) {
    assert.match(docs, new RegExp(`## ${title}`));
  }
  for (const pattern of [
    /editor preview, TV route, and phone route/, /scene\.scope\.onState/, /scene\.createParticlePool/,
    /scene\.audio/, /window\.ATG\.sendAction/, /4K\/30 FPS/, /Loading, failure, and performance checklist/
  ]) assert.match(docs, pattern);
});
