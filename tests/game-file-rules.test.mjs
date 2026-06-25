import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedGameTextPath,
  normalizeGameTextFiles,
  validateGameTextPath
} from "../lib/game-file-rules.mjs";

test("validateGameTextPath accepts editable game text paths", () => {
  assert.equal(validateGameTextPath("tv.html"), "tv.html");
  assert.equal(validateGameTextPath("nested/widget.svg"), "nested/widget.svg");
  assert.equal(validateGameTextPath("config.json"), "config.json");
});

test("validateGameTextPath rejects unsafe paths", () => {
  assert.throws(() => validateGameTextPath(""), /required/);
  assert.throws(() => validateGameTextPath("../tv.html"), /outside/);
  assert.throws(() => validateGameTextPath("/tmp/tv.html"), /outside/);
  assert.throws(() => validateGameTextPath("nested\\tv.html"), /outside/);
  assert.throws(() => validateGameTextPath("nested//tv.html"), /outside/);
});

test("isAllowedGameTextPath rejects binary or unsupported files", () => {
  assert.equal(isAllowedGameTextPath("sprite.png"), false);
  assert.equal(isAllowedGameTextPath("archive.zip"), false);
  assert.equal(isAllowedGameTextPath("styles.css"), true);
});

test("normalizeGameTextFiles rejects oversized and duplicate files", () => {
  assert.throws(
    () => normalizeGameTextFiles([{ content: "x".repeat(200_001), path: "tv.html" }]),
    /size limit/
  );
  assert.throws(
    () => normalizeGameTextFiles([
      { content: "one", path: "tv.html" },
      { content: "two", path: "tv.html" }
    ]),
    /more than once/
  );
});
