export async function generateMediaWithProvider({ job, apiKey, references = [], signal }) {
  if (job.provider === "openai-image") return openAiImage(job, apiKey, references, signal);
  if (job.provider === "openai-sfx") return configuredSoundEffect(job, apiKey, signal);
  throw new Error("Unsupported media provider.");
}

export async function moderateMediaWithProvider({ job, apiKey, signal }) {
  if (!apiKey) return { allowed: true, label: "not_checked" };
  const response = await fetch("https://api.openai.com/v1/moderations", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "omni-moderation-latest", input: [{ type: "text", text: job.prompt }] }), signal });
  if (!response.ok) throw new Error("Media moderation failed.");
  const result = await response.json();
  const flagged = Boolean(result.results?.[0]?.flagged);
  return { allowed: !flagged, label: flagged ? "blocked" : "allowed", reason: flagged ? "The request was not approved by moderation." : undefined };
}

async function openAiImage(job, apiKey, references, signal) {
  if (!apiKey) throw new Error("An OpenAI API key is required for image generation.");
  const response = await fetch("https://api.openai.com/v1/images/generations", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: job.model, prompt: job.prompt, size: "1024x1024", response_format: "b64_json", ...(references.length ? { reference_images: references.map((reference) => ({ data: reference.data, content_type: reference.contentType })) } : {}) }), signal });
  if (!response.ok) throw new Error("Image provider request failed.");
  const result = await response.json();
  const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw new Error("Image provider returned no image.");
  return { bytes: Buffer.from(encoded, "base64"), contentType: "image/png", filename: `generated-${job.id}.png` };
}

async function configuredSoundEffect(job, apiKey, signal) {
  const endpoint = process.env.ATG_SFX_PROVIDER_URL;
  if (!endpoint) throw new Error("Sound-effect provider is not configured.");
  const key = apiKey || process.env.ATG_SFX_PROVIDER_KEY;
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ model: job.model, prompt: job.prompt }), signal });
  if (!response.ok) throw new Error("Sound-effect provider request failed.");
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "audio/wav", filename: `generated-${job.id}.wav` };
}
