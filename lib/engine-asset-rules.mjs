const rules = Object.freeze({
  ".atlas": { contentType: "application/json", maxBytes: 5 * 1024 * 1024, kind: "atlas" },
  ".fnt": { contentType: "application/xml", maxBytes: 5 * 1024 * 1024, kind: "bitmap-font" },
  ".json": { contentType: "application/json", maxBytes: 5 * 1024 * 1024, kind: "metadata" },
  ".woff": { contentType: "font/woff", maxBytes: 5 * 1024 * 1024, kind: "font" },
  ".woff2": { contentType: "font/woff2", maxBytes: 5 * 1024 * 1024, kind: "font" },
  ".ttf": { contentType: "font/ttf", maxBytes: 5 * 1024 * 1024, kind: "font" },
  ".otf": { contentType: "font/otf", maxBytes: 5 * 1024 * 1024, kind: "font" },
  ".m4a": { contentType: "audio/mp4", maxBytes: 20 * 1024 * 1024, kind: "audio" },
  ".flac": { contentType: "audio/flac", maxBytes: 20 * 1024 * 1024, kind: "audio" },
  ".mp4": { contentType: "video/mp4", maxBytes: 50 * 1024 * 1024, kind: "video" },
  ".webm": { contentType: "video/webm", maxBytes: 50 * 1024 * 1024, kind: "video" },
  ".m4v": { contentType: "video/x-m4v", maxBytes: 50 * 1024 * 1024, kind: "video" }
});
export function getEngineAssetRule(filename) { const extension = typeof filename === "string" ? (filename.toLowerCase().match(/\.[a-z0-9]+$/) || [""])[0] : ""; return rules[extension] || null; }
export function isSupportedEngineAsset(filename) { return Boolean(getEngineAssetRule(filename)); }
export function getEngineAssetRules() { return rules; }
