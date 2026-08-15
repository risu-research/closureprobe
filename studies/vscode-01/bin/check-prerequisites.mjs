#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = resolve(studyRoot, "../..");
const study = JSON.parse(readFileSync(resolve(studyRoot, "study.json"), "utf8"));
const packageMetadata = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
const runtimeRoot = resolve(repositoryRoot, "dist/src");
const adapter = resolve(studyRoot, "bin/study-mcp-server.mjs");

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const runtimeFiles = filesUnder(runtimeRoot)
  .filter((path) => path.endsWith(".js"))
  .sort();
const runtimeHash = createHash("sha256");
for (const path of runtimeFiles) {
  runtimeHash.update(relative(runtimeRoot, path).replaceAll("\\", "/"));
  runtimeHash.update("\0");
  runtimeHash.update(readFileSync(path));
  runtimeHash.update("\0");
}
const runtimeDigest = runtimeHash.digest("hex");
const adapterDigest = createHash("sha256").update(readFileSync(adapter)).digest("hex");
const expectedRuntime = study.instrument.runtimeTreeSha256.replace("sha256:", "");
const expectedAdapter = study.instrument.studyAdapterSha256.replace("sha256:", "");

const failures = [];
if (study.preregistrationVersion !== 3) {
  failures.push(`preregistration version ${study.preregistrationVersion} != 3`);
}
if (packageMetadata.version !== study.instrument.toolVersion) {
  failures.push(`package version ${packageMetadata.version} != ${study.instrument.toolVersion}`);
}
if (runtimeDigest !== expectedRuntime) {
  failures.push(`rc3 runtime digest ${runtimeDigest} != ${expectedRuntime}`);
}
if (adapterDigest !== expectedAdapter) {
  failures.push(`study adapter digest ${adapterDigest} != ${expectedAdapter}`);
}
if (process.versions.node.split(".")[0] < 22) failures.push(`Node ${process.version} is below 22`);

if (failures.length > 0) {
  throw new Error(`Study prerequisites failed:\n- ${failures.join("\n- ")}`);
}

process.stdout.write(
  `Study prerequisites passed (${study.instrument.tag}, runtime ${runtimeDigest}, adapter ${adapterDigest})\n`,
);
