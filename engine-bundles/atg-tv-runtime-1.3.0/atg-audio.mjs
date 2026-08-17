const PREFERENCES_KEY = "atg-engine-audio-preferences-v1";

export function createAtgAudioManager({ sound, surface }) {
  if (!sound || !surface) throw new TypeError("ATG audio requires Pixi sound and an engine surface.");

  const preferences = readPreferences();
  const scopes = new Set();
  const diagnosticsEnabled = new URL(globalThis.location?.href || "http://localhost").searchParams.has("atgEditorPreview");
  let unlocked = false;
  let destroyed = false;
  const controls = createControls();
  surface.append(controls.root);
  applyPreferences();

  function load(id, url, options = {}) {
    assertActive();
    if (!id || !url) throw new TypeError("ATG audio load requires an id and URL.");
    try {
      if (sound.exists(id)) sound.remove(id);
      sound.add(id, { loop: Boolean(options.loop), preload: true, singleInstance: Boolean(options.singleInstance), url, volume: clamp(options.volume ?? 1) });
      return id;
    } catch (error) {
      report("Unable to load sound.", error);
      return null;
    }
  }

  async function unlock() {
    assertActive();
    try {
      const context = sound.context?.audioContext;
      if (context?.state === "suspended") await context.resume();
      unlocked = !context || context.state === "running";
      controls.status.textContent = unlocked ? "Sound enabled" : "Sound needs a browser gesture";
      return unlocked;
    } catch (error) {
      report("Sound could not be enabled.", error);
      return false;
    }
  }

  async function play(id, options = {}) {
    assertActive();
    if (!sound.exists(id)) return report("Sound is unavailable.");
    if (!unlocked && !(await unlock())) return null;
    try {
      return await sound.play(id, { loop: options.loop, volume: clamp(options.volume ?? 1) });
    } catch (error) {
      return report("Sound could not play.", error);
    }
  }

  function stop(id) {
    if (sound.exists(id)) sound.stop(id);
  }

  function release(id) {
    if (sound.exists(id)) sound.remove(id);
  }

  function fade(id, to, duration = 200) {
    if (!sound.exists(id)) return () => {};
    const source = sound.find(id);
    const from = source.volume;
    const started = performance.now();
    let frame = 0;
    const update = (now) => {
      const progress = Math.min(1, (now - started) / Math.max(1, duration));
      source.volume = from + (clamp(to) - from) * progress;
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }

  function createSceneScope() {
    const owned = new Set();
    const cancellations = new Set();
    let disposed = false;
    const scope = {
      load(id, url, options) { const loaded = load(id, url, options); if (loaded) owned.add(loaded); return loaded; },
      play,
      stop,
      fade(id, to, duration) { const cancel = fade(id, to, duration); cancellations.add(cancel); return () => { cancel(); cancellations.delete(cancel); }; },
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const cancel of cancellations) cancel();
        for (const id of owned) { stop(id); release(id); }
        cancellations.clear();
        owned.clear();
        scopes.delete(scope);
      }
    };
    scopes.add(scope);
    return scope;
  }

  function setMuted(muted) {
    preferences.muted = Boolean(muted);
    persistPreferences(preferences);
    applyPreferences();
  }

  function setVolume(volume) {
    preferences.volume = clamp(volume);
    persistPreferences(preferences);
    applyPreferences();
  }

  function applyPreferences() {
    sound.volumeAll = preferences.volume;
    sound.context.muted = preferences.muted;
    controls.mute.textContent = preferences.muted ? "Unmute" : "Mute";
    controls.mute.setAttribute("aria-pressed", String(preferences.muted));
    controls.volume.value = String(preferences.volume);
  }

  function createControls() {
    const root = document.createElement("div");
    const mute = document.createElement("button");
    const volume = document.createElement("input");
    const status = document.createElement("span");
    root.setAttribute("aria-label", "Sound controls");
    Object.assign(root.style, { alignItems: "center", background: "rgba(7, 17, 31, 0.82)", bottom: "16px", display: "flex", gap: "8px", padding: "8px", position: "absolute", right: "16px", zIndex: "1" });
    mute.type = "button";
    volume.setAttribute("aria-label", "Sound volume");
    volume.max = "1";
    volume.min = "0";
    volume.step = "0.05";
    volume.type = "range";
    status.setAttribute("aria-live", "polite");
    status.style.cssText = "color: #eef5ff; font: 12px system-ui, sans-serif;";
    mute.addEventListener("click", async () => { await unlock(); setMuted(!preferences.muted); });
    volume.addEventListener("input", async () => { await unlock(); setVolume(Number(volume.value)); });
    root.append(mute, volume, status);
    return { mute, root, status, volume };
  }

  function report(message, error) {
    controls.status.textContent = message;
    if (diagnosticsEnabled) window.dispatchEvent(new CustomEvent("atg-audio-error", { detail: { error: error instanceof Error ? error.message : "", message } }));
    return null;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    for (const scope of [...scopes]) scope.dispose();
    sound.stopAll();
    sound.removeAll();
    controls.root.remove();
  }

  function assertActive() {
    if (destroyed) throw new Error("ATG audio has been destroyed.");
  }

  return { createSceneScope, destroy, fade, load, play, release, setMuted, setVolume, stop, unlock };
}

function clamp(value) { return Math.min(1, Math.max(0, Number(value) || 0)); }

function readPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "{}");
    return { muted: Boolean(stored.muted), volume: clamp(stored.volume ?? 1) };
  } catch {
    return { muted: false, volume: 1 };
  }
}

function persistPreferences(preferences) {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* Preference storage is optional. */ }
}
