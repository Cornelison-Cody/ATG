import { normalizeGameEngineMetadata } from "./game-engine-metadata.mjs";
import { ENGINE_PROTECTED_GAME_PATHS } from "./game-file-rules.mjs";

export function normalizeConvertedGameFiles(files = []) {
  return files.map((file) => {
    if (file?.path !== "config.json" || typeof file.content !== "string") return file;
    try {
      const config = JSON.parse(file.content);
      if (config.engine || config.type !== "pixi") return file;
      config.engine = {
        formatVersion: config.formatVersion,
        migrationStatus: config.migrationStatus,
        runtimeVersion: config.runtimeVersion,
        type: config.type
      };
      delete config.formatVersion;
      delete config.migrationStatus;
      delete config.runtimeVersion;
      delete config.type;
      return { ...file, content: `${JSON.stringify(config, null, 2)}\n` };
    } catch {
      return file;
    }
  });
}

export function validateConvertedGame({ files = [], assets = [], runtime = {}, diagnostics = {}, performance = {} } = {}) {
  const blockingErrors = [];
  const warnings = [];
  const checks = [];
  const fileMap = new Map(files.filter((file) => file?.path && typeof file.content === "string").map((file) => [file.path, file.content]));
  const assetPaths = new Set(assets.map((asset) => asset?.path).filter(Boolean));

  let config = null;
  try {
    config = JSON.parse(fileMap.get("config.json") || "");
    config.engine = normalizeGameEngineMetadata(config.engine);
    if (config.engine.type !== "pixi") throw new Error("Converted games must use the Pixi engine runtime.");
    check(checks, "engine-metadata", true, "Pinned engine metadata is valid.");
  } catch (error) {
    addBlocking(blockingErrors, "engine-metadata", error instanceof Error ? error.message : "Engine metadata is invalid.");
    check(checks, "engine-metadata", false, "Converted games require valid Pixi engine metadata.");
  }

  const missingFiles = ENGINE_PROTECTED_GAME_PATHS.filter((filePath) => !fileMap.has(filePath));
  if (missingFiles.length) addBlocking(blockingErrors, "required-files", `Missing required engine files: ${missingFiles.join(", ")}.`);
  check(checks, "required-files", missingFiles.length === 0, missingFiles.length ? "Required engine files are missing." : "Required engine files are present.");

  const referencedAssets = [...fileMap.values()].flatMap((content) => [...content.matchAll(/(?:src|url|assetPath)=["']?([^"'\s)]+)|assets\/([A-Za-z0-9._/-]+)/g)].map((match) => match[1] || match[2]));
  const missingAssets = referencedAssets.filter((assetPath) => assetPath.startsWith("assets/") && !assetPaths.has(assetPath));
  if (missingAssets.length) addBlocking(blockingErrors, "assets", `Missing referenced assets: ${[...new Set(missingAssets)].join(", ")}.`);
  check(checks, "assets", missingAssets.length === 0, missingAssets.length ? "Referenced assets are missing." : "Referenced assets are available.");

  const gameScript = fileMap.get("game.js") || "";
  const tv = `${fileMap.get("tv.html") || ""}\n${gameScript}`;
  const phoneHtml = fileMap.get("phone.html") || "";
  const phone = /<script[^>]+src=["'][^"']*game\.js(?:[?#][^"']*)?["']/i.test(phoneHtml)
    ? `${phoneHtml}\n${gameScript}`
    : phoneHtml;
  if (!/ATGEngine|window\.ATGEngine/.test(tv)) addBlocking(blockingErrors, "tv-runtime", "TV rendering does not use the ATG engine runtime.");
  if (!/window\.ATG(?:\.|\[)/.test(phone)) addBlocking(blockingErrors, "phone-bridge", "Phone controls do not use the ATG DOM bridge.");
  if (!/sendAction|onState|setState/.test(`${tv}\n${phone}`)) addBlocking(blockingErrors, "state-bridge", "Converted game does not demonstrate ATG state or action bridge usage.");
  check(checks, "bridge", !blockingErrors.some((finding) => ["tv-runtime", "phone-bridge", "state-bridge"].includes(finding.code)), "TV, phone, and state bridge contracts are present.");

  if (!(fileMap.get("instructions.md") || "").trim()) addWarning(warnings, "instructions", "Player-facing instructions are empty or missing.");
  if (runtime.loaded === false || runtime.error) addBlocking(blockingErrors, "runtime", runtime.error || "The engine runtime failed to load.");
  if (diagnostics.engineErrors || diagnostics.assetFailures) addBlocking(blockingErrors, "diagnostics", "Editor diagnostics reported engine or asset failures.");
  if (diagnostics.audioFailures) addWarning(warnings, "audio", "Audio compatibility issues were reported by editor diagnostics.");
  if (Number.isFinite(performance.fps) && performance.fps < 30) addWarning(warnings, "performance", `Performance smoke test measured ${performance.fps} FPS; target is 30 FPS.`);
  if (performance.renderer === "software") addWarning(warnings, "renderer", "Software rendering was detected; verify the target device experience.");

  return { ok: blockingErrors.length === 0, blockingErrors, warnings, checks };
}

function check(checks, code, passed, message) { checks.push({ code, passed, message }); }
function addBlocking(findings, code, message) { findings.push({ code, message, severity: "blocking" }); }
function addWarning(findings, code, message) { findings.push({ code, message, severity: "warning" }); }
