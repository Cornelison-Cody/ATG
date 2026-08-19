import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ATG_ROOT } from "./env";

const root = path.join(ATG_ROOT, "media-previews");

export async function storeMediaPreview(id, bytes) {
  await mkdir(root, { recursive: true });
  const target = previewPath(id); const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, bytes, { mode: 0o600 });
  await rename(temporary, target);
}
export function readMediaPreview(id) { return readFile(previewPath(id)); }
export function deleteMediaPreview(id) { return rm(previewPath(id), { force: true }); }
function previewPath(id) { return path.join(root, `${String(id).replace(/[^a-zA-Z0-9_-]/g, "")}.bin`); }
