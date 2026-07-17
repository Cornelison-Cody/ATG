import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  decryptApiKey,
  encryptApiKey,
  getUserAiBillingMode,
  getUserApiKey,
  normalizeApiKey,
  normalizeAiBillingMode,
  saveUserAiBillingMode,
  saveUserApiKey,
  UserSettingsError
} from "../lib/user-settings.mjs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

test("AI billing mode defaults to managed and validates supported modes", () => {
  assert.equal(normalizeAiBillingMode("managed"), "managed");
  assert.equal(normalizeAiBillingMode(" BYOK "), "byok");
  assert.throws(() => normalizeAiBillingMode("server"), /managed or byok/);
});

test("AI billing mode preserves saved personal keys", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "atg-user-settings-test-"));
  const previous = process.env.ATG_DATA_ROOT;
  process.env.ATG_DATA_ROOT = root;
  const settings = await import(`../lib/user-settings.mjs?test=${Date.now()}`);

  try {
    assert.equal(await settings.getUserAiBillingMode("user-a"), "managed");
    await assert.rejects(
      settings.saveUserAiBillingMode("user-a", "byok"),
      /Save and test a personal OpenAI API key/
    );
    await settings.saveUserApiKey("user-a", "sk-project-user-a");
    await settings.saveUserAiBillingMode("user-a", "byok");

    assert.equal(await settings.getUserAiBillingMode("user-a"), "byok");
    assert.equal(await settings.getUserApiKey("user-a"), "sk-project-user-a");
    await settings.deleteUserApiKey("user-a");
    assert.equal(await settings.getUserAiBillingMode("user-a"), "managed");
    assert.equal(await settings.getUserApiKey("user-a"), "");
  } finally {
    if (previous === undefined) delete process.env.ATG_DATA_ROOT;
    else process.env.ATG_DATA_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  }
});
