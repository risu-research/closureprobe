#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import {
  basename,
  dirname,
  resolve,
} from "node:path";
import { pathToFileURL } from "node:url";

import { resolveAgentDebugRequestSidecars } from "./resolve-agent-debug-sidecars.mjs";

function digestBytes(bytes) {
  return {
    bytes: bytes.byteLength,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
}

function requireObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

function requireDigest(value, label) {
  const digest = requireString(value, label);
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return digest;
}

function requireByteLength(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function requirePlainFilename(value, label) {
  const filename = requireString(value, label);
  if (
    basename(filename) !== filename ||
    filename === "." ||
    filename === ".."
  ) {
    throw new Error(`${label} must be a plain filename`);
  }
  return filename;
}

function verifyTriplet(record, label) {
  const sourceBefore = requireObject(
    record.sourceBefore,
    `${label}.sourceBefore`,
  );
  const sealedCopy = requireObject(
    record.sealedCopy,
    `${label}.sealedCopy`,
  );
  const sourceAfter = requireObject(
    record.sourceAfter,
    `${label}.sourceAfter`,
  );

  const beforeHash = requireDigest(
    sourceBefore.sha256,
    `${label}.sourceBefore.sha256`,
  );
  const sealedHash = requireDigest(
    sealedCopy.sha256,
    `${label}.sealedCopy.sha256`,
  );
  const afterHash = requireDigest(
    sourceAfter.sha256,
    `${label}.sourceAfter.sha256`,
  );

  const beforeBytes = requireByteLength(
    sourceBefore.bytes,
    `${label}.sourceBefore.bytes`,
  );
  const sealedBytes = requireByteLength(
    sealedCopy.bytes,
    `${label}.sealedCopy.bytes`,
  );
  const afterBytes = requireByteLength(
    sourceAfter.bytes,
    `${label}.sourceAfter.bytes`,
  );

  if (
    beforeHash !== sealedHash ||
    sealedHash !== afterHash ||
    beforeBytes !== sealedBytes ||
    sealedBytes !== afterBytes
  ) {
    throw new Error(`${label} does not satisfy the three-hash seal invariant`);
  }

  if (record.valid !== true) {
    throw new Error(`${label}.valid must be true`);
  }

  return {
    sha256: sealedHash,
    bytes: sealedBytes,
  };
}

export function verifyAgentDebugSeal(receiptPath) {
  const absoluteReceipt = resolve(receiptPath);

  if (
    !existsSync(absoluteReceipt) ||
    !statSync(absoluteReceipt).isFile()
  ) {
    throw new Error("Agent Debug seal receipt does not exist");
  }

  if (basename(absoluteReceipt) !== "seal-receipt.json") {
    throw new Error("Agent Debug seal receipt must be named seal-receipt.json");
  }

  const receiptBytes = readFileSync(absoluteReceipt);
  let receipt;

  try {
    receipt = JSON.parse(receiptBytes.toString("utf8"));
  } catch {
    throw new Error("Agent Debug seal receipt is not valid JSON");
  }

  requireObject(receipt, "receipt");

  if (
    receipt.format !== "closureprobe-agent-debug-seal-v1" &&
    receipt.format !== "closureprobe-agent-debug-seal-v2"
  ) {
    throw new Error("Unexpected Agent Debug seal receipt format");
  }

  if (receipt.primaryArtifactRole !== "main") {
    throw new Error("Agent Debug seal primaryArtifactRole must be main");
  }

  if (!Array.isArray(receipt.artifacts) || receipt.artifacts.length === 0) {
    throw new Error("Agent Debug seal receipt must contain artifacts");
  }

  if (receipt.artifactCount !== receipt.artifacts.length) {
    throw new Error("Agent Debug seal artifactCount mismatch");
  }

  const directory = dirname(absoluteReceipt);
  const roles = new Set();
  const sealedFiles = new Set();
  const verifiedArtifacts = [];

  for (let index = 0; index < receipt.artifacts.length; index += 1) {
    const artifact = requireObject(
      receipt.artifacts[index],
      `artifacts[${index}]`,
    );

    const role = requireString(
      artifact.role,
      `artifacts[${index}].role`,
    );
    const sourceFile = requirePlainFilename(
      artifact.sourceFile,
      `artifacts[${index}].sourceFile`,
    );
    const sealedFile = requirePlainFilename(
      artifact.sealedFile,
      `artifacts[${index}].sealedFile`,
    );

    if (roles.has(role)) {
      throw new Error(`Duplicate Agent Debug artifact role: ${role}`);
    }
    if (sealedFiles.has(sealedFile)) {
      throw new Error(`Duplicate Agent Debug sealed filename: ${sealedFile}`);
    }

    roles.add(role);
    sealedFiles.add(sealedFile);

    const sealed = verifyTriplet(
      artifact,
      `artifacts[${index}]`,
    );

    const artifactPath = resolve(directory, sealedFile);

    if (
      !existsSync(artifactPath) ||
      !statSync(artifactPath).isFile()
    ) {
      throw new Error(`Sealed Agent Debug artifact missing: ${sealedFile}`);
    }

    const actual = digestBytes(readFileSync(artifactPath));

    if (
      actual.sha256 !== sealed.sha256 ||
      actual.bytes !== sealed.bytes
    ) {
      throw new Error(
        `Sealed Agent Debug artifact digest mismatch: ${sealedFile}`,
      );
    }

    verifiedArtifacts.push({
      role,
      sourceFile,
      sealedFile,
      sha256: sealed.sha256,
      bytes: sealed.bytes,
    });
  }

  const mainArtifacts = verifiedArtifacts.filter(
    ({ role }) => role === "main",
  );

  if (mainArtifacts.length !== 1) {
    throw new Error("Agent Debug seal must contain exactly one main artifact");
  }

  if (mainArtifacts[0].sealedFile !== "main.jsonl") {
    throw new Error("Agent Debug main artifact must be sealed as main.jsonl");
  }
  if (mainArtifacts[0].sourceFile !== "main.jsonl") {
    throw new Error("Agent Debug main artifact source must be main.jsonl");
  }

  let requestSidecarResolution = null;
  if (receipt.format === "closureprobe-agent-debug-seal-v2") {
    const sealedMainPath = resolve(directory, mainArtifacts[0].sealedFile);
    const recomputed = resolveAgentDebugRequestSidecars(sealedMainPath);
    if (JSON.stringify(receipt.requestSidecarResolution) !== JSON.stringify(recomputed)) {
      throw new Error("Agent Debug request-sidecar resolution differs from sealed main.jsonl");
    }
    const requiredRoles = new Set(recomputed.requiredSidecars.map(
      ({ role, sourceFile }) => `request-sidecar:${role}:${sourceFile}`,
    ));
    const boundRequestRoles = new Set(verifiedArtifacts
      .filter(({ role }) => role.startsWith("request-sidecar:"))
      .map(({ role }) => role));
    if (
      requiredRoles.size !== boundRequestRoles.size ||
      [...requiredRoles].some((role) => !boundRequestRoles.has(role))
    ) {
      throw new Error("Agent Debug request-sidecar artifacts do not match resolved references");
    }
    for (const { role, sourceFile } of recomputed.requiredSidecars) {
      const expectedRole = `request-sidecar:${role}:${sourceFile}`;
      const artifact = verifiedArtifacts.find((candidate) => candidate.role === expectedRole);
      if (artifact?.sourceFile !== sourceFile) {
        throw new Error("Agent Debug request-sidecar source filename differs from its reference");
      }
    }
    requestSidecarResolution = recomputed;
  }

  const expectedNames = new Set([
    "seal-receipt.json",
    ...verifiedArtifacts.map(({ sealedFile }) => sealedFile),
  ]);

  const actualNames = readdirSync(directory).sort();

  if (
    actualNames.length !== expectedNames.size ||
    actualNames.some((name) => !expectedNames.has(name))
  ) {
    throw new Error(
      "Agent Debug sealed directory contains unbound files or directories",
    );
  }

  const receiptDigest = digestBytes(receiptBytes);

  return {
    format: receipt.format === "closureprobe-agent-debug-seal-v2"
      ? "closureprobe-agent-debug-seal-verification-v2"
      : "closureprobe-agent-debug-seal-verification-v1",
    receiptSha256: receiptDigest.sha256,
    receiptBytes: receiptDigest.bytes,
    artifactCount: verifiedArtifacts.length,
    mainArtifact: mainArtifacts[0],
    artifacts: verifiedArtifacts,
    requestSidecarResolution,
    invariant:
      "receipt-bound sealed copies match source-before, sealed-copy, and source-after SHA-256 values",
  };
}

const invokedPath =
  process.argv[1] === undefined
    ? undefined
    : pathToFileURL(resolve(process.argv[1])).href;

if (invokedPath === import.meta.url) {
  const receiptPath = process.argv[2];

  if (receiptPath === undefined) {
    process.stderr.write(
      "Usage: verify-agent-debug-seal.mjs SEAL_RECEIPT_JSON\n",
    );
    process.exit(64);
  }

  try {
    process.stdout.write(
      `${JSON.stringify(verifyAgentDebugSeal(receiptPath), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}
