import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const category = process.argv[2] || "all";
const files = readdirSync(new URL("../tests", import.meta.url))
  .filter((file) => file.endsWith(".test.mjs"))
  .filter((file) => category === "all"
    || category === "unit" && !file.includes(".integration.") && !file.includes(".browser.") && !file.includes(".live.")
    || category === "integration" && file.includes(".integration.")
    || category === "browser" && file.includes(".browser.")
    || category === "live" && file.includes(".live."))
  .map((file) => new URL(`../tests/${file}`, import.meta.url).pathname);

if (files.length === 0) {
  console.error(`No ${category} tests found.`);
  process.exit(category === "browser" ? 1 : 0);
}

const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(result.status ?? 1);
