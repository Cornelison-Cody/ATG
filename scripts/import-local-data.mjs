#!/usr/bin/env node

import { existsSync } from "fs";
import { readFile } from "fs/promises";
import path from "path";

const dataRoot = process.env.ATG_DATA_ROOT || process.cwd();
const statePath = process.env.ATG_STATE_ROOT || path.join(dataRoot, ".atg");
const projectsPath = process.env.ATG_PROJECTS_ROOT || path.join(dataRoot, "projects");
const dbPath = path.join(statePath, "projects.json");

if (!existsSync(dbPath)) {
  console.error(`No local project database found at ${dbPath}`);
  process.exit(1);
}

const raw = await readFile(dbPath, "utf8");
const db = JSON.parse(raw);

console.log("ATG local import preview");
console.log(`Project database: ${dbPath}`);
console.log(`Project files root: ${projectsPath}`);
console.log(`Projects found: ${db.projects?.length ?? 0}`);
console.log("");
console.log("Next step: wire this script to DATABASE_URL and OBJECT_STORAGE_* to import metadata, chat, and game files.");
