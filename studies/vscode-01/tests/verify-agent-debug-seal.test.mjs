import assert from "node:assert/strict";
import {
  appendFileSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { verifyAgentDebugSeal } from "../bin/verify-agent-debug-seal.mjs";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const seal = resolve(studyRoot, "bin/seal-agent-debug.mjs");

function sealedFixture() {
  const root = mkdtempSync(
    join(tmpdir(), "closureprobe-agent-debug-verify-"),
  );
  const session = resolve(root, "session");
  const sealed = resolve(root, "sealed");

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

  const result = spawnSync(
    process.execPath,
    [
      seal,
      "--session-dir", session,
      "--out-dir", sealed,
      "--sidecar", "tools_0.json",
    ],
    { encoding: "utf8" },
  );

  assert.equal(result.status, 0, result.stderr);

  return {
    root,
    sealed,
    receipt: resolve(sealed, "seal-receipt.json"),
  };
}

test("verifies a closed three-hash Agent Debug bundle", (context) => {
  const fixture = sealedFixture();
  context.after(() =>
    rmSync(fixture.root, { recursive: true, force: true }),
  );

  const verification = verifyAgentDebugSeal(fixture.receipt);

  assert.equal(
    verification.format,
    "closureprobe-agent-debug-seal-verification-v1",
  );
  assert.equal(verification.artifactCount, 2);
  assert.equal(verification.mainArtifact.role, "main");
  assert.equal(verification.mainArtifact.sealedFile, "main.jsonl");
  assert.match(
    verification.receiptSha256,
    /^sha256:[a-f0-9]{64}$/,
  );
});

test("rejects post-seal mutation of main.jsonl", (context) => {
  const fixture = sealedFixture();
  context.after(() =>
    rmSync(fixture.root, { recursive: true, force: true }),
  );

  appendFileSync(
    resolve(fixture.sealed, "main.jsonl"),
    `${JSON.stringify({ mutated: true })}\n`,
    "utf8",
  );

  assert.throws(
    () => verifyAgentDebugSeal(fixture.receipt),
    /artifact digest mismatch: main\.jsonl/i,
  );
});

test("rejects post-seal mutation of a contamination sidecar", (context) => {
  const fixture = sealedFixture();
  context.after(() =>
    rmSync(fixture.root, { recursive: true, force: true }),
  );

  appendFileSync(
    resolve(fixture.sealed, "sidecar-tools_0.json"),
    "\n",
    "utf8",
  );

  assert.throws(
    () => verifyAgentDebugSeal(fixture.receipt),
    /artifact digest mismatch: sidecar-tools_0\.json/i,
  );
});

test("rejects files added to the sealed bundle after sealing", (context) => {
  const fixture = sealedFixture();
  context.after(() =>
    rmSync(fixture.root, { recursive: true, force: true }),
  );

  writeFileSync(
    resolve(fixture.sealed, "unbound.json"),
    "{}\n",
    "utf8",
  );

  assert.throws(
    () => verifyAgentDebugSeal(fixture.receipt),
    /contains unbound files or directories/i,
  );
});
