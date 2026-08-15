#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve, sep } from "node:path";

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

const separator = process.argv.indexOf("--");
const captureDirectory = valueAfter("--capture-dir");
const studyConditionLiteral = valueAfter("--study-condition");
const studyConditionEnvironment = valueAfter("--study-condition-env");
const studyCondition = studyConditionLiteral ?? (
  studyConditionEnvironment === undefined ? undefined : process.env[studyConditionEnvironment]
);
const artifact = valueAfter("--artifact");
const expectedSha256 = valueAfter("--expected-sha256");
const studyManifest = valueAfter("--study-manifest");
const command = separator === -1 ? undefined : process.argv[separator + 1];
const commandArguments = separator === -1 ? [] : process.argv.slice(separator + 2);

if (
  captureDirectory === undefined ||
  studyCondition === undefined ||
  (studyConditionLiteral !== undefined && studyConditionEnvironment !== undefined) ||
  artifact === undefined ||
  expectedSha256 === undefined ||
  command === undefined
) {
  process.stderr.write(
    "Usage: stdio-tap.mjs --capture-dir DIR (--study-condition ID | --study-condition-env ENV_NAME) --artifact FILE --expected-sha256 HEX [--study-manifest FILE] -- COMMAND [ARGS...]\n",
  );
  process.exit(64);
}

function verifyStudyManifest(path) {
  const absolute = resolve(path);
  const root = dirname(absolute);
  const manifestBytes = readFileSync(absolute);
  const lines = manifestBytes.toString("utf8").split(/\r?\n/).filter(Boolean);
  for (const [index, line] of lines.entries()) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (match === null) throw new Error(`Study manifest line ${index + 1} is malformed`);
    const [, expected, relativePath] = match;
    const target = resolve(root, relativePath);
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      throw new Error(`Study manifest line ${index + 1} escapes the study root`);
    }
    const actual = createHash("sha256").update(readFileSync(target)).digest("hex");
    if (actual !== expected) throw new Error(`Study manifest mismatch: ${relativePath}`);
  }
  return {
    entries: lines.length,
    sha256: `sha256:${createHash("sha256").update(manifestBytes).digest("hex")}`,
  };
}

const artifactBytes = readFileSync(resolve(artifact));
const artifactDigest = createHash("sha256").update(artifactBytes).digest("hex");
if (artifactDigest !== expectedSha256) {
  process.stderr.write(
    `Refusing to run: ${basename(artifact)} has sha256:${artifactDigest}, expected sha256:${expectedSha256}\n`,
  );
  process.exit(65);
}
let manifestVerification;
try {
  manifestVerification = studyManifest === undefined
    ? undefined
    : verifyStudyManifest(studyManifest);
} catch (error) {
  process.stderr.write(`Refusing to run: ${error.message}\n`);
  process.exit(66);
}

mkdirSync(resolve(captureDirectory), { recursive: true });
const sessionId = `${new Date().toISOString().replaceAll(":", "-")}-${process.pid}`;
const capturePath = resolve(captureDirectory, `${sessionId}.ndjson`);
closeSync(openSync(capturePath, "wx"));

let sequence = 0;
function record(kind, details) {
  appendFileSync(
    capturePath,
    `${JSON.stringify({ sequence: sequence++, capturedAt: new Date().toISOString(), kind, ...details })}\n`,
    "utf8",
  );
}

function recordChunk(direction, chunk) {
  record("chunk", {
    direction,
    byteLength: chunk.byteLength,
    sha256: `sha256:${createHash("sha256").update(chunk).digest("hex")}`,
    bytesBase64: chunk.toString("base64"),
  });
}

writeFileSync(
  `${capturePath}.meta.json`,
  `${JSON.stringify({
    format: "closureprobe-stdio-tap-v1",
    sessionId,
    startedAt: new Date().toISOString(),
    tapPid: process.pid,
    node: process.version,
    platform: process.platform,
    artifact: basename(artifact),
    artifactSha256: `sha256:${artifactDigest}`,
    studyCondition,
    ...(manifestVerification === undefined ? {} : { studyManifest: manifestVerification }),
    transcript: basename(capturePath),
  }, null, 2)}\n`,
  "utf8",
);

record("session_start", {
  format: "closureprobe-stdio-tap-v1",
  sessionId,
  artifactSha256: `sha256:${artifactDigest}`,
  studyCondition,
  ...(manifestVerification === undefined ? {} : { studyManifest: manifestVerification }),
});

const child = spawn(command, commandArguments, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ["pipe", "pipe", "pipe"],
});

process.stdin.on("data", (chunk) => recordChunk("client_to_server", chunk));
child.stdout.on("data", (chunk) => recordChunk("server_to_client", chunk));
child.stderr.on("data", (chunk) => {
  recordChunk("server_stderr", chunk);
  process.stderr.write(chunk);
});

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);

child.on("error", (error) => {
  record("child_error", { message: error.message });
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 70;
});

child.on("exit", (code, signal) => {
  record("session_end", { exitCode: code, signal });
  process.exitCode = code ?? (signal === null ? 0 : 1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    record("tap_signal", { signal });
    child.kill(signal);
  });
}
