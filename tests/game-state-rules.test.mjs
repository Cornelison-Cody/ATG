import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGameStatePatch } from "../lib/game-state-rules.mjs";

test("normalizeGameStatePatch preserves custom JSON state", () => {
  assert.deepEqual(normalizeGameStatePatch({
    chess: {
      controllers: {
        white: { id: "player-1", name: "Cody" }
      },
      turn: "white"
    }
  }), {
    chess: {
      controllers: {
        white: { id: "player-1", name: "Cody" }
      },
      turn: "white"
    }
  });
});

test("normalizeGameStatePatch removes platform-owned fields", () => {
  assert.deepEqual(normalizeGameStatePatch({
    actions: ["fake"],
    chess: { turn: "black" },
    players: ["fake"],
    projectId: "other-project"
  }), {
    chess: { turn: "black" }
  });
});

test("normalizeGameStatePatch rejects invalid and oversized state", () => {
  assert.throws(() => normalizeGameStatePatch(null), /must be an object/);
  assert.throws(() => normalizeGameStatePatch([]), /must be an object/);
  assert.throws(
    () => normalizeGameStatePatch({ chess: "x".repeat(100_001) }),
    /size limit/
  );
});
