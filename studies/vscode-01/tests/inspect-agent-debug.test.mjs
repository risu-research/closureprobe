import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { inspectAgentDebug } from "../bin/inspect-agent-debug.mjs";

test("neutral Agent Debug inspector preserves frozen JSONL candidate extraction", (context) => {
  const directory = mkdtempSync(
    join(tmpdir(), "closureprobe-agent-debug-inspect-"),
  );
  context.after(() =>
    rmSync(directory, { recursive: true, force: true }),
  );

  const payload = {
    format: "closureprobe-evidence-status-v1",
    request: { q: "needle" },
    grounding: { sourceContext: {}, propositionScope: {} },
    observation: {
      execution: "success",
      cardinality: "zero",
    },
  };

  const claim = {
    study: "closureprobe-vscode-01",
    claim: "none",
  };

  const path = resolve(directory, "main.jsonl");

  const rows = [
    {
      kind: "tool_result",
      result: payload,
    },
    {
      kind: "llm_request",
      inputMessages: [
        {
          role: "tool",
          content: JSON.stringify(payload),
        },
      ],
    },
    {
      kind: "agent_response",
      response: JSON.stringify(claim),
    },
  ];

  writeFileSync(
    path,
    `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    "utf8",
  );

  const inspection = inspectAgentDebug(path);

  assert.equal(
    inspection.format,
    "closureprobe-agent-debug-inspection-v4",
  );
  assert.equal(
    inspection.parserCompatibility,
    "closureprobe-otlp-inspection-v3",
  );
  assert.match(
    inspection.sourceSha256,
    /^sha256:[a-f0-9]{64}$/,
  );

  const probeCandidates = inspection.candidates.filter(
    ({ kind }) => kind === "probe_payload",
  );
  const claimCandidates = inspection.candidates.filter(
    ({ kind }) => kind === "study_claim",
  );

  assert.equal(probeCandidates.length, 2);
  assert.equal(claimCandidates.length, 1);
  assert.equal(claimCandidates[0].claim, "none");

  assert.equal(
    JSON.stringify(inspection).includes("needle"),
    false,
  );
});
