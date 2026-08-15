import assert from "node:assert/strict";
import test from "node:test";
import { isPublicRuntimePath } from "../lib/auth.ts";

test("phone controller runtime paths are public", () => {
  assert.equal(isPublicRuntimePath("/join/project-1"), true);
  assert.equal(isPublicRuntimePath("/join/project-1?player=abc"), true);
  assert.equal(isPublicRuntimePath("/ws/game"), true);
  assert.equal(isPublicRuntimePath("/api/game/project-1/join-info"), true);
  assert.equal(isPublicRuntimePath("/api/game/project-1/instructions"), true);
  assert.equal(isPublicRuntimePath("/api/projects/project-1/game-assets/phone.html"), true);
});

test("TV host and editor paths require platform auth", () => {
  assert.equal(isPublicRuntimePath("/tv/project-1"), false);
  assert.equal(isPublicRuntimePath("/dashboard"), false);
  assert.equal(isPublicRuntimePath("/api/projects"), false);
  assert.equal(isPublicRuntimePath("/api/game/project-1/config"), false);
});
