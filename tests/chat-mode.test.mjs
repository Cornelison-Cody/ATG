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
    recentContext: "user: It should use teams.\nassistant: Question: How should scoring work?"
  });

  assert.match(prompt, /Do not edit files yet/);
  assert.match(prompt, /Planning should be bounded/);
  assert.match(prompt, /Stop asking questions once the game loop/);
  assert.match(prompt, /Do not ask more than one question/);
  assert.match(prompt, /Decisions so far:/);
  assert.match(prompt, /Proposed plan:/);
  assert.match(prompt, /Ready to build\?/);
  assert.match(prompt, /Implement TV display/);
  assert.match(prompt, /Implement phone controller/);
  assert.match(prompt, /Implement both TV and phone/);
  assert.match(prompt, /A\. <choice>/);
  assert.match(prompt, /phone controller/);
  assert.match(prompt, /user: It should use teams/);
  assert.match(prompt, /Make a party trivia game/);
});
