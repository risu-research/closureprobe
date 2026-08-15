import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const excludedDirectories = new Set([".git", ".npm-cache", "dist", "node_modules"]);
const excludedFiles = new Set(["MANIFEST.sha256", "package-lock.json"]);
const requiredFiles = [
  "README.md", "PROFILE.md", "CLAIMS.md", "LIMITATIONS.md", "SECURITY.md", "CHANGELOG.md",
  "INTEROPERABILITY.md", "POSITIONING.md", "ROADMAP.md", "CITATION.cff", "LICENSE",
  "corpus/v0.3/cases.json",
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

function readJson(relativePath) {
  try {
    return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
  } catch (error) {
    failures.push(
      `${relativePath}: cannot read release metadata (${error instanceof Error ? error.message : error})`,
    );
    return undefined;
  }
}

const packageMetadata = readJson("package.json");
const lockMetadata = readJson("package-lock.json");
const corpusMetadata = readJson("corpus/v0.3/cases.json");
const evidenceMetadata = readJson("evidence/results.json");

if (packageMetadata !== undefined) {
  const releaseVersion = packageMetadata.version;
  const rootLock = lockMetadata?.packages?.[""];
  if (lockMetadata?.version !== releaseVersion || rootLock?.version !== releaseVersion) {
    failures.push("package-lock.json: root versions do not match package.json");
  }
  if (evidenceMetadata?.toolVersion !== releaseVersion) {
    failures.push("evidence/results.json: toolVersion does not match package.json");
  }
  const corpusSource = readFileSync(resolve(root, "src/corpus.ts"), "utf8");
  if (!corpusSource.includes(`TOOL_VERSION = "${releaseVersion}"`)) {
    failures.push("src/corpus.ts: TOOL_VERSION does not match package.json");
  }
  const citation = readFileSync(resolve(root, "CITATION.cff"), "utf8");
  if (!citation.includes(`version: ${releaseVersion}`)) {
    failures.push("CITATION.cff: version does not match package.json");
  }
}

if (corpusMetadata !== undefined && evidenceMetadata !== undefined) {
  if (evidenceMetadata.corpusVersion !== corpusMetadata.corpusVersion) {
    failures.push("evidence/results.json: corpusVersion does not match the frozen corpus");
  }
  if (
    evidenceMetadata.total !== corpusMetadata.cases?.length ||
    evidenceMetadata.passed !== evidenceMetadata.total ||
    evidenceMetadata.failed !== 0
  ) {
    failures.push("evidence/results.json: report is not a complete passing result for the frozen corpus");
  }
  for (const name of readdirSync(resolve(root, "profiles"))) {
    if (!name.endsWith(".json")) continue;
    const descriptor = readJson(`profiles/${name}`);
    if (descriptor?.version !== corpusMetadata.profileVersion) {
      failures.push(`profiles/${name}: version does not match corpus profileVersion`);
    }
  }
}

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
