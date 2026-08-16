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

import { resolveAgentDebugEvidence } from "../bin/resolve-agent-debug-evidence.mjs";
import { verifyAgentDebugSeal } from "../bin/verify-agent-debug-seal.mjs";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const seal = resolve(studyRoot, "bin/seal-agent-debug.mjs");

function fixture() {
  const root = mkdtempSync(
    join(tmpdir(), "closureprobe-agent-debug-resolve-"),
  );

  const session = resolve(root, "session");
  const sealed = resolve(root, "sealed");
  const selectionPath = resolve(root, "selection.json");

  mkdirSync(session, { recursive: true });

  writeFileSync(
    resolve(session, "main.jsonl"),
    `${JSON.stringify({
      kind: "agent_response",
      response: JSON.stringify({
        study: "closureprobe-vscode-01",
        claim: "none",
      }),
    })}\n`,
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

  const receiptPath = resolve(
    sealed,
    "seal-receipt.json",
  );

  const verification =
    verifyAgentDebugSeal(receiptPath);

  return {
    root,
    session,
    sealed,
    selectionPath,
    selection: {
      agentDebugSealReceipt:
        "sealed/seal-receipt.json",
      agentDebugSealReceiptSha256:
        verification.receiptSha256,
    },
  };
}

test("derives the eligible main artifact only from the verified seal receipt", (context) => {
  const f = fixture();
  context.after(() =>
    rmSync(f.root, { recursive: true, force: true }),
  );

  const resolved = resolveAgentDebugEvidence(
    f.selectionPath,
    f.selection,
  );

  assert.equal(
    resolved.sealVerification.mainArtifact.role,
    "main",
  );
  assert.equal(
    resolved.artifactPath,
    resolve(f.sealed, "main.jsonl"),
  );
  assert.equal(
    resolved.inspection.sourceSha256,
    resolved.sealVerification.mainArtifact.sha256,
  );
  assert.equal(
    resolved.auxiliaryArtifacts.length,
    1,
  );
});

test("rejects a selection with the wrong seal receipt hash", (context) => {
  const f = fixture();
  context.after(() =>
    rmSync(f.root, { recursive: true, force: true }),
  );

  assert.throws(
    () =>
      resolveAgentDebugEvidence(
        f.selectionPath,
        {
          ...f.selection,
          agentDebugSealReceiptSha256:
            `sha256:${"0".repeat(64)}`,
        },
      ),
    /seal receipt digest does not match/i,
  );
});

test("rejects the legacy OTLP direct-evidence route", (context) => {
  const f = fixture();
  context.after(() =>
    rmSync(f.root, { recursive: true, force: true }),
  );

  assert.throws(
    () =>
      resolveAgentDebugEvidence(
        f.selectionPath,
        {
          ...f.selection,
          otlpExport: "session/main.jsonl",
          otlpSha256: `sha256:${"0".repeat(64)}`,
        },
      ),
    /not permitted by the v4 sealed-receipt evidence contract/i,
  );
});

test("rejects a redundant direct Agent Debug artifact route", (context) => {
  const f = fixture();
  context.after(() =>
    rmSync(f.root, { recursive: true, force: true }),
  );

  assert.throws(
    () =>
      resolveAgentDebugEvidence(
        f.selectionPath,
        {
          ...f.selection,
          agentDebugArtifact: "session/main.jsonl",
        },
      ),
    /not permitted by the v4 sealed-receipt evidence contract/i,
  );
});

test("rejects post-seal mutation before inspection", (context) => {
  const f = fixture();
  context.after(() =>
    rmSync(f.root, { recursive: true, force: true }),
  );

  appendFileSync(
    resolve(f.sealed, "main.jsonl"),
    `${JSON.stringify({ mutated: true })}\n`,
    "utf8",
  );

  assert.throws(
    () =>
      resolveAgentDebugEvidence(
        f.selectionPath,
        f.selection,
      ),
    /artifact digest mismatch: main\.jsonl/i,
  );
});
