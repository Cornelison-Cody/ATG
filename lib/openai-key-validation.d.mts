export function validateOpenAiApiKey(
  apiKey: string,
  options?: { fetchImpl?: typeof fetch }
): Promise<{ ok: true; message: string }>;
