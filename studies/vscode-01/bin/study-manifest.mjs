#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const excludedDirectories = new Set([
  "captures/raw",
  "captures/otlp-private",
  "captures/agent-debug-private",
  "evidence/public/results",
]);
const excludedFiles = new Set([
  "MANIFEST.sha256",
  "RESULTS.md",
  "invalid-runs.json",
  "specimen-workspace/.study-condition.local.env",
  "specimen-workspace/.study-condition.local.env.tmp",
]);

function walk(directory) {
  return readdirSync(directory).sort().flatMap((name) => {
    const path = resolve(directory, name);
    const rel = relative(root, path).replaceAll("\\", "/");
    if (excludedDirectories.has(rel) || excludedFiles.has(rel)) return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const content = `${walk(root).map((path) => {
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
  return `${digest}  ${relative(root, path).replaceAll("\\", "/")}`;
}).join("\n")}\n`;
const manifest = resolve(root, "MANIFEST.sha256");

if (process.argv.includes("--check")) {
  const expected = readFileSync(manifest, "utf8");
  if (expected !== content) throw new Error("Study MANIFEST.sha256 is stale");
  process.stdout.write("Study manifest verified\n");
} else {
  writeFileSync(manifest, content, "utf8");
  process.stdout.write("Study manifest generated\n");
}
