#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, resolve } from "node:path";

import { resolveAgentDebugRequestSidecars } from "./resolve-agent-debug-sidecars.mjs";

function sha256(path) {
  const bytes = readFileSync(path);
  return {
    bytes: bytes.byteLength,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
}

function requireValue(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1 || args[index + 1] === undefined) {
    throw new Error(`Missing required ${flag}`);
  }
  return args[index + 1];
}

function repeatedValues(args, flag) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) continue;
    if (args[index + 1] === undefined) {
      throw new Error(`Missing value after ${flag}`);
    }
    values.push(args[index + 1]);
  }
  return values;
}

function requirePlainFilename(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    basename(value) !== value ||
    value === "." ||
    value === ".."
  ) {
    throw new Error(`${label} must be a plain filename, not a path`);
  }
  return value;
}

function destinationName(role, sourceName) {
  if (role === "main") return "main.jsonl";
  const extension = extname(sourceName);
  const stem = sourceName.slice(0, sourceName.length - extension.length);
  return `sidecar-${stem}${extension}`;
}

function sealOne({ role, source, destination }) {
  const before = sha256(source);

  copyFileSync(source, destination);

  const sealedCopy = sha256(destination);
  const after = sha256(source);

  const valid =
    before.sha256 === sealedCopy.sha256 &&
    sealedCopy.sha256 === after.sha256 &&
    before.bytes === sealedCopy.bytes &&
    sealedCopy.bytes === after.bytes;

  return {
    role,
    sourceFile: basename(source),
    sealedFile: basename(destination),
    sourceBefore: before,
    sealedCopy,
    sourceAfter: after,
    valid,
  };
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    process.stdout.write(
      "Usage: seal-agent-debug.mjs --session-dir DIR --out-dir DIR " +
      "[--sidecar FILENAME ...]\n" +
      "Referenced llm_request systemPromptFile/toolsFile sidecars are resolved automatically.\n",
    );
    return;
  }

  const sessionDir = resolve(requireValue(args, "--session-dir"));
  const outDir = resolve(requireValue(args, "--out-dir"));
  const sidecars = repeatedValues(args, "--sidecar").map((value) =>
    requirePlainFilename(value, "--sidecar"),
  );

  if (!existsSync(sessionDir) || !statSync(sessionDir).isDirectory()) {
    throw new Error("Session directory does not exist or is not a directory");
  }

  if (existsSync(outDir)) {
    throw new Error("Output directory already exists; refusing to overwrite sealed evidence");
  }

  if (new Set(sidecars).size !== sidecars.length) {
    throw new Error("Duplicate --sidecar filenames are not allowed");
  }

  const mainName = "main.jsonl";
  const mainSource = resolve(sessionDir, mainName);
  if (!existsSync(mainSource) || !statSync(mainSource).isFile()) {
    throw new Error(`Required Agent Debug artifact missing: ${mainName}`);
  }

  const requestSidecarResolution = resolveAgentDebugRequestSidecars(mainSource);
  const automaticSidecars = requestSidecarResolution.requiredSidecars.map(
    ({ role, sourceFile }) => ({
      role: `request-sidecar:${role}:${sourceFile}`,
      sourceName: sourceFile,
    }),
  );
  const automaticNames = new Set(automaticSidecars.map(({ sourceName }) => sourceName));
  const manuallyDuplicated = sidecars.find((sourceName) => automaticNames.has(sourceName));
  if (manuallyDuplicated !== undefined) {
    throw new Error(
      `--sidecar ${manuallyDuplicated} is already required by an llm_request reference`,
    );
  }

  const artifactSpecs = [
    { role: "main", sourceName: mainName },
    ...automaticSidecars,
    ...sidecars.map((sourceName) => ({
      role: `sidecar:${sourceName}`,
      sourceName,
    })),
  ];

  for (const spec of artifactSpecs) {
    const source = resolve(sessionDir, spec.sourceName);
    if (!existsSync(source) || !statSync(source).isFile()) {
      throw new Error(`Required Agent Debug artifact missing: ${spec.sourceName}`);
    }
  }

  const tempDir = `${outDir}.tmp-${process.pid}-${Date.now()}`;

  if (existsSync(tempDir)) {
    throw new Error("Temporary sealing directory unexpectedly exists");
  }

  mkdirSync(tempDir, { recursive: true });

  try {
    const artifacts = artifactSpecs.map((spec) => {
      const source = resolve(sessionDir, spec.sourceName);
      const sealedName = destinationName(spec.role, spec.sourceName);
      const destination = resolve(tempDir, sealedName);

      return sealOne({
        role: spec.role,
        source,
        destination,
      });
    });

    const invalid = artifacts.filter(({ valid }) => !valid);

    if (invalid.length > 0) {
      const labels = invalid.map(({ role }) => role).join(", ");
      throw new Error(
        `Agent Debug seal unstable for: ${labels}; refusing to retain snapshot`,
      );
    }

    const receipt = {
      format: "closureprobe-agent-debug-seal-v2",
      sealedAt: new Date().toISOString(),
      primaryArtifactRole: "main",
      sourceSessionDirectoryName: basename(sessionDir),
      artifactCount: artifacts.length,
      artifacts,
      requestSidecarResolution,
      invariant:
        "source-before SHA-256 == sealed-copy SHA-256 == source-after SHA-256",
      note:
        "Only receipt-bound sealed copies are eligible for v5 extraction, harness-isolation, or contamination evidence.",
    };

    writeFileSync(
      resolve(tempDir, "seal-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
      "utf8",
    );

    renameSync(tempDir, outDir);

    const finalNames = readdirSync(outDir).sort();

    process.stdout.write(
      `${JSON.stringify({
        format: receipt.format,
        status: "sealed",
        artifactCount: artifacts.length,
        sealedDirectory: outDir,
        files: finalNames,
        artifacts: artifacts.map((artifact) => ({
          role: artifact.role,
          sealedFile: artifact.sealedFile,
          sha256: artifact.sealedCopy.sha256,
          bytes: artifact.sealedCopy.bytes,
        })),
      }, null, 2)}\n`,
    );
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
}
