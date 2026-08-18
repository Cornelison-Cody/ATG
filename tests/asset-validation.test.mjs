import assert from "node:assert/strict";
import test from "node:test";
import { validateAssetBytes } from "../lib/asset-validation.mjs";

test("asset validation rejects spoofed media and unsafe metadata references", () => {
  assert.throws(() => validateAssetBytes({ filename: "hero.png", content: Buffer.from("not png"), contentType: "image/png" }), /do not match/);
  assert.throws(() => validateAssetBytes({ filename: "atlas.json", content: Buffer.from(JSON.stringify({ frames: { hero: { frame: "https://evil.test/hero.png" } } }), "utf8"), contentType: "application/json" }), /within the project/);
});

test("asset validation recognizes supported image, font, audio, and video signatures", () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(validateAssetBytes({ filename: "hero.png", content: png, contentType: "image/png" }).kind, "image");
  assert.equal(validateAssetBytes({ filename: "font.woff", content: Buffer.from("wOFF"), contentType: "font/woff" }).kind, "font");
  assert.equal(validateAssetBytes({ filename: "clip.webm", content: Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), contentType: "video/webm" }).kind, "video");
});
