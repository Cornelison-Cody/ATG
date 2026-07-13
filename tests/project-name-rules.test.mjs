import assert from "node:assert/strict";
import test from "node:test";
import {
  PROJECT_NAME_MAX_LENGTH,
  validateProjectDetailsPatch,
  validateProjectName
} from "../lib/project-name-rules.mjs";

test("project names are trimmed and required", () => {
  assert.deepEqual(validateProjectName("  Trivia Night  "), { ok: true, name: "Trivia Night" });
  assert.deepEqual(validateProjectName("   "), { ok: false, error: "Project name is required." });
  assert.deepEqual(validateProjectName(null), { ok: false, error: "Project name must be a string." });
});

test("project name validation enforces a maximum length", () => {
  const validName = "a".repeat(PROJECT_NAME_MAX_LENGTH);
  const longName = "a".repeat(PROJECT_NAME_MAX_LENGTH + 1);

  assert.deepEqual(validateProjectName(validName), { ok: true, name: validName });
  assert.deepEqual(validateProjectName(longName), {
    ok: false,
    error: `Project name must be ${PROJECT_NAME_MAX_LENGTH} characters or fewer.`
  });
});

test("project detail patches reject unsupported fields", () => {
  assert.deepEqual(validateProjectDetailsPatch({ name: "Updated" }), { ok: true, name: "Updated" });
  assert.deepEqual(validateProjectDetailsPatch({ name: "Updated", slug: "updated" }), {
    ok: false,
    error: "Unsupported project detail field: slug."
  });
  assert.deepEqual(validateProjectDetailsPatch([]), {
    ok: false,
    error: "Project details must be an object."
  });
});
