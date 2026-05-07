import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";
import { ATG_ROOT, PROJECTS_ROOT, TRASH_ROOT } from "./env";
import { ensureProjectGameFiles } from "./project-game";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status: "done" | "error";
  createdAt: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  slug: string;
  path: string;
  codexThreadId: string | null;
  status: "active" | "deleted";
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  messages: ChatMessage[];
};

type ProjectDatabase = {
  projects: ProjectRecord[];
};

export type PublicProject = Omit<ProjectRecord, "messages"> & {
  messageCount: number;
};

const DB_PATH = path.join(ATG_ROOT, "projects.json");

export async function listProjects() {
  const db = await readDatabase();
  return db.projects.filter((project) => project.status === "active").map(toPublicProject);
}

export async function getProject(projectId: string) {
  const db = await readDatabase();
  return db.projects.find((project) => project.id === projectId) ?? null;
}

export async function createProject(name: string) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new ProjectStoreError("Project name is required.", 400);
  }

  const db = await readDatabase();
  const slug = uniqueSlug(slugify(trimmedName), db.projects);
  const projectPath = path.join(PROJECTS_ROOT, slug);
  const now = new Date().toISOString();
  const project: ProjectRecord = {
    id: randomUUID(),
    name: trimmedName,
    slug,
    path: projectPath,
    codexThreadId: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: randomUUID(),
        role: "system",
        content: `${trimmedName} is a sandboxed ATG game project. Codex can update files in this workspace. Customize the live TV and phone gameplay by editing game/tv.html, game/phone.html, game/styles.css, game/game.js, and game/config.json. Keep QR joining, phone player identity, color selection, connection state, menus, and room plumbing in the ATG platform shell unless the user explicitly asks for platform changes.`,
        status: "done",
        createdAt: now
      }
    ]
  };

  await mkdir(projectPath, { recursive: true });
  await writeFile(
    path.join(projectPath, "README.md"),
    `# ${trimmedName}\n\nA sandboxed Azure Tides Gaming game workspace. Customize the live TV and phone gameplay by editing \`game/tv.html\`, \`game/phone.html\`, \`game/styles.css\`, \`game/game.js\`, and \`game/config.json\`. The ATG platform owns QR joining, phone player identity, color selection, connection state, menus, and room plumbing.\n`,
    "utf8"
  );
  await ensureProjectGameFiles(project);

  db.projects.push(project);
  await writeDatabase(db);
  return project;
}

export async function softDeleteProject(projectId: string) {
  const db = await readDatabase();
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
  await writeDatabase(db);
  return project;
}

export async function appendProjectMessages(projectId: string, messages: ChatMessage[]) {
  const db = await readDatabase();
  const project = db.projects.find((item) => item.id === projectId);
  if (!project || project.status === "deleted") {
    throw new ProjectStoreError("Project was not found.", 404);
  }

  project.messages.push(...messages);
  project.updatedAt = new Date().toISOString();
  await writeDatabase(db);
  return project;
}

export async function updateProjectThread(projectId: string, codexThreadId: string) {
  const db = await readDatabase();
  const project = db.projects.find((item) => item.id === projectId);
  if (!project || project.status === "deleted") {
    throw new ProjectStoreError("Project was not found.", 404);
  }

  project.codexThreadId = codexThreadId;
  project.updatedAt = new Date().toISOString();
  await writeDatabase(db);
  return project;
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

async function readDatabase(): Promise<ProjectDatabase> {
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

async function writeDatabase(db: ProjectDatabase) {
  await mkdir(ATG_ROOT, { recursive: true });
  await writeFile(DB_PATH, `${JSON.stringify(db, null, 2)}\n`, "utf8");
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
