import test from "node:test";
import assert from "node:assert/strict";
import { acceptVisualAsset, buildVisualPrompt, createAnimationSheetMetadata, createVisualAssetLibrary, createVisualMediaJob, createVisualRequest } from "../lib/visual-generation.mjs";

test("visual requests cover images, characters, objects, variations, and sheets", () => {
  for (const kind of ["image", "character", "object", "sprite-variation", "animation-sheet"]) {
    const request = createVisualRequest({ kind, prompt: "friendly sea captain", projectId: "p" });
    assert.equal(request.kind, kind);
    assert.match(buildVisualPrompt(request), /ATG 2D game/);
    assert.equal(createVisualMediaJob(request).provider, "openai-image");
  }
});

test("reference art requires consent and animation sheets produce usable metadata", () => {
  assert.throws(() => createVisualRequest({ kind: "character", prompt: "captain", projectId: "p", referenceAssetPaths: ["assets/ref.png"] }), /consent/);
  const metadata = createAnimationSheetMetadata({ frameCount: 5, frameWidth: 64, frameHeight: 64, columns: 3 });
  assert.equal(metadata.frames.length, 5);
  assert.equal(metadata.meta.rows, 2);
  assert.equal(metadata.frames[4].frame.x, 64);
});

test("visuals can be previewed, accepted, discarded, and reused by fingerprint", () => {
  const request = createVisualRequest({ kind: "object", prompt: "a buoy", projectId: "p" });
  const library = createVisualAssetLibrary();
  const first = library.accept(request, { path: "assets/buoy.png" });
  const second = library.accept(createVisualRequest({ kind: "object", prompt: "a buoy", projectId: "p" }), { path: "assets/other.png" });
  assert.equal(first.reused, false);
  assert.equal(second.reused, true);
  assert.equal(second.asset.path, "assets/buoy.png");
  assert.deepEqual(library.discard(request), { requestId: request.requestId, discarded: true });
  assert.throws(() => acceptVisualAsset({ ...request, status: "accepted" }, { path: "assets/no.png" }), /preview/);
});
