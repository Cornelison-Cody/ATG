import assert from "node:assert/strict";
import test from "node:test";
import { validateAssetBytes } from "../lib/asset-validation.mjs";

test("asset validation rejects spoofed media and unsafe metadata references", () => {
  assert.throws(() => validateAssetBytes({ filename: "hero.png", content: Buffer.from("not png"), contentType: "image/png" }), /do not match/);
  assert.throws(() => validateAssetBytes({ filename: "atlas.json", content: Buffer.from(JSON.stringify({ frames: { hero: { frame: "https://evil.test/hero.png" } } }), "utf8"), contentType: "application/json" }), /within the project/);
  assert.throws(() => validateAssetBytes({ filename: "hero.png", content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), contentType: "image/png" }), /truncated/);
  assert.throws(() => validateAssetBytes({ filename: "font.woff", content: Buffer.from("wOFF"), contentType: "font/woff" }), /truncated/);
});

test("asset validation recognizes supported image, font, audio, and video signatures", () => {
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]), Buffer.from("IHDR"), Buffer.from([0, 0, 0, 2, 0, 0, 0, 3, 8, 6, 0, 0, 0, 0, 0, 0, 0]), Buffer.from([0, 0, 0, 0]), Buffer.from("IEND"), Buffer.alloc(4)]);
  const image = validateAssetBytes({ filename: "hero.png", content: png, contentType: "image/png" });
  assert.equal(image.kind, "image");
  assert.deepEqual({ width: image.width, height: image.height }, { width: 2, height: 3 });
  assert.equal(validateAssetBytes({ filename: "font.woff", content: Buffer.from("wOFF00000000"), contentType: "font/woff" }).kind, "font");
  assert.equal(validateAssetBytes({ filename: "clip.webm", content: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0]), contentType: "video/webm" }).kind, "video");
});
