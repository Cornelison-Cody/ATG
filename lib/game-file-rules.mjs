export class GameFileValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const maxGameTextFileBytes = 200_000;
const maxGameTextTotalBytes = 1_000_000;
const gameTextExtensions = new Set([".atlas", ".css", ".fnt", ".html", ".js", ".json", ".md", ".mjs", ".svg"]);
export const ENGINE_PROTECTED_GAME_PATHS = Object.freeze([
  "config.json",
  "game.js",
  "instructions.md",
  "phone.html",
  "styles.css",
  "tv.html"
]);

export function isAllowedGameTextPath(filePath) {
  try {
    validateGameTextPath(filePath);
    return true;
  } catch {
    return false;
  }
}

export function validateGameTextPath(filePath) {
  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new GameFileValidationError("Game file path is required.");
  }

  const normalizedPath = filePath.trim();
  if (
    normalizedPath.startsWith("/") ||
    /^[A-Za-z]:/.test(normalizedPath) ||
    normalizedPath.includes("\\") ||
    normalizedPath.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new GameFileValidationError("Game file path is outside the project game folder.");
  }

  if (!gameTextExtensions.has(extensionFor(normalizedPath))) {
    throw new GameFileValidationError("Game file type is not editable.");
  }

  return normalizedPath;
}

export function normalizeGameTextFiles(files) {
  if (!Array.isArray(files)) {
    throw new GameFileValidationError("Game files are required.");
  }

  let totalBytes = 0;
  const seen = new Set();
  const normalizedFiles = files.map((file) => {
    const filePath = validateGameTextPath(file?.path);
    const content = typeof file?.content === "string" ? file.content.replace(/\r\n?/g, "\n") : "";
    const size = Buffer.byteLength(content, "utf8");

    if (size > maxGameTextFileBytes) {
      throw new GameFileValidationError(`${filePath} exceeds the game file size limit.`, 413);
    }

    totalBytes += size;
    if (totalBytes > maxGameTextTotalBytes) {
      throw new GameFileValidationError("Game files exceed the upload size limit.", 413);
    }

    if (seen.has(filePath)) {
      throw new GameFileValidationError(`${filePath} was included more than once.`);
    }
    seen.add(filePath);

    return {
      content,
      path: filePath
    };
  });

  return normalizedFiles.sort((left, right) => left.path.localeCompare(right.path));
}

export function validateEngineGameFiles(files) {
  const normalizedFiles = normalizeGameTextFiles(files);
  const config = normalizedFiles.find((file) => file.path === "config.json");
  if (!config) return normalizedFiles;

  let parsed;
  try {
    parsed = JSON.parse(config.content);
  } catch {
    throw new GameFileValidationError("Engine game config.json must contain valid JSON.");
  }

  if (parsed?.engine?.type !== "pixi") return normalizedFiles;
  const paths = new Set(normalizedFiles.map((file) => file.path));
  const missing = ENGINE_PROTECTED_GAME_PATHS.filter((filePath) => !paths.has(filePath));
  if (missing.length > 0) {
    throw new GameFileValidationError(`Engine workspace is missing protected game files: ${missing.join(", ")}.`);
  }
  return normalizedFiles;
}

function extensionFor(filePath) {
  const index = filePath.lastIndexOf(".");
  return index === -1 ? "" : filePath.slice(index).toLowerCase();
}
