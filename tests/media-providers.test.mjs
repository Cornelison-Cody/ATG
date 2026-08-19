import assert from "node:assert/strict";
import test from "node:test";
import { generateMediaWithProvider, moderateMediaWithProvider } from "../lib/media-providers.mjs";

test("image provider adapter decodes provider bytes and moderation blocks flagged prompts", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (url, options = {}) => {
    if (url.includes("moderations")) return new Response(JSON.stringify({ results: [{ flagged: true }] }), { status: 200 });
    requestBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("png").toString("base64") }] }), { status: 200 });
  };
  try {
    const job = { id: "job", kind: "image", provider: "openai-image", model: "gpt-image-1", prompt: "a safe image" };
    const generated = await generateMediaWithProvider({ job, apiKey: "test-key", references: [{ path: "assets/reference.png", contentType: "image/png", data: "cmVm" }] });
    assert.equal(generated.contentType, "image/png");
    assert.equal(generated.bytes.toString(), "png");
    assert.deepEqual(requestBody.reference_images, [{ data: "cmVm", content_type: "image/png" }]);
    assert.equal((await moderateMediaWithProvider({ job, generated, apiKey: "test-key" })).allowed, false);
  } finally { globalThis.fetch = originalFetch; }
});

test("sound provider is configurable and unsupported media stays unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalEndpoint = process.env.ATG_SFX_PROVIDER_URL;
  process.env.ATG_SFX_PROVIDER_URL = "https://sfx.test";
  let authorization = "";
  globalThis.fetch = async (_url, options) => { authorization = options.headers.Authorization; return new Response(new Uint8Array([1, 2]), { status: 200, headers: { "content-type": "audio/wav" } }); };
  try {
    const result = await generateMediaWithProvider({ job: { id: "job", kind: "sound-effect", provider: "openai-sfx", model: "sfx", prompt: "buzzer" }, apiKey: "byok-key" });
    assert.equal(result.contentType, "audio/wav");
    assert.equal(authorization, "Bearer byok-key");
    await assert.rejects(() => generateMediaWithProvider({ job: { kind: "video", provider: "openai-video" } }), /Unsupported/);
  } finally { globalThis.fetch = originalFetch; if (originalEndpoint === undefined) delete process.env.ATG_SFX_PROVIDER_URL; else process.env.ATG_SFX_PROVIDER_URL = originalEndpoint; }
});
