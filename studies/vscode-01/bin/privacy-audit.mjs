#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = process.argv[2];
if (path === undefined) {
  process.stderr.write("Usage: privacy-audit.mjs CAPTURE\n");
  process.exit(64);
}

const absolute = resolve(path);
const bytes = readFileSync(absolute);
const text = bytes.toString("utf8");
const rules = [
  ["bearer_token", /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi],
  ["github_token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
  ["credential_assignment", /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"'\s]{8,}["']/gi],
  ["email_address", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi],
  ["windows_user_path", /\b[A-Z]:\\Users\\[^\\\s"']+/gi],
  ["unix_home_path", /\/(?:Users|home)\/[^/\s"']+/g],
];

const findings = rules.map(([code, pattern]) => ({
  code,
  count: [...text.matchAll(pattern)].length,
})).filter(({ count }) => count > 0);

const result = {
  format: "closureprobe-private-capture-audit-v1",
  source: absolute,
  sourceByteLength: bytes.byteLength,
  sourceSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  findings,
  publishableAsRaw: findings.length === 0,
  note: "A zero regex finding is necessary but not sufficient; manually inspect a minimal extract before publication.",
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = findings.length === 0 ? 0 : 2;
