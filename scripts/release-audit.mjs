import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const excludedDirectories = new Set([".git", ".npm-cache", "dist", "node_modules"]);
const excludedFiles = new Set(["MANIFEST.sha256", "package-lock.json"]);
const requiredFiles = [
  "README.md", "PROFILE.md", "CLAIMS.md", "LIMITATIONS.md", "SECURITY.md", "CHANGELOG.md",
  "INTEROPERABILITY.md", "ROADMAP.md", "CITATION.cff", "LICENSE",
  "corpus/v0.2/cases.json",
];

function walk(directory) {
  return readdirSync(directory).sort().flatMap((name) => {
    if (excludedDirectories.has(name)) return [];
    const path = resolve(directory, name);
    const rel = relative(root, path).replaceAll("\\", "/");
    if (excludedFiles.has(rel)) return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const failures = [];
for (const file of requiredFiles) {
  try {
    statSync(resolve(root, file));
  } catch {
    failures.push(`missing required release file: ${file}`);
  }
}

for (const path of walk(root)) {
  const rel = relative(root, path).replaceAll("\\", "/");
  const content = readFileSync(path, "utf8");
  if (/\b(?:TO[D]O|FIXM[E]|XX[X])\b/.test(content)) {
    failures.push(`${rel}: unresolved placeholder marker`);
  }
  if (/(?:^|[\s"'(])(?:\/workspace\/|\/root\/\.codex\/|[A-Z]:\\Users\\)/m.test(content)) {
    failures.push(`${rel}: private build path`);
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)) {
    failures.push(`${rel}: private key material`);
  }
  if (/\b(?:api[_-]?key|secret[_-]?key)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}/i.test(content)) {
    failures.push(`${rel}: credential-like assignment`);
  }
  if (rel.endsWith(".json")) {
    try {
      JSON.parse(content);
    } catch (error) {
      failures.push(`${rel}: invalid JSON (${error instanceof Error ? error.message : error})`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Release audit failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
}

process.stdout.write("Release audit passed\n");
