import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "closureprobe-pack-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const configuredCache = process.env.CLOSUREPROBE_NPM_CACHE;
const offlineOptions = configuredCache === undefined
  ? []
  : ["--cache", configuredCache, "--offline"];

try {
  const packed = JSON.parse(execFileSync(
    npm,
    [
      "pack",
      ...offlineOptions,
      "--ignore-scripts",
      "--json",
      "--pack-destination",
      temporary,
    ],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ));
  const metadata = packed[0];
  if (metadata === undefined || typeof metadata.filename !== "string") {
    throw new Error("npm pack did not return package metadata");
  }
  const paths = new Set(metadata.files.map((entry) => entry.path));
  for (const required of [
    "dist/src/index.js",
    "dist/src/cli.js",
    "dist/src/mcp-server.js",
    "corpus/v0.2/cases.json",
    "schemas/closure-trace.schema.json",
    "evidence/results.json",
    "evidence/results.html",
    "PROFILE.md",
    "CHANGELOG.md",
    "IMPACT.md",
    "LIMITATIONS.md",
    "MANIFEST.sha256",
  ]) {
    if (!paths.has(required)) throw new Error(`packed artifact is missing ${required}`);
  }

  const consumer = join(temporary, "consumer");
  mkdirSync(consumer);
  execFileSync(
    npm,
    [
      "install",
      ...offlineOptions,
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(temporary, metadata.filename),
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      "import { createProbePayload, assessClosure } from '@risu-research/closureprobe'; const result=assessClosure(createProbePayload('continued-zero',{q:'needle'}).observation); if(result.negativeLicense!=='not_licensed') process.exit(2);",
    ],
    { cwd: consumer, stdio: "pipe" },
  );
  const profileList = execFileSync(
    join(consumer, "node_modules", ".bin", process.platform === "win32" ? "closureprobe.cmd" : "closureprobe"),
    ["profiles", "list"],
    { cwd: consumer, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (!profileList.includes("google-drive-files-list")) {
    throw new Error("installed CLI did not expose the distributed profiles");
  }
  process.stdout.write(`Packed consumer smoke test passed (${metadata.filename})\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
