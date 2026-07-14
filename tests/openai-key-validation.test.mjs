import assert from "node:assert/strict";
import test from "node:test";
import { validateOpenAiApiKey } from "../lib/openai-key-validation.mjs";
import { UserSettingsError } from "../lib/user-settings.mjs";

test("OpenAI API-key validation succeeds with a valid response", async () => {
  const result = await validateOpenAiApiKey("sk-test", {
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, "Bearer sk-test");
      return { ok: true, status: 200 };
    }
  });

  assert.deepEqual(result, { ok: true, message: "OpenAI API key validated." });
});

test("OpenAI API-key validation redacts rejected keys", async () => {
  await assert.rejects(
    () => validateOpenAiApiKey("sk-secret-value", {
      fetchImpl: async () => ({ ok: false, status: 401 })
    }),
    (error) =>
      error instanceof UserSettingsError &&
      error.status === 400 &&
      !error.message.includes("sk-secret-value") &&
      /rejected this API key/.test(error.message)
  );
});

test("OpenAI API-key validation reports rate limiting without exposing the key", async () => {
  await assert.rejects(
    () => validateOpenAiApiKey("sk-rate-limited", {
      fetchImpl: async () => ({ ok: false, status: 429 })
    }),
    (error) =>
      error instanceof UserSettingsError &&
      error.status === 429 &&
      !error.message.includes("sk-rate-limited") &&
      /rate-limited/.test(error.message)
  );
});
