import { normalizeApiKey, UserSettingsError } from "./user-settings.mjs";

export async function validateOpenAiApiKey(apiKey, options = {}) {
  const normalized = normalizeApiKey(apiKey);
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl("https://api.openai.com/v1/models?limit=1", {
    headers: {
      Authorization: `Bearer ${normalized}`
    },
    method: "GET"
  });

  if (response.ok) {
    return { ok: true, message: "OpenAI API key validated." };
  }

  if (response.status === 401 || response.status === 403) {
    throw new UserSettingsError(
      "OpenAI rejected this API key. Check that it is valid, active, and has permission to use models.",
      400
    );
  }

  if (response.status === 429) {
    throw new UserSettingsError(
      "OpenAI rate-limited the validation request. Try again later or check your OpenAI project limits.",
      429
    );
  }

  throw new UserSettingsError(
    `OpenAI key validation failed with status ${response.status}. No key details were stored in logs or responses.`,
    502
  );
}
