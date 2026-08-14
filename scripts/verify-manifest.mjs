import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const excluded = new Set([".git", ".npm-cache", "dist", "node_modules"]);
const excludedFiles = new Set(["MANIFEST.sha256"]);

function walk(directory) {
  return readdirSync(directory).sort().flatMap((name) => {
    if (excluded.has(name)) return [];
    const path = resolve(directory, name);
    const rel = relative(root, path).replaceAll("\\", "/");
    if (excludedFiles.has(rel)) return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const actual = walk(root).map((path) => {
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  return `${hash}  ${relative(root, path).replaceAll("\\", "/")}`;
}).join("\n") + "\n";
const expected = readFileSync(resolve(root, "MANIFEST.sha256"), "utf8");

if (actual !== expected) {
  throw new Error("MANIFEST.sha256 is stale; run npm run manifest");
}
process.stdout.write("Manifest verified\n");
