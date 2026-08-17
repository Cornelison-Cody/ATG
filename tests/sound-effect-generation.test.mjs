import test from "node:test";
import assert from "node:assert/strict";
import { acceptSoundEffect, buildAudioCuePatch, compressSoundEffect, createSoundEffectMediaJob, createSoundEffectRequest } from "../lib/sound-effect-generation.mjs";

test("sound effects cover gameplay cue categories and remain non-musical", () => {
  const request = createSoundEffectRequest({ cue: "countdown", prompt: "soft ticking", projectId: "p" });
  assert.equal(request.visualFeedback, "timer text and motion");
  assert.match(createSoundEffectMediaJob(request).prompt, /non-musical/);
  assert.throws(() => createSoundEffectRequest({ cue: "music", prompt: "song", projectId: "p" }), /Unsupported/);
});

test("accepted effects compress to a supported format and produce an audio-manager patch", () => {
  const request = createSoundEffectRequest({ cue: "scoring", prompt: "bright chime", projectId: "p" });
  const effect = acceptSoundEffect(request, { path: "assets/score.ogg", bytes: new Uint8Array([1, 2]), contentType: "audio/wav" });
  assert.equal(effect.contentType, "audio/ogg");
  assert.equal(effect.codec, "opus");
  assert.match(buildAudioCuePatch(effect).code, /scene\.audio\.load/);
  assert.match(buildAudioCuePatch(effect).instructions, /visual or text feedback/);
});

test("compression preserves already-compressed formats and rejects empty results", () => {
  assert.equal(compressSoundEffect({ bytes: new Uint8Array([1]), contentType: "audio/mp4" }).codec, "aac");
  assert.throws(() => compressSoundEffect({ bytes: new Uint8Array() }), /bytes are required/);
});
