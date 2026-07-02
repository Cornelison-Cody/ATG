import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  decryptApiKey,
  encryptApiKey,
  normalizeApiKey,
  UserSettingsError
} from "../lib/user-settings.mjs";

test("user API keys round-trip through authenticated encryption", () => {
  const key = randomBytes(32);
  const encrypted = encryptApiKey("sk-project-secret", "user-a", key);

  assert.notEqual(encrypted, "sk-project-secret");
  assert.equal(decryptApiKey(encrypted, "user-a", key), "sk-project-secret");
  assert.throws(() => decryptApiKey(encrypted, "user-b", key));
  assert.throws(() => decryptApiKey(encrypted, "user-a", randomBytes(32)));
});

test("user API-key validation rejects missing and malformed values", () => {
  assert.equal(normalizeApiKey("  sk-valid  "), "sk-valid");
  assert.throws(
    () => normalizeApiKey(""),
    (error) => error instanceof UserSettingsError && error.status === 400
  );
  assert.throws(() => normalizeApiKey("not-a-key"), /must start with sk-/);
  assert.throws(() => normalizeApiKey(`sk-${"x".repeat(512)}`), /too long/);
});
