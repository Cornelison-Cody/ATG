import assert from "node:assert/strict";
import test from "node:test";
import { renderGameInstructionsTemplate } from "../lib/game-instructions-template.mjs";

test("new game instructions include player-facing sections", () => {
  const instructions = renderGameInstructionsTemplate("Puzzle Harbor");

  assert.match(instructions, /^# Puzzle Harbor/);
  assert.match(instructions, /## Goal/);
  assert.match(instructions, /## Setup/);
  assert.match(instructions, /## How to Play/);
  assert.match(instructions, /## Phone Controls/);
  assert.match(instructions, /## Assets/);
  assert.match(instructions, /scoring rules/);
  assert.match(instructions, /players can take from their phones/);
});
