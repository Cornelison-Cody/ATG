import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanningRequest, normalizeChatMode } from "../lib/chat-mode.mjs";

test("chat mode defaults to build unless planning is requested", () => {
  assert.equal(normalizeChatMode("plan"), "plan");
  assert.equal(normalizeChatMode("build"), "build");
  assert.equal(normalizeChatMode("anything-else"), "build");
  assert.equal(normalizeChatMode(null), "build");
});

test("planning requests ask bounded questions and offer implementation handoff", () => {
  const prompt = buildPlanningRequest("Make a party trivia game.", "phone", {
    engineMetadata: {
      formatVersion: 1,
      migrationStatus: "upgraded",
      runtimeVersion: "atg-2d-1.3.0",
      type: "pixi"
    },
    recentContext: "user: It should use teams.\nassistant: Question: How should scoring work?"
  });

  assert.match(prompt, /Do not edit files yet/);
  assert.match(prompt, /Planning should be bounded/);
  assert.match(prompt, /Stop asking questions once the game loop/);
  assert.match(prompt, /Do not ask more than one question/);
  assert.match(prompt, /Decisions so far:/);
  assert.match(prompt, /Proposed plan:/);
  assert.match(prompt, /Ready to build\?/);
  assert.match(prompt, /A\. Implement plan/);
  assert.match(prompt, /B\. Keep planning/);
  assert.match(prompt, /Distinguish required gameplay from optional polish/);
  assert.match(prompt, /Implementation handoff:/);
  assert.match(prompt, /Selected visuals\/animation/);
  assert.match(prompt, /Selected sound\/feedback/);
  assert.match(prompt, /atg-2d-1\.3\.0/);
  assert.match(prompt, /sprite animation, particles, transitions, camera effects, sound cues/);
  assert.match(prompt, /phone controls remain accessible and DOM-based/);
  assert.match(prompt, /4K\/30 FPS budget/);
  assert.doesNotMatch(prompt, /Implement TV display/);
  assert.doesNotMatch(prompt, /Implement phone controller/);
  assert.doesNotMatch(prompt, /Implement both TV and phone/);
  assert.match(prompt, /A\. <choice>/);
  assert.match(prompt, /phone controller/);
  assert.match(prompt, /user: It should use teams/);
  assert.match(prompt, /Make a party trivia game/);
});

test("planning keeps both-surface ownership and legacy boundaries", () => {
  const bothPrompt = buildPlanningRequest("Build a team game.", "both", {
    engineMetadata: {
      formatVersion: 1,
      migrationStatus: "upgraded",
      runtimeVersion: "atg-2d-1.3.0",
      type: "pixi"
    }
  });
  assert.match(bothPrompt, /TV display and phone controller/);
  assert.match(bothPrompt, /TV visuals use the pinned Pixi runtime and phone controls remain accessible DOM interfaces/);

  const legacyPrompt = buildPlanningRequest("Polish the game.", "tv", {
    engineMetadata: { formatVersion: 1, migrationStatus: "legacy", runtimeVersion: null, type: "legacy" }
  });
  assert.match(legacyPrompt, /Legacy project guidance/);
  assert.match(legacyPrompt, /Do not propose PixiJS scenes/);
  assert.doesNotMatch(legacyPrompt, /Engine-backed project guidance/);
});
