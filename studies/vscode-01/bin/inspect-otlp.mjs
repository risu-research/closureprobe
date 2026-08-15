#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { sha256Digest } from "../../../dist/src/index.js";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const study = JSON.parse(readFileSync(resolve(studyRoot, "study.json"), "utf8"));
const claims = new Set(["none", "unknown"]);

function pointerPart(value) {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function parseDocument(bytes) {
  const text = bytes.toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    const values = text.split(/\r?\n/).filter((line) => line.trim().length > 0).map((line) => JSON.parse(line));
    return { _closureprobeJsonLines: values };
  }
}

function decodedStrings(value) {
  if (typeof value !== "string" || value.length > 1_000_000) return [];
  const candidates = [{ encoding: "json-string", text: value.trim() }];
  const fence = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence?.[1] !== undefined) candidates.push({ encoding: "fenced-json", text: fence[1] });
  const decoded = [];
  for (const candidate of candidates) {
    if (!candidate.text.startsWith("{") && !candidate.text.startsWith("[")) continue;
    try {
      decoded.push({ encoding: candidate.encoding, value: JSON.parse(candidate.text) });
    } catch {
      // Only exact JSON candidates are surfaced; unrelated strings remain private.
    }
  }
  return decoded;
}

function isProbePayload(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    value.format === "closureprobe-evidence-status-v1" &&
    Object.keys(value).every((key) =>
      ["format", "request", "grounding", "observation"].includes(key)
    ) &&
    value.observation !== null &&
    typeof value.observation === "object" &&
    !Array.isArray(value.observation);
}

function isStudyClaim(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    value.study === study.studyId &&
    claims.has(value.claim) &&
    Object.keys(value).length === 2 &&
    Object.keys(value).every((key) => ["study", "claim"].includes(key));
}

export function inspectOtlp(path, options = {}) {
  const absolute = resolve(path);
  const bytes = readFileSync(absolute);
  const document = parseDocument(bytes);
  const candidates = [];
  const seen = new Set();

  function visit(value, pointer, encoding = "native", depth = 0) {
    if (depth > 80) return;
    let controlledCandidate = false;
    if (isProbePayload(value)) {
      controlledCandidate = true;
      const key = `probe:${pointer}:${encoding}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          kind: "probe_payload",
          pointer,
          encoding,
          payloadDigest: sha256Digest(value),
          observationDigest: sha256Digest(value.observation),
          ...(options.includeValues === true ? { value } : {}),
        });
      }
    }
    let claimCandidate = false;
    // Markdown-fenced JSON is useful when locating embedded tool payloads, but
    // the preregistered final-response contract requires a native object or a
    // whole-string JSON object. A fenced claim is therefore never scorable.
    if (isStudyClaim(value) && encoding !== "fenced-json") {
      claimCandidate = true;
      const key = `claim:${pointer}:${encoding}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          kind: "study_claim",
          pointer,
          encoding,
          claim: value.claim,
          claimDigest: sha256Digest(value),
          ...(options.includeValues === true ? { value } : {}),
        });
      }
    }
    if (!controlledCandidate && !claimCandidate) {
      const key = `value:${pointer}:${encoding}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push({
          kind: "json_value",
          pointer,
          encoding,
          valueType: value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
          valueDigest: sha256Digest(value),
          ...(options.includeValues === true ? { value } : {}),
        });
      }
    }
    if (typeof value === "string") {
      for (const decoded of decodedStrings(value)) {
        visit(decoded.value, `${pointer}/~decoded`, decoded.encoding, depth + 1);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, `${pointer}/${index}`, encoding, depth + 1));
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        visit(child, `${pointer}/${pointerPart(key)}`, encoding, depth + 1);
      }
    }
  }

  visit(document, "");
  return {
    format: "closureprobe-otlp-inspection-v3",
    source: absolute,
    sourceByteLength: bytes.byteLength,
    sourceSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    candidateCount: candidates.length,
    candidates,
    note: "Exact controlled candidates are labeled; other JSON values expose only pointer, type, and digest unless includeValues is explicitly requested by the local normalizer.",
  };
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  const path = process.argv[2];
  if (path === undefined) {
    process.stderr.write("Usage: inspect-otlp.mjs OTLP_JSON\n");
    process.exit(64);
  }
  process.stdout.write(`${JSON.stringify(inspectOtlp(path), null, 2)}\n`);
}
