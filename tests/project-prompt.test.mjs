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
  assert.match(prompt, /Keep game\/instructions\.md in sync with gameplay changes/);
  assert.match(prompt, /rules, setup, player actions, scoring, win conditions, controls, or assets/);
  assert.match(prompt, /Always design player and host actions with immediate feedback/);
  assert.match(prompt, /button states, visual confirmation, animation, sound when appropriate, status text/);
  assert.match(prompt, /Phone actions should confirm on the phone and update the TV/);
  assert.match(prompt, /honor prefers-reduced-motion/);
  assert.match(prompt, /Make the scoreboard easier to read/);
});

test("phone build prompts prioritize the phone controller target", () => {
  const prompt = buildProjectPrompt("Add a buzz button.", "phone");

  assert.match(prompt, /ACTIVE EDITING TARGET: Phone controller/);
  assert.match(prompt, /Primary target file: game\/phone\.html/);
  assert.match(prompt, /Prioritize game\/phone\.html/);
  assert.match(prompt, /Do not edit game\/tv\.html unless the creator explicitly asks/);
  assert.match(prompt, /game\/styles\.css, game\/game\.js, game\/config\.json, and game\/instructions\.md/);
  assert.match(prompt, /Keep game\/instructions\.md in sync with gameplay changes/);
  assert.match(prompt, /rules, setup, player actions, scoring, win conditions, controls, or assets/);
  assert.match(prompt, /Always design player and host actions with immediate feedback/);
  assert.match(prompt, /button states, visual confirmation, animation, sound when appropriate, status text/);
  assert.match(prompt, /Phone actions should confirm on the phone and update the TV/);
  assert.match(prompt, /honor prefers-reduced-motion/);
  assert.match(prompt, /Add a buzz button/);
});

test("full-plan build prompts allow coordinated TV and phone changes", () => {
  const prompt = buildProjectPrompt("Implement the proposed plan.", "both");

  assert.match(prompt, /ACTIVE EDITING TARGET: Full game plan/);
  assert.match(prompt, /Primary target file: game\/tv\.html and game\/phone\.html/);
  assert.match(prompt, /Implement the requested plan across every affected game file/);
  assert.match(prompt, /Edit both game\/tv\.html and game\/phone\.html when the plan affects both experiences/);
  assert.match(prompt, /Keep game\/instructions\.md in sync with gameplay changes/);
  assert.match(prompt, /Implement the proposed plan/);
});

test("build prompts expose the normalized game engine metadata", () => {
  const prompt = buildProjectPrompt("Improve the round timer.", "tv", {
    formatVersion: 1,
    migrationStatus: "upgraded",
    runtimeVersion: "8.19.0",
    type: "pixi"
  });

  assert.match(prompt, /Game engine metadata from game\/config\.json/);
  assert.match(prompt, /"type":"pixi"/);
  assert.match(prompt, /"runtimeVersion":"8\.19\.0"/);
  assert.match(prompt, /Preserve it unless the creator explicitly asks/);
  assert.match(prompt, /ENGINE-BACKED GAME CONTRACT/);
  assert.match(prompt, /window\.ATGEngine/);
  assert.match(prompt, /engine\.gameplay\.createScene/);
  assert.match(prompt, /game\/scenes\/\*\.mjs/);
  assert.match(prompt, /scene\.createParticlePool/);
  assert.match(prompt, /engine\.bridge\.onState/);
  assert.match(prompt, /approved game asset paths and manifests/);
  assert.match(prompt, /4K\/30 FPS budgets/);
  assert.match(prompt, /public CDNs/);
});

test("engine prompts preserve phone DOM ownership and legacy prompts avoid engine APIs", () => {
  const phonePrompt = buildProjectPrompt("Add a ready button.", "phone", {
    formatVersion: 1,
    migrationStatus: "upgraded",
    runtimeVersion: "atg-2d-1.3.0",
    type: "pixi"
  });
  assert.match(phonePrompt, /Phone edits must remain accessible DOM controls/);
  assert.doesNotMatch(phonePrompt, /fall back to ad hoc TV DOM/);

  const legacyPrompt = buildProjectPrompt("Polish the display.", "tv");
  assert.match(legacyPrompt, /LEGACY GAME CONTRACT/);
  assert.match(legacyPrompt, /Do not add PixiJS/);
  assert.doesNotMatch(legacyPrompt, /ENGINE-BACKED GAME CONTRACT/);
});
