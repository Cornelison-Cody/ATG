import { CosmosClient, type Container } from "@azure/cosmos";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { randomUUID } from "crypto";
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from "fs/promises";
import path from "path";
import { ATG_ROOT, PROJECTS_ROOT, TRASH_ROOT, useAzureStorageBackend } from "./env";
import { normalizeGameConfig, parseGameConfig } from "./game-config.mjs";
import { GameEngineMetadataError } from "./game-engine-metadata.mjs";
import { isAllowedGameTextPath, normalizeGameTextFiles, validateGameTextPath } from "./game-file-rules.mjs";
import { renderGameInstructionsTemplate } from "./game-instructions-template.mjs";
import { DEFAULT_GAME_CONFIG, GameConfig } from "./game-types";
import { validateProjectName } from "./project-name-rules.mjs";
import { getEngineAssetRule } from "./engine-asset-rules.mjs";
import { validateAssetBytes } from "./asset-validation.mjs";
import type { ChatMessage, ProjectCollaborator, ProjectDatabase, ProjectRecord, PublicProject } from "./project-types";

export const GAME_DIR = "game";
export const GAME_CONFIG_FILE = "config.json";
export const GAME_INSTRUCTIONS_FILE = "instructions.md";
export const DEFAULT_NEW_GAME_RUNTIME_VERSION = "atg-2d-1.3.0";

const DB_PATH = path.join(ATG_ROOT, "projects.json");
const PROJECTS_CONTAINER = process.env.AZURE_COSMOS_PROJECTS_CONTAINER || "projects";
const UPLOADED_ASSETS_DIR = "assets";
const MAX_UPLOADED_ASSET_BYTES = 10 * 1024 * 1024;
const UPLOADED_ASSET_EXTENSIONS = new Set([".gif", ".jpg", ".jpeg", ".mp3", ".ogg", ".png", ".svg", ".wav", ".webp"]);

type GameAsset = {
  content: Buffer;
  contentType: string;
};

export type GameAssetSummary = {
  contentType: string;
  name: string;
  path: string;
  size: number;
  updatedAt: string;
};

export type GameAssetUpload = {
  content: Buffer;
  contentType: string;
  filename: string;
};

export type GameTextFile = {
  content: string;
  path: string;
};

interface ProjectStore {
  listProjects(principal?: ProjectOwnerInput): Promise<PublicProject[]>;
  getProject(projectId: string): Promise<ProjectRecord | null>;
  createProject(name: string, owner: ProjectOwnerInput): Promise<ProjectRecord>;
  claimProject(projectId: string, owner: ProjectOwnerInput): Promise<ProjectRecord>;
  updateProjectDetails(
    projectId: string,
    patch: { name?: string; visibility?: ProjectRecord["visibility"] }
  ): Promise<ProjectRecord>;
  addProjectCollaborator(projectId: string, principalName: string): Promise<ProjectRecord>;
  removeProjectCollaborator(projectId: string, principalName: string): Promise<ProjectRecord>;
  softDeleteProject(projectId: string): Promise<ProjectRecord>;
  appendProjectMessages(projectId: string, messages: ChatMessage[]): Promise<ProjectRecord>;
  updateProjectThread(projectId: string, codexThreadId: string): Promise<ProjectRecord>;
  readGameConfig(project: ProjectRecord): Promise<GameConfig>;
  updateGameConfig(project: ProjectRecord, patch: unknown): Promise<GameConfig>;
  readGameInstructions(project: ProjectRecord): Promise<string>;
  updateGameInstructions(project: ProjectRecord, instructions: string): Promise<string>;
  readGameAsset(project: ProjectRecord, segments: string[]): Promise<GameAsset>;
  listUploadedGameAssets(project: ProjectRecord): Promise<GameAssetSummary[]>;
  uploadGameAsset(project: ProjectRecord, asset: GameAssetUpload): Promise<GameAssetSummary>;
  deleteGameAsset(project: ProjectRecord, assetPath: string): Promise<void>;
  exportGameTextFiles(project: ProjectRecord): Promise<GameTextFile[]>;
  updateGameTextFiles(project: ProjectRecord, files: GameTextFile[]): Promise<GameTextFile[]>;
}

export type ProjectOwnerInput = {
  principalName: string;
  userId: string;
};

export function getProjectStore(): ProjectStore {
  return useAzureStorageBackend() ? new AzureProjectStore() : new LocalProjectStore();
}

export function toPublicProject(project: ProjectRecord, principal?: ProjectOwnerInput): PublicProject {
  const { messages, ...rest } = withProjectDefaults(project);
  return {
    ...rest,
    accessRole: principal ? accessRoleForProject(project, principal) ?? undefined : undefined,
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
  async listProjects(principal?: ProjectOwnerInput) {
    const db = await this.readDatabase();
    return db.projects
      .filter((project) => project.status === "active")
      .filter((project) => isVisibleInDashboard(project, principal))
      .map((project) => toPublicProject(project, principal));
  }

  async getProject(projectId: string) {
    const db = await this.readDatabase();
    const project = db.projects.find((item) => item.id === projectId) ?? null;
    return project ? withProjectDefaults(project) : null;
  }

  async createProject(name: string, owner: ProjectOwnerInput) {
    const db = await this.readDatabase();
    const project = buildNewProject(name, owner, uniqueSlug(slugifyRequired(name), db.projects), (slug) =>
      path.join(PROJECTS_ROOT, slug)
    );

    await mkdir(project.path, { recursive: true });
    await writeFile(path.join(project.path, "README.md"), renderReadme(project), "utf8");
    await this.ensureGameFiles(project, ENGINE_TEMPLATE_FILES);

    db.projects.push(project);
    await this.writeDatabase(db);
    return project;
  }

  async claimProject(projectId: string, owner: ProjectOwnerInput) {
    return this.updateProject(projectId, (project) => {
      if (!project.ownerUserId) {
        project.ownerUserId = owner.userId;
        project.ownerName = owner.principalName;
        project.updatedAt = new Date().toISOString();
      }
    });
  }

  async updateProjectDetails(projectId: string, patch: { name?: string; visibility?: ProjectRecord["visibility"] }) {
    return this.updateProject(projectId, (project) => {
      if (patch.name !== undefined) {
        project.name = requiredProjectName(patch.name);
      }
      if (patch.visibility !== undefined) {
        project.visibility = patch.visibility;
      }
      project.updatedAt = new Date().toISOString();
    });
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

  async addProjectCollaborator(projectId: string, principalName: string) {
    return this.updateProject(projectId, (project) => {
      const normalized = requiredPrincipalName(principalName);
      if (normalized === normalizePrincipalName(project.ownerName)) {
        throw new ProjectStoreError("Project owner is already a collaborator.", 400);
      }
      if (!project.collaborators.some((collaborator) => normalizePrincipalName(collaborator.principalName) === normalized)) {
        project.collaborators.push({ principalName: normalized, invitedAt: new Date().toISOString() });
        project.updatedAt = new Date().toISOString();
      }
    });
  }

  async removeProjectCollaborator(projectId: string, principalName: string) {
    return this.updateProject(projectId, (project) => {
      const normalized = requiredPrincipalName(principalName);
      const next = project.collaborators.filter(
        (collaborator) => normalizePrincipalName(collaborator.principalName) !== normalized
      );
      if (next.length !== project.collaborators.length) {
        project.collaborators = next;
        project.updatedAt = new Date().toISOString();
      }
    });
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
    } catch (error) {
      if (error instanceof GameEngineMetadataError) {
        throw error;
      }
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
    await this.updateProject(project.id, (item) => {
      item.updatedAt = new Date().toISOString();
    });
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

  async listUploadedGameAssets(project: ProjectRecord) {
    await this.ensureGameFiles(project);
    return listLocalUploadedAssets(getGamePath(project));
  }

  async uploadGameAsset(project: ProjectRecord, asset: GameAssetUpload) {
    const normalized = normalizeUploadedGameAsset(asset);
    await this.ensureGameFiles(project);
    const targetPath = resolveLocalGameAsset(project, normalized.path.split("/"));
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, normalized.content);
    const info = await stat(targetPath);
    await this.updateProject(project.id, (item) => {
      item.updatedAt = new Date().toISOString();
    });
    return assetSummary(normalized.path, info.size, info.mtime.toISOString());
  }

  async deleteGameAsset(project: ProjectRecord, assetPath: string) {
    const normalizedPath = normalizeUploadedAssetPath(assetPath);
    await assertAssetNotReferenced(this, project, normalizedPath);
    try {
      await unlink(resolveLocalGameAsset(project, normalizedPath.split("/")));
    } catch (error) {
      if (isMissingFileError(error)) {
        throw new ProjectStoreError("Game asset was not found.", 404);
      }
      throw error;
    }
    await this.updateProject(project.id, (item) => {
      item.updatedAt = new Date().toISOString();
    });
  }

  async exportGameTextFiles(project: ProjectRecord) {
    await this.ensureGameFiles(project);
    const gamePath = getGamePath(project);
    const files = await listLocalGameTextFiles(gamePath);
    return Promise.all(
      files.map(async (filePath) => ({
        content: await readFile(path.join(gamePath, filePath), "utf8"),
        path: filePath
      }))
    );
  }

  async updateGameTextFiles(project: ProjectRecord, files: GameTextFile[]) {
    const normalizedFiles = normalizeGameTextFiles(files);
    await this.ensureGameFiles(project);
    const gamePath = getGamePath(project);

    for (const file of normalizedFiles) {
      const targetPath = resolveLocalGameAsset(project, file.path.split("/"));
      await mkdir(path.dirname(targetPath), { recursive: true });
      await writeFile(targetPath, file.content, "utf8");
    }

    await this.updateProject(project.id, (item) => {
      item.updatedAt = new Date().toISOString();
    });
    return normalizedFiles;
  }

  private async ensureGameFiles(project: ProjectRecord, templates = TEMPLATE_FILES) {
    const gamePath = getGamePath(project);
    await mkdir(gamePath, { recursive: true });

    for (const [fileName, render] of Object.entries(templates)) {
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
      return normalizeDatabase(JSON.parse(raw) as ProjectDatabase);
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

  async listProjects(principal?: ProjectOwnerInput) {
    const container = this.getCosmosContainer();
    const { resources } = await container.items
      .query<ProjectRecord>({
        query: "SELECT * FROM c WHERE c.status = @status ORDER BY c.updatedAt DESC",
        parameters: [{ name: "@status", value: "active" }]
      })
      .fetchAll();

    return resources
      .map(withProjectDefaults)
      .filter((project) => isVisibleInDashboard(project, principal))
      .map((project) => toPublicProject(project, principal));
  }

  async getProject(projectId: string) {
    try {
      const { resource } = await this.getCosmosContainer().item(projectId, projectId).read<ProjectRecord>();
      return resource ? withProjectDefaults(resource) : null;
    } catch (error) {
      if (isCosmosNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async createProject(name: string, owner: ProjectOwnerInput) {
    const trimmedName = name.trim();
    const slug = uniqueSlug(slugifyRequired(trimmedName), await this.listAllProjects());
    const project = buildNewProject(trimmedName, owner, slug, () => `azure://projects/${slug}`);

    await this.writeBlob(blobName(project, "README.md"), renderReadme(project), "text/markdown; charset=utf-8");
    await this.ensureGameFiles(project, ENGINE_TEMPLATE_FILES);
    await this.getCosmosContainer().items.create(project);
    return project;
  }

  async claimProject(projectId: string, owner: ProjectOwnerInput) {
    return this.updateProject(projectId, (project) => {
      if (!project.ownerUserId) {
        project.ownerUserId = owner.userId;
        project.ownerName = owner.principalName;
        project.updatedAt = new Date().toISOString();
      }
    });
  }

  async updateProjectDetails(projectId: string, patch: { name?: string; visibility?: ProjectRecord["visibility"] }) {
    return this.updateProject(projectId, (project) => {
      if (patch.name !== undefined) {
        project.name = requiredProjectName(patch.name);
      }
      if (patch.visibility !== undefined) {
        project.visibility = patch.visibility;
      }
      project.updatedAt = new Date().toISOString();
    });
  }

  async softDeleteProject(projectId: string) {
    const project = await this.getRequiredActiveProject(projectId);
    project.status = "deleted";
    project.deletedAt = new Date().toISOString();
    project.updatedAt = project.deletedAt;
    await this.getCosmosContainer().item(project.id, project.id).replace(project);
    return project;
  }

  async addProjectCollaborator(projectId: string, principalName: string) {
    return this.updateProject(projectId, (project) => {
      const normalized = requiredPrincipalName(principalName);
      if (normalized === normalizePrincipalName(project.ownerName)) {
        throw new ProjectStoreError("Project owner is already a collaborator.", 400);
      }
      if (!project.collaborators.some((collaborator) => normalizePrincipalName(collaborator.principalName) === normalized)) {
        project.collaborators.push({ principalName: normalized, invitedAt: new Date().toISOString() });
        project.updatedAt = new Date().toISOString();
      }
    });
  }

  async removeProjectCollaborator(projectId: string, principalName: string) {
    return this.updateProject(projectId, (project) => {
      const normalized = requiredPrincipalName(principalName);
      const next = project.collaborators.filter(
        (collaborator) => normalizePrincipalName(collaborator.principalName) !== normalized
      );
      if (next.length !== project.collaborators.length) {
        project.collaborators = next;
        project.updatedAt = new Date().toISOString();
      }
    });
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
    } catch (error) {
      if (error instanceof GameEngineMetadataError) {
        throw error;
      }
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
    await this.updateProject(project.id, (item) => {
      item.updatedAt = new Date().toISOString();
    });
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

  async listUploadedGameAssets(project: ProjectRecord) {
    await this.ensureGameFiles(project);
    const prefix = blobName(project, `${GAME_DIR}/assets/`);
    const assets: GameAssetSummary[] = [];

    for await (const blob of this.getBlobContainer().listBlobsFlat({ prefix })) {
      const assetPath = blob.name.slice(blobName(project, `${GAME_DIR}/`).length);
      assets.push(assetSummary(assetPath, blob.properties.contentLength ?? 0, blob.properties.lastModified?.toISOString() ?? ""));
    }

    return assets.sort((left, right) => left.path.localeCompare(right.path));
  }

  async uploadGameAsset(project: ProjectRecord, asset: GameAssetUpload) {
    const normalized = normalizeUploadedGameAsset(asset);
    await this.ensureGameFiles(project);
    await this.writeBinaryBlob(
      blobName(project, `${GAME_DIR}/${normalized.path}`),
      normalized.content,
      contentTypeForPath(normalized.path)
    );
    await this.updateProject(project.id, (item) => {
      item.updatedAt = new Date().toISOString();
    });
    return assetSummary(normalized.path, normalized.content.byteLength, new Date().toISOString());
  }

  async deleteGameAsset(project: ProjectRecord, assetPath: string) {
    const normalizedPath = normalizeUploadedAssetPath(assetPath);
    await assertAssetNotReferenced(this, project, normalizedPath);
    const blob = this.getBlobContainer().getBlockBlobClient(blobName(project, `${GAME_DIR}/${normalizedPath}`));
    const result = await blob.deleteIfExists();
    if (!result.succeeded) {
      throw new ProjectStoreError("Game asset was not found.", 404);
    }
    await this.updateProject(project.id, (item) => {
      item.updatedAt = new Date().toISOString();
    });
  }

  async exportGameTextFiles(project: ProjectRecord) {
    await this.ensureGameFiles(project);
    const prefix = blobName(project, `${GAME_DIR}/`);
    const files: GameTextFile[] = [];

    for await (const blob of this.getBlobContainer().listBlobsFlat({ prefix })) {
      const filePath = blob.name.slice(prefix.length);
      if (!isAllowedGameTextPath(filePath)) {
        continue;
      }

      files.push({
        content: await this.readTextBlob(blob.name),
        path: filePath
      });
    }

    return files.sort((left, right) => left.path.localeCompare(right.path));
  }

  async updateGameTextFiles(project: ProjectRecord, files: GameTextFile[]) {
    const normalizedFiles = normalizeGameTextFiles(files);
    await this.ensureGameFiles(project);

    for (const file of normalizedFiles) {
      await this.writeBlob(
        blobName(project, `${GAME_DIR}/${file.path}`),
        file.content,
        contentTypeForPath(file.path)
      );
    }

    await this.updateProject(project.id, (item) => {
      item.updatedAt = new Date().toISOString();
    });
    return normalizedFiles;
  }

  private async ensureGameFiles(project: ProjectRecord, templates = TEMPLATE_FILES) {
    for (const [fileName, render] of Object.entries(templates)) {
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

  private async writeBinaryBlob(name: string, content: Buffer, contentType: string) {
    const blob = this.getBlobContainer().getBlockBlobClient(name);
    await blob.uploadData(content, {
      blobHTTPHeaders: { blobContentType: contentType }
    });
  }
}

function buildNewProject(
  name: string,
  owner: ProjectOwnerInput,
  slug: string,
  pathForSlug: (slug: string) => string
): ProjectRecord {
  const trimmedName = requiredProjectName(name);

  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name: trimmedName,
    slug,
    path: pathForSlug(slug),
    codexThreadId: null,
    ownerUserId: owner.userId,
    ownerName: owner.principalName,
    collaborators: [],
    visibility: "private",
    status: "active",
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

function normalizeDatabase(db: ProjectDatabase): ProjectDatabase {
  return {
    projects: db.projects.map(withProjectDefaults)
  };
}

function withProjectDefaults(project: ProjectRecord): ProjectRecord {
  return {
    ...project,
    collaborators: normalizeCollaborators(project.collaborators),
    visibility: project.visibility === "public" ? "public" : "private"
  };
}

function isVisibleInDashboard(project: ProjectRecord, principal?: ProjectOwnerInput) {
  if (!principal) {
    return false;
  }

  return !project.ownerUserId || Boolean(accessRoleForProject(project, principal));
}

function accessRoleForProject(project: ProjectRecord, principal: ProjectOwnerInput) {
  if (!project.ownerUserId || project.ownerUserId === principal.userId) {
    return "owner";
  }

  const principalName = normalizePrincipalName(principal.principalName);
  if (project.collaborators.some((collaborator) => normalizePrincipalName(collaborator.principalName) === principalName)) {
    return "collaborator";
  }

  return null;
}

function normalizeCollaborators(value: ProjectCollaborator[] | undefined) {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const collaborators: ProjectCollaborator[] = [];
  for (const collaborator of value) {
    const principalName = requiredPrincipalName(collaborator?.principalName);
    if (seen.has(principalName)) {
      continue;
    }
    seen.add(principalName);
    collaborators.push({
      principalName,
      invitedAt: typeof collaborator?.invitedAt === "string" ? collaborator.invitedAt : new Date(0).toISOString()
    });
  }
  return collaborators;
}

function requiredPrincipalName(value: unknown) {
  const principalName = normalizePrincipalName(value);
  if (!principalName) {
    throw new ProjectStoreError("Collaborator email or login is required.", 400);
  }
  if (principalName.length > 320) {
    throw new ProjectStoreError("Collaborator email or login must be 320 characters or fewer.", 400);
  }
  return principalName;
}

function normalizePrincipalName(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function requiredProjectName(value: string) {
  const result = validateProjectName(value);
  if (!result.ok) {
    throw new ProjectStoreError(result.error, 400);
  }

  return result.name;
}

function renderReadme(project: ProjectRecord) {
  return `# ${project.name}\n\nA sandboxed Azure Tides Gaming game workspace. Customize the live TV and phone gameplay by editing \`game/tv.html\`, \`game/phone.html\`, \`game/styles.css\`, \`game/game.js\`, \`game/config.json\`, and \`game/instructions.md\`. The ATG platform owns QR joining, phone player identity, color selection, connection state, menus, and room plumbing.\n`;
}

const TEMPLATE_FILES: Record<string, (project: ProjectRecord) => string> = {
  "config.json": (project) =>
    `${JSON.stringify({ ...DEFAULT_GAME_CONFIG, title: project.name }, null, 2)}\n`,
  "instructions.md": (project) => renderGameInstructionsTemplate(project.name),
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

window.ATG.onState((state) => {
  applyAccent(state.config || {});
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
    <main class="panel phone-panel"></main>
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
    <main class="panel"></main>
  </body>
</html>
`
};

const ENGINE_TEMPLATE_FILES: Record<string, (project: ProjectRecord) => string> = {
  ...TEMPLATE_FILES,
  "config.json": (project) =>
    `${JSON.stringify({
      ...DEFAULT_GAME_CONFIG,
      engine: {
        formatVersion: 1,
        migrationStatus: "upgraded",
        runtimeVersion: DEFAULT_NEW_GAME_RUNTIME_VERSION,
        type: "pixi"
      },
      title: project.name
    }, null, 2)}\n`,
  "game.js": () => `function applyAccent(config) {
  document.documentElement.style.setProperty("--game-accent", config.accentColor || "#4dd6c9");
}

function renderPhoneStarter() {
  const root = document.querySelector(".phone-panel");
  if (!root) return;
  root.replaceChildren();
  const title = document.createElement("h1");
  title.textContent = "Ready to play";
  const message = document.createElement("p");
  message.className = "muted";
  message.textContent = "Join the TV game, then use this button to send your first action.";
  const button = document.createElement("button");
  button.className = "button";
  button.type = "button";
  button.textContent = "I’m ready";
  button.addEventListener("click", () => window.ATG.sendAction("starter:ready"));
  root.append(title, message, button);
}

function startTvStarter(engine) {
  if (window.__atgStarterMounted) return;
  window.__atgStarterMounted = true;
  engine.ready.then(() => {
    const scene = engine.gameplay.createScene({ id: "starter" });
    const title = new engine.PIXI.Text({ text: "Ready to play", style: { fill: "#eef5ff", fontSize: 72, fontWeight: "700" } });
    const status = new engine.PIXI.Text({ text: "Waiting for players", style: { fill: "#a8b6cb", fontSize: 32 } });
    title.anchor.set(0.5);
    status.anchor.set(0.5);
    title.position.set(960, 470);
    status.position.set(960, 570);
    scene.root.addChild(title, status);
    engine.bridge.onState((state) => {
      applyAccent(state.config || {});
      const players = Array.isArray(state.players) ? state.players.length : 0;
      status.text = players ? players + " player" + (players === 1 ? "" : "s") + " connected" : "Waiting for players";
    });
  }).catch(() => undefined);
}

window.ATG.onState((state) => applyAccent(state.config || {}));
window.addEventListener("atg-engine-ready", (event) => startTvStarter(event.detail), { once: true });
if (window.ATGEngine) startTvStarter(window.ATGEngine);
if (!window.ATGEngine) renderPhoneStarter();
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
    <main class="panel phone-panel" aria-live="polite"></main>
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
    <main class="panel" aria-live="polite"></main>
  </body>
</html>
`
};

function asConfigPatch(patch: unknown) {
  return typeof patch === "object" && patch !== null ? (patch as Partial<GameConfig>) : {};
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

function normalizeUploadedGameAsset(asset: GameAssetUpload) {
  const cleanName = sanitizeAssetFileName(asset.filename);
  const extension = path.extname(cleanName).toLowerCase();
  if (!UPLOADED_ASSET_EXTENSIONS.has(extension) && !getEngineAssetRule(cleanName)) {
    throw new ProjectStoreError("Asset file type is not supported.", 400);
  }

  if (asset.content.byteLength === 0) {
    throw new ProjectStoreError("Asset file cannot be empty.", 400);
  }

  const maxBytes = getEngineAssetRule(cleanName)?.maxBytes || MAX_UPLOADED_ASSET_BYTES;
  if (asset.content.byteLength > maxBytes) {
    throw new ProjectStoreError(`Asset files must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller.`, 413);
  }

  try {
    validateAssetBytes({ filename: cleanName, content: asset.content, contentType: asset.contentType });
  } catch (error) {
    throw new ProjectStoreError(error instanceof Error ? error.message : "Asset bytes are invalid.", 400);
  }

  return {
    content: asset.content,
    path: `${UPLOADED_ASSETS_DIR}/${cleanName}`
  };
}

function sanitizeAssetFileName(filename: string) {
  const parsed = path.parse(filename);
  const extension = parsed.ext.toLowerCase();
  const base = parsed.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  if (!base || !extension) {
    throw new ProjectStoreError("Asset file name is required.", 400);
  }

  return `${base}${extension}`;
}

function normalizeUploadedAssetPath(assetPath: string) {
  const segments = normalizeGameAssetPath(assetPath.split("/")).split("/");
  if (segments.length < 2 || segments[0] !== UPLOADED_ASSETS_DIR) {
    throw new ProjectStoreError("Only uploaded game assets can be deleted.", 400);
  }

  const extension = path.extname(segments[1]).toLowerCase();
  if (!UPLOADED_ASSET_EXTENSIONS.has(extension) && !getEngineAssetRule(segments[1])) {
    throw new ProjectStoreError("Asset file type is not supported.", 400);
  }

  return segments.join("/");
}

function assetSummary(assetPath: string, size: number, updatedAt: string): GameAssetSummary {
  return {
    contentType: contentTypeForPath(assetPath),
    name: path.basename(assetPath),
    path: assetPath,
    size,
    updatedAt
  };
}

async function assertAssetNotReferenced(store: Pick<ProjectStore, "listUploadedGameAssets" | "readGameAsset" | "exportGameTextFiles">, project: ProjectRecord, assetPath: string) {
  const references = [assetPath, `./${assetPath}`];
  const files = await store.exportGameTextFiles(project);
  for (const file of files) {
    if (file.path !== assetPath && references.some((reference) => file.content.includes(reference))) {
      throw new ProjectStoreError(`Asset ${assetPath} is referenced by ${file.path}; remove the reference before deleting it.`, 409);
    }
  }
  for (const asset of await store.listUploadedGameAssets(project)) {
    if (asset.path === assetPath || !/\.(json|atlas|fnt|svg)$/i.test(asset.path)) continue;
    try {
      const content = (await store.readGameAsset(project, asset.path.split("/"))).content.toString("utf8");
      if (references.some((reference) => content.includes(reference))) throw new ProjectStoreError(`Asset ${assetPath} is referenced by ${asset.path}; remove the reference before deleting it.`, 409);
    } catch (error) {
      if (error instanceof ProjectStoreError) throw error;
    }
  }
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

async function listLocalGameTextFiles(rootPath: string, relativePath = ""): Promise<string[]> {
  const entries = await readdir(path.join(rootPath, relativePath), { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const nextPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listLocalGameTextFiles(rootPath, nextPath));
    } else if (entry.isFile() && isAllowedGameTextPath(nextPath)) {
      files.push(validateGameTextPath(nextPath));
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function listLocalUploadedAssets(gamePath: string) {
  const assetsPath = path.join(gamePath, UPLOADED_ASSETS_DIR);
  try {
    await readdir(assetsPath);
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }

  const assets: GameAssetSummary[] = [];
  async function visit(directory: string, prefix: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      const assetPath = `${UPLOADED_ASSETS_DIR}/${prefix}${entry.name}`;
      if (entry.isDirectory()) { await visit(filePath, `${prefix}${entry.name}/`); continue; }
      if (!entry.isFile()) continue;
      try { normalizeUploadedAssetPath(assetPath); const info = await stat(filePath); assets.push(assetSummary(assetPath, info.size, info.mtime.toISOString())); } catch (error) { if (!(error instanceof ProjectStoreError)) throw error; }
    }
  }
  await visit(assetsPath, "");

  return assets.sort((left, right) => left.path.localeCompare(right.path));
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
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wav": "audio/wav",
    ".webp": "image/webp",
    ".atlas": "application/json",
    ".fnt": "application/xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".otf": "font/otf",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".m4v": "video/x-m4v"
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
