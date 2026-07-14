import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectPrompt } from "../lib/project-prompt.mjs";

test("TV build prompts prioritize the TV display target", () => {
  const prompt = buildProjectPrompt("Make the scoreboard easier to read.", "tv");

  assert.match(prompt, /ACTIVE EDITING TARGET: TV display/);
  assert.match(prompt, /Primary target file: game\/tv\.html/);
  assert.match(prompt, /Prioritize game\/tv\.html/);
  assert.match(prompt, /Do not edit game\/phone\.html unless the creator explicitly asks/);
  assert.match(prompt, /game\/styles\.css, game\/game\.js, game\/config\.json, and game\/instructions\.md/);
  assert.match(prompt, /Make the scoreboard easier to read/);
});

test("phone build prompts prioritize the phone controller target", () => {
  const prompt = buildProjectPrompt("Add a buzz button.", "phone");

  assert.match(prompt, /ACTIVE EDITING TARGET: Phone controller/);
  assert.match(prompt, /Primary target file: game\/phone\.html/);
  assert.match(prompt, /Prioritize game\/phone\.html/);
  assert.match(prompt, /Do not edit game\/tv\.html unless the creator explicitly asks/);
  assert.match(prompt, /game\/styles\.css, game\/game\.js, game\/config\.json, and game\/instructions\.md/);
  assert.match(prompt, /Add a buzz button/);
});
