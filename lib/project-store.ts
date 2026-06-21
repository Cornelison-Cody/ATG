import { CosmosClient, type Container } from "@azure/cosmos";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { randomUUID } from "crypto";
import { mkdir, readFile, rename, stat, writeFile } from "fs/promises";
import path from "path";
import { ATG_ROOT, PROJECTS_ROOT, TRASH_ROOT, useAzureStorageBackend } from "./env";
import { DEFAULT_GAME_CONFIG, GameConfig } from "./game-types";
import type { ChatMessage, ProjectDatabase, ProjectRecord, PublicProject } from "./project-types";

export const GAME_DIR = "game";
export const GAME_CONFIG_FILE = "config.json";
export const GAME_INSTRUCTIONS_FILE = "instructions.md";

const DB_PATH = path.join(ATG_ROOT, "projects.json");
const PROJECTS_CONTAINER = process.env.AZURE_COSMOS_PROJECTS_CONTAINER || "projects";

type GameAsset = {
  content: Buffer;
  contentType: string;
};

interface ProjectStore {
  listProjects(): Promise<PublicProject[]>;
  getProject(projectId: string): Promise<ProjectRecord | null>;
  createProject(name: string): Promise<ProjectRecord>;
  softDeleteProject(projectId: string): Promise<ProjectRecord>;
  appendProjectMessages(projectId: string, messages: ChatMessage[]): Promise<ProjectRecord>;
  updateProjectThread(projectId: string, codexThreadId: string): Promise<ProjectRecord>;
  readGameConfig(project: ProjectRecord): Promise<GameConfig>;
  updateGameConfig(project: ProjectRecord, patch: unknown): Promise<GameConfig>;
  readGameInstructions(project: ProjectRecord): Promise<string>;
  updateGameInstructions(project: ProjectRecord, instructions: string): Promise<string>;
  readGameAsset(project: ProjectRecord, segments: string[]): Promise<GameAsset>;
}

export function getProjectStore(): ProjectStore {
  return useAzureStorageBackend() ? new AzureProjectStore() : new LocalProjectStore();
}

export function toPublicProject(project: ProjectRecord): PublicProject {
  const { messages, ...rest } = project;
  return {
    ...rest,
    messageCount: messages.length
  };
}

export class ProjectStoreError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

class LocalProjectStore implements ProjectStore {
  async listProjects() {
    const db = await this.readDatabase();
    return db.projects.filter((project) => project.status === "active").map(toPublicProject);
  }

  async getProject(projectId: string) {
    const db = await this.readDatabase();
    return db.projects.find((project) => project.id === projectId) ?? null;
  }

  async createProject(name: string) {
    const db = await this.readDatabase();
    const project = buildNewProject(name, uniqueSlug(slugifyRequired(name), db.projects), (slug) =>
      path.join(PROJECTS_ROOT, slug)
    );

    await mkdir(project.path, { recursive: true });
    await writeFile(path.join(project.path, "README.md"), renderReadme(project), "utf8");
    await this.ensureGameFiles(project);

    db.projects.push(project);
    await this.writeDatabase(db);
    return project;
  }

  async softDeleteProject(projectId: string) {
    const db = await this.readDatabase();
    const project = db.projects.find((item) => item.id === projectId);
    if (!project || project.status === "deleted") {
      throw new ProjectStoreError("Project was not found.", 404);
    }

    const now = new Date().toISOString();
    const trashPath = path.join(TRASH_ROOT, `${project.slug}-${compactTimestamp(now)}`);
    await mkdir(TRASH_ROOT, { recursive: true });

    try {
      await rename(project.path, trashPath);
      project.path = trashPath;
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
    }

    project.status = "deleted";
    project.deletedAt = now;
    project.updatedAt = now;
    await this.writeDatabase(db);
    return project;
  }

  async appendProjectMessages(projectId: string, messages: ChatMessage[]) {
    return this.updateProject(projectId, (project) => {
      project.messages.push(...messages);
      project.updatedAt = new Date().toISOString();
    });
  }

  async updateProjectThread(projectId: string, codexThreadId: string) {
    return this.updateProject(projectId, (project) => {
      project.codexThreadId = codexThreadId;
      project.updatedAt = new Date().toISOString();
    });
  }

  async readGameConfig(project: ProjectRecord) {
    await this.ensureGameFiles(project);

    try {
      const raw = await readFile(path.join(getGamePath(project), GAME_CONFIG_FILE), "utf8");
      return parseGameConfig(raw, project.name);
    } catch {
      return { ...DEFAULT_GAME_CONFIG, title: project.name };
    }
  }

  async updateGameConfig(project: ProjectRecord, patch: unknown) {
    const current = await this.readGameConfig(project);
    const next = normalizeGameConfig({ ...current, ...asConfigPatch(patch) });
    await writeFile(
      path.join(getGamePath(project), GAME_CONFIG_FILE),
      `${JSON.stringify(next, null, 2)}\n`,
      "utf8"
    );
    return next;
  }

  async readGameInstructions(project: ProjectRecord) {
    await this.ensureGameFiles(project);
    return readFile(path.join(getGamePath(project), GAME_INSTRUCTIONS_FILE), "utf8");
  }

  async updateGameInstructions(project: ProjectRecord, instructions: string) {
    const next = normalizeGameInstructions(instructions);
    await this.ensureGameFiles(project);
    await writeFile(path.join(getGamePath(project), GAME_INSTRUCTIONS_FILE), next, "utf8");
    return next;
  }

  async readGameAsset(project: ProjectRecord, segments: string[]) {
    await this.ensureGameFiles(project);
    const assetPath = resolveLocalGameAsset(project, segments);
    const content = await readFile(assetPath);
    return {
      content,
      contentType: contentTypeForPath(assetPath)
    };
  }

  private async ensureGameFiles(project: ProjectRecord) {
    const gamePath = getGamePath(project);
    await mkdir(gamePath, { recursive: true });

    for (const [fileName, render] of Object.entries(TEMPLATE_FILES)) {
      const filePath = path.join(gamePath, fileName);
      if (!(await exists(filePath))) {
        await writeFile(filePath, render(project), "utf8");
      }
    }
  }

  private async updateProject(projectId: string, mutate: (project: ProjectRecord) => void) {
    const db = await this.readDatabase();
    const project = db.projects.find((item) => item.id === projectId);
    if (!project || project.status === "deleted") {
      throw new ProjectStoreError("Project was not found.", 404);
    }

    mutate(project);
    await this.writeDatabase(db);
    return project;
  }

  private async readDatabase(): Promise<ProjectDatabase> {
    await mkdir(ATG_ROOT, { recursive: true });
    await mkdir(PROJECTS_ROOT, { recursive: true });

    try {
      const raw = await readFile(DB_PATH, "utf8");
      return JSON.parse(raw) as ProjectDatabase;
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }

      return { projects: [] };
    }
  }

  private async writeDatabase(db: ProjectDatabase) {
    await mkdir(ATG_ROOT, { recursive: true });
    await writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  }
}

class AzureProjectStore implements ProjectStore {
  private cosmos?: Container;
  private blobs?: ContainerClient;

  async listProjects() {
    const container = this.getCosmosContainer();
    const { resources } = await container.items
      .query<ProjectRecord>({
        query: "SELECT * FROM c WHERE c.status = @status ORDER BY c.updatedAt DESC",
        parameters: [{ name: "@status", value: "active" }]
      })
      .fetchAll();

    return resources.map(toPublicProject);
  }

  async getProject(projectId: string) {
    try {
      const { resource } = await this.getCosmosContainer().item(projectId, projectId).read<ProjectRecord>();
      return resource ?? null;
    } catch (error) {
      if (isCosmosNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async createProject(name: string) {
    const trimmedName = name.trim();
    const slug = uniqueSlug(slugifyRequired(trimmedName), await this.listAllProjects());
    const project = buildNewProject(trimmedName, slug, () => `azure://projects/${slug}`);

    await this.writeBlob(blobName(project, "README.md"), renderReadme(project), "text/markdown; charset=utf-8");
    await this.ensureGameFiles(project);
    await this.getCosmosContainer().items.create(project);
    return project;
  }

  async softDeleteProject(projectId: string) {
    const project = await this.getRequiredActiveProject(projectId);
    project.status = "deleted";
    project.deletedAt = new Date().toISOString();
    project.updatedAt = project.deletedAt;
    await this.getCosmosContainer().item(project.id, project.id).replace(project);
    return project;
  }

  async appendProjectMessages(projectId: string, messages: ChatMessage[]) {
    return this.updateProject(projectId, (project) => {
      project.messages.push(...messages);
      project.updatedAt = new Date().toISOString();
    });
  }

  async updateProjectThread(projectId: string, codexThreadId: string) {
    return this.updateProject(projectId, (project) => {
      project.codexThreadId = codexThreadId;
      project.updatedAt = new Date().toISOString();
    });
  }

  async readGameConfig(project: ProjectRecord) {
    await this.ensureGameFiles(project);

    try {
      const raw = await this.readTextBlob(blobName(project, `${GAME_DIR}/${GAME_CONFIG_FILE}`));
      return parseGameConfig(raw, project.name);
    } catch {
      return { ...DEFAULT_GAME_CONFIG, title: project.name };
    }
  }

  async updateGameConfig(project: ProjectRecord, patch: unknown) {
    const current = await this.readGameConfig(project);
    const next = normalizeGameConfig({ ...current, ...asConfigPatch(patch) });
    await this.writeBlob(
      blobName(project, `${GAME_DIR}/${GAME_CONFIG_FILE}`),
      `${JSON.stringify(next, null, 2)}\n`,
      "application/json; charset=utf-8"
    );
    return next;
  }

  async readGameInstructions(project: ProjectRecord) {
    await this.ensureGameFiles(project);
    return this.readTextBlob(blobName(project, `${GAME_DIR}/${GAME_INSTRUCTIONS_FILE}`));
  }

  async updateGameInstructions(project: ProjectRecord, instructions: string) {
    const next = normalizeGameInstructions(instructions);
    await this.ensureGameFiles(project);
    await this.writeBlob(
      blobName(project, `${GAME_DIR}/${GAME_INSTRUCTIONS_FILE}`),
      next,
      "text/markdown; charset=utf-8"
    );
    return next;
  }

  async readGameAsset(project: ProjectRecord, segments: string[]) {
    const assetPath = normalizeGameAssetPath(segments);
    await this.ensureGameFiles(project);
    const blob = this.getBlobContainer().getBlockBlobClient(blobName(project, `${GAME_DIR}/${assetPath}`));

    if (!(await blob.exists())) {
      throw new ProjectStoreError("Game asset was not found.", 404);
    }

    const content = await blob.downloadToBuffer();
    return {
      content,
      contentType: contentTypeForPath(assetPath)
    };
  }

  private async ensureGameFiles(project: ProjectRecord) {
    for (const [fileName, render] of Object.entries(TEMPLATE_FILES)) {
      const name = blobName(project, `${GAME_DIR}/${fileName}`);
      const blob = this.getBlobContainer().getBlockBlobClient(name);
      if (!(await blob.exists())) {
        await this.writeBlob(name, render(project), contentTypeForPath(fileName));
      }
    }
  }

  private async updateProject(projectId: string, mutate: (project: ProjectRecord) => void) {
    const project = await this.getRequiredActiveProject(projectId);
    mutate(project);
    await this.getCosmosContainer().item(project.id, project.id).replace(project);
    return project;
  }

  private async getRequiredActiveProject(projectId: string) {
    const project = await this.getProject(projectId);
    if (!project || project.status === "deleted") {
      throw new ProjectStoreError("Project was not found.", 404);
    }

    return project;
  }

  private async listAllProjects() {
    const { resources } = await this.getCosmosContainer().items
      .query<ProjectRecord>("SELECT * FROM c")
      .fetchAll();
    return resources;
  }

  private getCosmosContainer() {
    if (!this.cosmos) {
      const endpoint = requiredEnv("AZURE_COSMOS_ENDPOINT");
      const key = requiredEnv("AZURE_COSMOS_KEY");
      const databaseId = requiredEnv("AZURE_COSMOS_DATABASE");
      this.cosmos = new CosmosClient({ endpoint, key }).database(databaseId).container(PROJECTS_CONTAINER);
    }

    return this.cosmos;
  }

  private getBlobContainer() {
    if (!this.blobs) {
      const connectionString = requiredEnv("AZURE_STORAGE_CONNECTION_STRING");
      const containerName = requiredEnv("AZURE_STORAGE_GAME_ASSETS_CONTAINER");
      this.blobs = BlobServiceClient.fromConnectionString(connectionString).getContainerClient(containerName);
    }

    return this.blobs;
  }

  private async readTextBlob(name: string) {
    const blob = this.getBlobContainer().getBlockBlobClient(name);
    const buffer = await blob.downloadToBuffer();
    return buffer.toString("utf8");
  }

  private async writeBlob(name: string, content: string, contentType: string) {
    const blob = this.getBlobContainer().getBlockBlobClient(name);
    await blob.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: contentType }
    });
  }
}

function buildNewProject(name: string, slug: string, pathForSlug: (slug: string) => string): ProjectRecord {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new ProjectStoreError("Project name is required.", 400);
  }

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: trimmedName,
    slug,
    path: pathForSlug(slug),
    codexThreadId: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

function renderReadme(project: ProjectRecord) {
  return `# ${project.name}\n\nA sandboxed Azure Tides Gaming game workspace. Customize the live TV and phone gameplay by editing \`game/tv.html\`, \`game/phone.html\`, \`game/styles.css\`, \`game/game.js\`, \`game/config.json\`, and \`game/instructions.md\`. The ATG platform owns QR joining, phone player identity, color selection, connection state, menus, and room plumbing.\n`;
}

const TEMPLATE_FILES: Record<string, (project: ProjectRecord) => string> = {
  "config.json": (project) =>
    `${JSON.stringify({ ...DEFAULT_GAME_CONFIG, title: project.name }, null, 2)}\n`,
  "instructions.md": (project) => `# ${project.name}

## Goal

Welcome to ${project.name}. Use these instructions to explain the game objective, setup, and how players interact from their phones.

## How to Play

Add setup and gameplay steps here.

## Assets

Images stored in the game folder can be embedded here with Markdown.
`,
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
        <h2>Players</h2>
        <div id="players" class="list"></div>
      </section>
    </main>
  </body>
</html>
`
};

function parseGameConfig(raw: string, projectName: string) {
  const parsed = JSON.parse(raw) as Partial<GameConfig>;
  return normalizeGameConfig({ ...DEFAULT_GAME_CONFIG, title: projectName, ...parsed });
}

function asConfigPatch(patch: unknown) {
  return typeof patch === "object" && patch !== null ? (patch as Partial<GameConfig>) : {};
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

function normalizeGameInstructions(value: unknown) {
  if (typeof value !== "string") {
    throw new ProjectStoreError("Instructions are required.", 400);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new ProjectStoreError("Instructions cannot be empty.", 400);
  }

  if (value.length > 100_000) {
    throw new ProjectStoreError("Instructions must be 100,000 characters or fewer.", 400);
  }

  return `${value.replace(/\r\n?/g, "\n").trimEnd()}\n`;
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function normalizeGameAssetPath(segments: string[]) {
  const cleanSegments = segments.filter(Boolean);
  if (cleanSegments.length === 0) {
    throw new ProjectStoreError("Game asset path is required.", 400);
  }

  if (cleanSegments.some((segment) => segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    throw new ProjectStoreError("Game asset path is outside the project game folder.", 400);
  }

  return cleanSegments.join("/");
}

function resolveLocalGameAsset(project: ProjectRecord, segments: string[]) {
  const assetPath = normalizeGameAssetPath(segments);
  const gamePath = getGamePath(project);
  const resolved = path.resolve(gamePath, assetPath);
  const relative = path.relative(gamePath, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ProjectStoreError("Game asset path is outside the project game folder.", 400);
  }

  return resolved;
}

function getGamePath(project: ProjectRecord) {
  return path.join(project.path, GAME_DIR);
}

function blobName(project: ProjectRecord, assetPath: string) {
  return `projects/${project.id}/${assetPath}`;
}

function contentTypeForPath(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".gif": "image/gif",
    ".js": "text/javascript; charset=utf-8",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".json": "application/json; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml"
  };

  return contentTypes[extension] ?? "application/octet-stream";
}

function slugifyRequired(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ProjectStoreError("Project name is required.", 400);
  }

  return slugify(trimmed);
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "project";
}

function uniqueSlug(baseSlug: string, projects: ProjectRecord[]) {
  const used = new Set(projects.map((project) => project.slug));
  let slug = baseSlug;
  let index = 2;

  while (used.has(slug)) {
    slug = `${baseSlug}-${index}`;
    index += 1;
  }

  return slug;
}

function compactTimestamp(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 14);
}

function isMissingFileError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function isCosmosNotFound(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 404;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new ProjectStoreError(`${name} is required for the Azure storage backend.`, 503);
  }

  return value;
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
