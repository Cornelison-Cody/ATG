const signatures = {
  png: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  jpg: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  jpeg: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  gif: (bytes) => ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString()),
  webp: (bytes) => bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP",
  wav: (bytes) => bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE",
  ogg: (bytes) => bytes.subarray(0, 4).toString() === "OggS",
  flac: (bytes) => bytes.subarray(0, 4).toString() === "fLaC",
  mp3: (bytes) => bytes.subarray(0, 3).toString() === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0),
  mp4: (bytes) => bytes.subarray(4, 8).toString() === "ftyp",
  m4a: (bytes) => bytes.subarray(4, 8).toString() === "ftyp",
  webm: (bytes) => bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  woff: (bytes) => bytes.subarray(0, 4).toString() === "wOFF",
  woff2: (bytes) => bytes.subarray(0, 4).toString() === "wOF2",
  ttf: (bytes) => bytes.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])),
  otf: (bytes) => bytes.subarray(0, 4).toString() === "OTTO"
};

export function validateAssetBytes({ filename, content, contentType } = {}) {
  if (!filename || !Buffer.isBuffer(content) || !content.byteLength) throw new Error("Asset content is required.");
  const extension = filename.toLowerCase().split(".").pop() || "";
  if (["json", "atlas", "fnt", "svg"].includes(extension)) return validateStructuredAsset({ extension, content });
  const signature = signatures[extension];
  if (!signature || !signature(content)) throw new Error(`Asset bytes do not match the .${extension} file type.`);
  const expected = new Map([["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"], ["gif", "image/gif"], ["webp", "image/webp"], ["wav", "audio/wav"], ["ogg", "audio/ogg"], ["mp3", "audio/mpeg"], ["flac", "audio/flac"], ["mp4", "video/mp4"], ["m4a", "audio/mp4"], ["webm", "video/webm"], ["woff", "font/woff"], ["woff2", "font/woff2"], ["ttf", "font/ttf"], ["otf", "font/otf"]]).get(extension);
  if (expected && contentType && !contentType.startsWith(expected)) throw new Error(`Content type ${contentType} does not match ${expected}.`);
  return { extension, kind: ["mp4", "m4a", "webm"].includes(extension) ? (extension === "m4a" ? "audio" : "video") : ["wav", "ogg", "mp3", "flac"].includes(extension) ? "audio" : ["woff", "woff2", "ttf", "otf"].includes(extension) ? "font" : "image" };
}

function validateStructuredAsset({ extension, content }) {
  if (extension === "svg") {
    const text = content.toString("utf8");
    if (!/^\s*<svg[\s>]/i.test(text) || /<script|javascript:/i.test(text)) throw new Error("SVG content is malformed or unsafe.");
    return { extension, kind: "image" };
  }
  if (extension === "fnt") {
    if (!/^\s*(info|common|page|chars)\s+/m.test(content.toString("utf8"))) throw new Error("Bitmap font metadata is malformed.");
    return { extension, kind: "font" };
  }
  let parsed;
  try { parsed = JSON.parse(content.toString("utf8")); } catch { throw new Error("Asset metadata must contain valid JSON."); }
  validateReferences(parsed);
  if (extension === "atlas" && (!parsed.frames || typeof parsed.frames !== "object")) throw new Error("Atlas metadata must contain frames.");
  return { extension, kind: extension === "atlas" ? "atlas" : "metadata" };
}

function validateReferences(value) {
  if (typeof value === "string") {
    if (/^(https?:|data:|javascript:|\/)/i.test(value) || value.split("/").includes("..")) throw new Error("Asset metadata references must stay within the project asset library.");
    return;
  }
  if (Array.isArray(value)) return value.forEach(validateReferences);
  if (value && typeof value === "object") Object.values(value).forEach(validateReferences);
}
