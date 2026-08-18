import { createMediaJob } from "./media-generation.mjs";

const CUES = new Set(["action", "transition", "scoring", "error", "countdown", "celebration"]);

export function createSoundEffectRequest({ cue, prompt, projectId, model } = {}) {
  if (!CUES.has(cue)) throw new Error("Unsupported sound-effect cue.");
  const request = createMediaJob({ kind: "sound-effect", provider: "openai-sfx", model, projectId, prompt });
  return { ...request, cue, status: "preview", visualFeedback: visualFeedbackFor(cue) };
}

export function createSoundEffectMediaJob(request) {
  return { ...request, prompt: `Create a short, clean, non-musical ${request.cue} sound effect. ${request.prompt}. Keep it suitable for a family-friendly game and under two seconds.` };
}

export function compressSoundEffect({ bytes, contentType = "audio/wav", sampleRate = 44100 } = {}) {
  if (!bytes || !bytes.byteLength) throw new Error("Sound effect bytes are required.");
  const signature = Buffer.from(bytes).subarray(0, 32);
  if (signature.subarray(0, 4).toString() === "RIFF" && signature.subarray(8, 12).toString() === "WAVE") return { bytes, contentType: "audio/wav", sampleRate, codec: "pcm", loop: false };
  if (signature.subarray(0, 4).toString() === "OggS") return { bytes, contentType: "audio/ogg", sampleRate, codec: signature.includes(Buffer.from("OpusHead")) ? "opus" : "vorbis", loop: false };
  if (signature.subarray(4, 8).toString() === "ftyp") return { bytes, contentType: "audio/mp4", sampleRate, codec: "aac", loop: false };
  if (contentType === "audio/mpeg" && signature[0] === 0xff) return { bytes, contentType, sampleRate, codec: "mp3", loop: false };
  throw new Error("Sound effect bytes do not match a supported audio container.");
}

export function acceptSoundEffect(request, { path, bytes, contentType, sampleRate } = {}) {
  if (request.status !== "preview" || !path) throw new Error("Only preview sound effects can be accepted.");
  const compressed = compressSoundEffect({ bytes, contentType, sampleRate });
  return Object.freeze({ path, cue: request.cue, ...compressed, provenance: { provider: request.provider, model: request.model, prompt: request.prompt, visualFeedback: request.visualFeedback } });
}

export function buildAudioCuePatch(effect) {
  if (!effect?.path || !effect.cue) throw new Error("An accepted sound effect is required.");
  return {
    code: `const ${effect.cue}Sound = scene.audio.load("${effect.cue}", "${effect.path}");\nscene.audio.play(${effect.cue}Sound);`,
    instructions: `The ${effect.cue} cue now plays ${effect.path}. Keep equivalent visual or text feedback so gameplay never relies on sound alone.`
  };
}

export function visualFeedbackFor(cue) {
  return { action: "button confirmation and state update", transition: "scene transition and status text", scoring: "score animation and announcement", error: "visible error message", countdown: "timer text and motion", celebration: "celebration animation and announcement" }[cue];
}
