const PIXI_8_19_0 = Object.freeze({
  contentType: "application/javascript; charset=utf-8",
  file: "engine-bundles/pixi-8.19.0/pixi.min.mjs",
  integrity: "sha384-xfbAeTbJR9wkgBgr3TUzVjX99MxVMJNZQ8gkusM6vzhyeHmjWlx75GwwgaENHGAh",
  license: "engine-bundles/pixi-8.19.0/LICENSE",
  packageName: "pixi.js",
  packageVersion: "8.19.0"
});

const ATG_TV_RUNTIME_1_0_0 = Object.freeze({
  contentType: "application/javascript; charset=utf-8",
  file: "engine-bundles/atg-tv-runtime-1.0.0/atg-tv-runtime.mjs",
  integrity: "sha384-Iz2iuL61VBArXe0fRhdOLcJw+uX5VIVD8+JNBJRLRgAIoKCXV+QCoMRa7qKjVOzx",
  packageName: "atg-tv-runtime",
  packageVersion: "1.0.0"
});

const PIXI_TRANSCODERS = Object.freeze({
  "basis_transcoder.js": Object.freeze({
    contentType: "application/javascript; charset=utf-8",
    file: "engine-bundles/pixi-8.19.0/transcoders/basis_transcoder.js",
    integrity: "sha384-TTbmvVK3HPhR/ySpVFnZBIfGbEVxUxgO7FAAFRKCjooBUVMU74kJayDI5jqHygpr",
    packageName: "pixi.js",
    packageVersion: "8.19.0"
  }),
  "basis_transcoder.wasm": Object.freeze({
    contentType: "application/wasm",
    file: "engine-bundles/pixi-8.19.0/transcoders/basis_transcoder.wasm",
    integrity: "sha384-RbL+GHW7YqHxiM7T3lOeoudpGRhShr1v678F3MbBbPmLw/0zCKCo36vwNpJ5NFOf",
    packageName: "pixi.js",
    packageVersion: "8.19.0"
  }),
  "libktx.js": Object.freeze({
    contentType: "application/javascript; charset=utf-8",
    file: "engine-bundles/pixi-8.19.0/transcoders/libktx.js",
    integrity: "sha384-/9qM5kIxMtkl7ukCyeiF2X63NnFSUkKQqlXSAwk5QkV3XuS/DpfbOHv6D6PiCSTm",
    packageName: "pixi.js",
    packageVersion: "8.19.0"
  }),
  "libktx.wasm": Object.freeze({
    contentType: "application/wasm",
    file: "engine-bundles/pixi-8.19.0/transcoders/libktx.wasm",
    integrity: "sha384-KNntQIfEdA7VesvmycOu0w15t10voo5cPw6+bYqyR5OeD7QpttAo3jIodFsIGEWS",
    packageName: "pixi.js",
    packageVersion: "8.19.0"
  })
});

const RUNTIMES = Object.freeze({
  "atg-2d-1.0.0": Object.freeze({ "atg-tv-runtime.mjs": ATG_TV_RUNTIME_1_0_0, "pixi.min.mjs": PIXI_8_19_0 }),
  "atg-2d-1.0.1": Object.freeze({ "atg-tv-runtime.mjs": ATG_TV_RUNTIME_1_0_0, "pixi.min.mjs": PIXI_8_19_0 }),
  "pixi-8.19.0": PIXI_TRANSCODERS
});

export function getAtgEngineBundle(runtimeVersion, bundleName) {
  const runtime = RUNTIMES[runtimeVersion];
  const bundle = runtime?.[bundleName];
  if (!bundle) return null;

  return {
    ...bundle,
    runtimeVersion
  };
}

export function getAtgEngineBundleUrl(runtimeVersion, bundleName = "pixi.min.mjs") {
  return `/api/engine/${encodeURIComponent(runtimeVersion)}/${encodeURIComponent(bundleName)}`;
}

export function getAtgEngineCompatibilityError(runtimeVersion) {
  return `ATG engine runtime ${JSON.stringify(runtimeVersion)} is unavailable. Restore that pinned runtime or migrate the game to a supported engine version.`;
}

export function listAtgEngineRuntimes() {
  return Object.keys(RUNTIMES).filter((runtimeVersion) => runtimeVersion.startsWith("atg-"));
}
