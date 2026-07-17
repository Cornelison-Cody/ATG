export class GameFileValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const maxGameTextFileBytes = 200_000;
const maxGameTextTotalBytes = 1_000_000;
const gameTextExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".svg"]);

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

function extensionFor(filePath) {
  const index = filePath.lastIndexOf(".");
  return index === -1 ? "" : filePath.slice(index).toLowerCase();
}
