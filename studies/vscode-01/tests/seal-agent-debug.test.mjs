import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const seal = resolve(studyRoot, "bin/seal-agent-debug.mjs");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "closureprobe-agent-debug-seal-"));
  const session = resolve(root, "session");
  const out = resolve(root, "sealed");

  mkdirSync(session, { recursive: true });
  writeFileSync(
    resolve(session, "main.jsonl"),
    `${JSON.stringify({ kind: "agent_response" })}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(session, "tools_0.json"),
    `${JSON.stringify({ tools: [] })}\n`,
    "utf8",
  );

  return { root, session, out };
}

function run(args) {
  return spawnSync(
    process.execPath,
    [seal, ...args],
    { encoding: "utf8" },
  );
}

function temporarySealResidue(root) {
  return readdirSync(root).filter((name) => name.includes(".tmp-"));
}

test("seals main.jsonl and an explicit contamination sidecar", (context) => {
  const { root, session, out } = fixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run([
    "--session-dir", session,
    "--out-dir", out,
    "--sidecar", "tools_0.json",
  ]);

  assert.equal(result.status, 0, result.stderr);

  const summary = JSON.parse(result.stdout);
  assert.equal(summary.format, "closureprobe-agent-debug-seal-v1");
  assert.equal(summary.status, "sealed");
  assert.equal(summary.artifactCount, 2);
  assert.deepEqual(
    summary.artifacts.map(({ role }) => role),
    ["main", "sidecar:tools_0.json"],
  );

  assert.equal(existsSync(resolve(out, "main.jsonl")), true);
  assert.equal(existsSync(resolve(out, "sidecar-tools_0.json")), true);
  assert.equal(existsSync(resolve(out, "seal-receipt.json")), true);
  assert.deepEqual(temporarySealResidue(root), []);
});

test("refuses to overwrite an existing sealed evidence directory", (context) => {
  const { root, session, out } = fixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const first = run([
    "--session-dir", session,
    "--out-dir", out,
    "--sidecar", "tools_0.json",
  ]);
  assert.equal(first.status, 0, first.stderr);

  const second = run([
    "--session-dir", session,
    "--out-dir", out,
    "--sidecar", "tools_0.json",
  ]);

  assert.equal(second.status, 2);
  assert.match(second.stderr, /refusing to overwrite sealed evidence/i);
  assert.deepEqual(temporarySealResidue(root), []);
});

test("refuses a session without main.jsonl", (context) => {
  const { root, session, out } = fixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));

  rmSync(resolve(session, "main.jsonl"));

  const result = run([
    "--session-dir", session,
    "--out-dir", out,
    "--sidecar", "tools_0.json",
  ]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /artifact missing: main\.jsonl/i);
  assert.equal(existsSync(out), false);
  assert.deepEqual(temporarySealResidue(root), []);
});

test("refuses a requested contamination sidecar that is absent", (context) => {
  const { root, session, out } = fixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run([
    "--session-dir", session,
    "--out-dir", out,
    "--sidecar", "missing.json",
  ]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /artifact missing: missing\.json/i);
  assert.equal(existsSync(out), false);
  assert.deepEqual(temporarySealResidue(root), []);
});

test("refuses duplicate sidecar declarations", (context) => {
  const { root, session, out } = fixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run([
    "--session-dir", session,
    "--out-dir", out,
    "--sidecar", "tools_0.json",
    "--sidecar", "tools_0.json",
  ]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /duplicate --sidecar/i);
  assert.equal(existsSync(out), false);
  assert.deepEqual(temporarySealResidue(root), []);
});

test("refuses sidecar path traversal instead of reading outside the session", (context) => {
  const { root, session, out } = fixture();
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const result = run([
    "--session-dir", session,
    "--out-dir", out,
    "--sidecar", "../outside.json",
  ]);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /plain filename, not a path/i);
  assert.equal(existsSync(out), false);
  assert.deepEqual(temporarySealResidue(root), []);
});
