import assert from "node:assert/strict";
import { test } from "node:test";

import { sha256Digest } from "../src/canonical.js";
import { createProbePayload } from "../src/probe.js";
import { analyzeTrace } from "../src/trace.js";
import type { ClosureTrace } from "../src/types.js";

test("trace analysis separates guard loss from the downstream unlicensed claim", () => {
  const request = { q: "needle" };
  const source = createProbePayload("continued-zero", request).observation;
  const trace: ClosureTrace = {
    traceId: "loss-separation",
    request,
    stages: [
      {
        stageId: "wire",
        kind: "mcp_wire",
        observation: source,
        claim: "unknown",
        introducedValidatedEvidence: false,
      },
      {
        stageId: "model",
        kind: "model_projection",
        observation: { ...source, coverage: "unknown", continuation: "unknown" },
        claim: "none",
        introducedValidatedEvidence: false,
      },
    ],
  };
  const analysis = analyzeTrace(trace);
  assert.equal(analysis.firstGuardSignalLoss?.boundary, "wire->model");
  assert.equal(analysis.firstUnlicensedNegative?.stageId, "model");
  assert.deepEqual(
    analysis.findings.map(({ code }) => code).sort(),
    ["guard_signal_loss", "guard_signal_loss", "unlicensed_negative"].sort(),
  );
});

test("trace request is rehashed by the receiver", () => {
  const request = { q: "needle" };
  const observation = createProbePayload("complete-zero", request).observation;
  assert.equal(observation.queryBinding.requestDigest, sha256Digest(request));
  const analysis = analyzeTrace({
    traceId: "wrong-binding",
    request: { q: "different" },
    stages: [{
      stageId: "adapter",
      kind: "adapter",
      observation,
      claim: "unknown",
      introducedValidatedEvidence: false,
    }],
  });
  assert.equal(analysis.findings[0]?.code, "query_binding_mismatch");
});

test("independently validated evidence permits a legitimate closure upgrade", () => {
  const request = { q: "needle" };
  const partial = createProbePayload("continued-zero", request).observation;
  const complete = createProbePayload("complete-zero", request).observation;
  const analysis = analyzeTrace({
    traceId: "validated-upgrade",
    request,
    stages: [
      { stageId: "page-1", kind: "source", observation: partial, claim: "unknown", introducedValidatedEvidence: false },
      { stageId: "page-2", kind: "source", observation: complete, claim: "none", introducedValidatedEvidence: true },
    ],
  });
  assert.equal(analysis.conformant, true);
});
