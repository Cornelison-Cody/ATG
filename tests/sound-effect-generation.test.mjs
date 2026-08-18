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
  const wav = new Uint8Array(12);
  wav.set(new TextEncoder().encode("RIFF"), 0);
  wav.set(new TextEncoder().encode("WAVE"), 8);
  const effect = acceptSoundEffect(request, { path: "assets/score.wav", bytes: wav, contentType: "audio/wav" });
  assert.equal(effect.contentType, "audio/wav");
  assert.equal(effect.codec, "pcm");
  assert.match(buildAudioCuePatch(effect).code, /scene\.audio\.load/);
  assert.match(buildAudioCuePatch(effect).instructions, /visual or text feedback/);
});

test("compression preserves already-compressed formats and rejects empty results", () => {
  const mp4 = new Uint8Array(8);
  mp4.set(new TextEncoder().encode("ftyp"), 4);
  assert.equal(compressSoundEffect({ bytes: mp4, contentType: "audio/mp4" }).codec, "aac");
  assert.throws(() => compressSoundEffect({ bytes: new Uint8Array([1]), contentType: "audio/mp4" }), /container/);
  assert.throws(() => compressSoundEffect({ bytes: new Uint8Array() }), /bytes are required/);
});
