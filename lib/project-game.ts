import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { DEFAULT_GAME_CONFIG, GameConfig } from "./game-types";
import type { ProjectRecord } from "./projects";

export const GAME_DIR = "game";
export const GAME_CONFIG_FILE = "config.json";

const TEMPLATE_FILES: Record<string, (project: ProjectRecord) => string> = {
  "config.json": (project) =>
    `${JSON.stringify({ ...DEFAULT_GAME_CONFIG, title: project.name }, null, 2)}\n`,
  "styles.css": () => `:root {
  color-scheme: dark;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

body {
  background: transparent;
  color: #eef5ff;
  margin: 0;
}

.phone-ui {
  height: 100%;
  overflow: auto;
}

.panel {
  background: rgba(7, 9, 13, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  display: grid;
  gap: 18px;
  min-height: 100vh;
  padding: 22px;
}

.phone-panel {
  align-content: start;
  min-height: 100%;
}

h1,
h2,
p {
  margin: 0;
}

.muted {
  color: #a8b6cb;
}

.button {
  background: var(--game-accent, #4dd6c9);
  border: 0;
  border-radius: 999px;
  color: #04110f;
  cursor: pointer;
  font-size: 1.35rem;
  font-weight: 900;
  min-height: 96px;
  padding: 18px;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.list {
  display: grid;
  gap: 10px;
}

.pill {
  background: rgba(77, 214, 201, 0.12);
  border: 1px solid rgba(77, 214, 201, 0.3);
  border-radius: 999px;
  padding: 10px 12px;
}
`,
  "game.js": () => `function applyAccent(config) {
  document.documentElement.style.setProperty("--game-accent", config.accentColor || "#4dd6c9");
}

function byId(id) {
  return document.getElementById(id);
}

window.ATG.onState((state) => {
  applyAccent(state.config || {});

  const title = byId("game-title");
  if (title) {
    title.textContent = state.config?.title || state.project?.name || "Game";
  }

  const prompt = byId("prompt");
  if (prompt) {
    prompt.textContent = state.prompt || state.config?.initialPrompt || "Waiting for prompt...";
  }

  const players = byId("players");
  if (players) {
    players.innerHTML = "";
    for (const player of state.players || []) {
      const item = document.createElement("div");
      item.className = "pill";
      item.textContent = player.connected ? player.name : player.name + " (away)";
      players.append(item);
    }
  }

  const buzzes = byId("buzzes");
  if (buzzes) {
    buzzes.innerHTML = "";
    for (const [index, buzz] of (state.buzzes || []).entries()) {
      const item = document.createElement("div");
      item.className = "pill";
      item.textContent = String(index + 1) + ". " + buzz.name;
      buzzes.append(item);
    }
  }

  const buzzButton = byId("buzz-button");
  if (buzzButton) {
    const currentPlayerId = state.player?.id;
    const hasBuzzed = (state.buzzes || []).some((buzz) => buzz.playerId === currentPlayerId);
    buzzButton.textContent = hasBuzzed ? "Buzzed" : state.config?.buzzLabel || "Buzz";
    buzzButton.disabled = hasBuzzed || state.connectionState !== "Live";
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.id === "buzz-button") {
    window.ATG.sendAction("buzz");
  }
});
`,
  "phone.html": () => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="./styles.css" />
    <script src="./game.js" defer></script>
  </head>
  <body class="phone-ui">
    <main class="panel phone-panel">
      <h1 id="game-title">Game</h1>
      <p id="prompt" class="muted">Waiting for prompt...</p>
      <button id="buzz-button" class="button" type="button">Buzz</button>
    </main>
  </body>
</html>
`,
  "tv.html": () => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="./styles.css" />
    <script src="./game.js" defer></script>
  </head>
  <body>
    <main class="panel">
      <h1 id="game-title">Game</h1>
      <section>
        <h2>Prompt</h2>
        <p id="prompt" class="muted">Waiting for prompt...</p>
      </section>
      <section>
        <h2>Players</h2>
        <div id="players" class="list"></div>
      </section>
      <section>
        <h2>Buzz Order</h2>
        <div id="buzzes" class="list"></div>
      </section>
    </main>
  </body>
</html>
`
};

export async function ensureProjectGameFiles(project: ProjectRecord) {
  const gamePath = getGamePath(project);
  await mkdir(gamePath, { recursive: true });

  for (const [fileName, render] of Object.entries(TEMPLATE_FILES)) {
    const filePath = path.join(gamePath, fileName);
    if (!(await exists(filePath))) {
      await writeFile(filePath, render(project), "utf8");
    }
  }
}

export async function readGameConfig(project: ProjectRecord): Promise<GameConfig> {
  await ensureProjectGameFiles(project);

  try {
    const raw = await readFile(path.join(getGamePath(project), GAME_CONFIG_FILE), "utf8");
    const parsed = JSON.parse(raw) as Partial<GameConfig>;
    return normalizeGameConfig({ ...DEFAULT_GAME_CONFIG, title: project.name, ...parsed });
  } catch {
    return { ...DEFAULT_GAME_CONFIG, title: project.name };
  }
}

export async function updateGameConfig(project: ProjectRecord, patch: unknown) {
  const current = await readGameConfig(project);
  const nextPatch = typeof patch === "object" && patch !== null ? (patch as Partial<GameConfig>) : {};
  const next = normalizeGameConfig({ ...current, ...nextPatch });
  await writeFile(path.join(getGamePath(project), GAME_CONFIG_FILE), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function resolveGameAsset(project: ProjectRecord, segments: string[]) {
  await ensureProjectGameFiles(project);
  const cleanSegments = segments.filter(Boolean);
  if (cleanSegments.length === 0) {
    throw new Error("Game asset path is required.");
  }

  const gamePath = getGamePath(project);
  const assetPath = path.resolve(gamePath, ...cleanSegments);
  const relative = path.relative(gamePath, assetPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Game asset path is outside the project game folder.");
  }

  return assetPath;
}

function getGamePath(project: ProjectRecord) {
  return path.join(project.path, GAME_DIR);
}

function normalizeGameConfig(config: Partial<GameConfig>): GameConfig {
  return {
    accentColor: normalizeColor(config.accentColor, DEFAULT_GAME_CONFIG.accentColor),
    buzzLabel: normalizeText(config.buzzLabel, DEFAULT_GAME_CONFIG.buzzLabel, 40),
    initialPrompt: normalizeText(config.initialPrompt, DEFAULT_GAME_CONFIG.initialPrompt, 240),
    promptLabel: normalizeText(config.promptLabel, DEFAULT_GAME_CONFIG.promptLabel, 40),
    resetLabel: normalizeText(config.resetLabel, DEFAULT_GAME_CONFIG.resetLabel, 40),
    title: normalizeText(config.title, DEFAULT_GAME_CONFIG.title, 80)
  };
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
