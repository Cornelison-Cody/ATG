import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanningRequest, normalizeChatMode } from "../lib/chat-mode.mjs";

test("chat mode defaults to build unless planning is requested", () => {
  assert.equal(normalizeChatMode("plan"), "plan");
  assert.equal(normalizeChatMode("build"), "build");
  assert.equal(normalizeChatMode("anything-else"), "build");
  assert.equal(normalizeChatMode(null), "build");
});

test("planning requests ask one multiple choice gameplay question without file edits", () => {
  const prompt = buildPlanningRequest("Make a party trivia game.", "phone");

  assert.match(prompt, /Do not edit files yet/);
  assert.match(prompt, /Ask exactly one concise multiple-choice question/);
  assert.match(prompt, /Do not ask more than one question/);
  assert.match(prompt, /A\. <choice>/);
  assert.match(prompt, /phone controller/);
  assert.match(prompt, /Make a party trivia game/);
});
