import { DEFAULT_GAME_ENGINE_METADATA, normalizeGameEngineMetadata } from "./game-engine-metadata.mjs";

export const DEFAULT_GAME_CONFIG = Object.freeze({
  accentColor: "#4dd6c9",
  buzzLabel: "",
  engine: DEFAULT_GAME_ENGINE_METADATA,
  initialPrompt: "",
  promptLabel: "",
  resetLabel: "",
  title: "Buzzer Lobby"
});

export function parseGameConfig(raw, projectName) {
  const parsed = JSON.parse(raw);
  return normalizeGameConfig({ ...DEFAULT_GAME_CONFIG, title: projectName, ...parsed });
}

export function normalizeGameConfig(config) {
  return {
    accentColor: normalizeColor(config.accentColor, DEFAULT_GAME_CONFIG.accentColor),
    buzzLabel: normalizeText(config.buzzLabel, DEFAULT_GAME_CONFIG.buzzLabel, 40),
    engine: normalizeGameEngineMetadata(config.engine),
    initialPrompt: normalizeText(config.initialPrompt, DEFAULT_GAME_CONFIG.initialPrompt, 240),
    promptLabel: normalizeText(config.promptLabel, DEFAULT_GAME_CONFIG.promptLabel, 40),
    resetLabel: normalizeText(config.resetLabel, DEFAULT_GAME_CONFIG.resetLabel, 40),
    title: normalizeText(config.title, DEFAULT_GAME_CONFIG.title, 80)
  };
}

function normalizeColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function normalizeText(value, fallback, maxLength) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}
