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
  assert.match(instructions, /## TV Display/);
  assert.match(instructions, /## Scoring/);
  assert.match(instructions, /## Assets and Screenshots/);
  assert.match(instructions, /Open the TV view on the shared screen/);
  assert.match(instructions, /players can take from their phones/);
  assert.match(instructions, /!\[Example game screen\]\(example\.png\)/);
});
