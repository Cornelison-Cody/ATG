/** OpenAI is the default adapter; deployment-specific adapters stay opt-in through environment configuration. */
export async function generateMediaWithProvider({ job, apiKey, references = [], signal }) {
  if (job.provider === "openai-image") return openAiImage(job, apiKey, references, signal);
  if (job.provider === "openai-sfx") return process.env.ATG_SFX_PROVIDER_URL ? configuredSoundEffect(job, apiKey, signal) : openAiSoundEffect(job, apiKey, signal);
  throw new Error("Unsupported media provider.");
}

export async function moderateMediaWithProvider({ job, generated, apiKey, signal }) {
  if (!apiKey) return { allowed: true, label: "not_checked" };
  const input = generated?.contentType?.startsWith("image/")
    ? [{ type: "image_url", image_url: { url: `data:${generated.contentType};base64,${generated.bytes.toString("base64")}` } }]
    : [{ type: "text", text: generated?.transcript || job.prompt }];
  const response = await fetch("https://api.openai.com/v1/moderations", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "omni-moderation-latest", input }), signal });
  if (!response.ok) throw new Error("Media moderation failed.");
  const result = await response.json(); const flagged = Boolean(result.results?.[0]?.flagged);
  return { allowed: !flagged, label: flagged ? "blocked" : "allowed", reason: flagged ? "The request was not approved by moderation." : undefined };
}

async function openAiImage(job, apiKey, references, signal) {
  if (!apiKey) throw new Error("An OpenAI API key is required for image generation.");
  const headers = { Authorization: `Bearer ${apiKey}` };
  let body;
  if (references.length) {
    body = new FormData(); body.append("model", job.model || "gpt-image-2"); body.append("prompt", job.prompt); body.append("size", "1024x1024");
    for (const reference of references) body.append("image[]", new Blob([Buffer.from(reference.data, "base64")], { type: reference.contentType }), reference.path || "reference.png");
  } else {
    body = JSON.stringify({ model: job.model || "gpt-image-2", prompt: job.prompt, size: "1024x1024", response_format: "b64_json" }); headers["Content-Type"] = "application/json";
  }
  const response = await fetch(references.length ? "https://api.openai.com/v1/images/edits" : "https://api.openai.com/v1/images/generations", { method: "POST", headers, body, signal });
  if (!response.ok) throw new Error("Image provider request failed.");
  const result = await response.json(); const encoded = result.data?.[0]?.b64_json;
  if (!encoded) throw new Error("Image provider returned no image.");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength < 16) throw new Error("Image provider returned an invalid image.");
  return { bytes, contentType: "image/png", filename: `generated-${job.id}.png`, usage: result.usage };
}

async function openAiSoundEffect(job, apiKey, signal) {
  if (!apiKey) throw new Error("An OpenAI API key is required for sound-effect generation.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: job.model || "gpt-audio-1.5", modalities: ["text", "audio"], audio: { format: "wav", voice: process.env.ATG_SFX_VOICE || "alloy" }, messages: [{ role: "user", content: `Generate a non-musical game sound effect of no more than two seconds: ${job.prompt}` }] }), signal });
  if (!response.ok) throw new Error("Sound-effect provider request failed.");
  const result = await response.json(); const encoded = result.choices?.[0]?.message?.audio?.data;
  if (!encoded) throw new Error("Sound-effect provider returned no audio.");
  return { bytes: Buffer.from(encoded, "base64"), contentType: "audio/wav", filename: `generated-${job.id}.wav`, transcript: result.choices?.[0]?.message?.audio?.transcript || "", usage: result.usage };
}

async function configuredSoundEffect(job, apiKey, signal) {
  const endpoint = process.env.ATG_SFX_PROVIDER_URL; const key = apiKey || process.env.ATG_SFX_PROVIDER_KEY;
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify({ model: job.model, prompt: job.prompt }), signal });
  if (!response.ok) throw new Error("Sound-effect provider request failed.");
  return { bytes: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "audio/wav", filename: `generated-${job.id}.wav` };
}
