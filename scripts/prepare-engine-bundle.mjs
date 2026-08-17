import { createHash } from "crypto";
import { access, copyFile, mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

const version = process.argv[2];

if (!version || version === "--help" || version === "-h") {
  console.error("Usage: npm run engine:bundle -- <pixi.js-version>");
  process.exitCode = 1;
} else {
  await prepareBundle(version);
}

async function prepareBundle(packageVersion) {
  const packageRoot = path.join(process.cwd(), "node_modules", "pixi.js");
  const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  if (packageJson.version !== packageVersion) {
    throw new Error(`Installed pixi.js version is ${packageJson.version}; install ${packageVersion} before preparing its bundle.`);
  }

  const outputRoot = path.join(process.cwd(), "engine-bundles", `pixi-${packageVersion}`);
  if (await exists(outputRoot)) {
    throw new Error(`Refusing to replace existing pinned bundle ${path.relative(process.cwd(), outputRoot)}.`);
  }

  const sourcePaths = {
    "basis_transcoder.js": path.join(packageRoot, "transcoders", "basis", "basis_transcoder.js"),
    "basis_transcoder.wasm": path.join(packageRoot, "transcoders", "basis", "basis_transcoder.wasm"),
    "libktx.js": path.join(packageRoot, "transcoders", "ktx", "libktx.js"),
    "libktx.wasm": path.join(packageRoot, "transcoders", "ktx", "libktx.wasm")
  };
  const transcoderRoot = path.join(outputRoot, "transcoders");
  await mkdir(transcoderRoot, { recursive: true });
  await copyFile(path.join(packageRoot, "LICENSE"), path.join(outputRoot, "LICENSE"));

  for (const [name, source] of Object.entries(sourcePaths)) {
    await copyFile(source, path.join(transcoderRoot, name));
  }

  const pixiSource = await readFile(path.join(packageRoot, "dist", "pixi.min.mjs"), "utf8");
  const bundleBaseUrl = `/api/engine/pixi-${packageVersion}`;
  const bundledSource = pixiSource
    .replaceAll(
      "https://cdn.jsdelivr.net/npm/pixi.js/transcoders/basis/basis_transcoder.js",
      `${bundleBaseUrl}/basis_transcoder.js`
    )
    .replaceAll(
      "https://cdn.jsdelivr.net/npm/pixi.js/transcoders/basis/basis_transcoder.wasm",
      `${bundleBaseUrl}/basis_transcoder.wasm`
    )
    .replaceAll("https://cdn.jsdelivr.net/npm/pixi.js/transcoders/ktx/libktx.js", `${bundleBaseUrl}/libktx.js`)
    .replaceAll("https://cdn.jsdelivr.net/npm/pixi.js/transcoders/ktx/libktx.wasm", `${bundleBaseUrl}/libktx.wasm`);
  await writeFile(path.join(outputRoot, "pixi.min.mjs"), bundledSource, "utf8");

  const files = ["pixi.min.mjs", ...Object.keys(sourcePaths).map((name) => `transcoders/${name}`)];
  const integrities = Object.fromEntries(await Promise.all(files.map(async (file) => [
    file,
    `sha384-${createHash("sha384").update(await readFile(path.join(outputRoot, file))).digest("base64")}`
  ])));
  console.log(JSON.stringify({ bundle: `pixi-${packageVersion}`, integrities }, null, 2));
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}
