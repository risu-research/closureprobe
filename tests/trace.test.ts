import assert from "node:assert/strict";
import { test } from "node:test";

import { sha256Digest } from "../src/canonical.js";
import { assessWithProfile } from "../src/profiles.js";
import { createProbePayload } from "../src/probe.js";
import { bindProposition } from "../src/proposition.js";
import { analyzeTrace } from "../src/trace.js";
import type { ClosureTrace, NegativeProposition } from "../src/types.js";

const proposition: NegativeProposition = {
  subject: { collection: "documents" },
  predicate: { q: "needle" },
  scope: { tenant: "fixture" },
};

test("trace analysis separates guard loss from a bound unlicensed claim", () => {
  const request = { q: "needle" };
  const source = createProbePayload("continued-zero", request).observation;
  const trace: ClosureTrace = {
    traceId: "loss-separation",
    request,
    proposition,
    stages: [
      {
        stageId: "wire",
        kind: "mcp_wire",
        observation: source,
        claim: { status: "unknown" },
      },
      {
        stageId: "model",
        kind: "model_projection",
        observation: {
          ...source,
          coverage: "unknown",
          continuation: "unknown",
          traversalBinding: { ...source.traversalBinding, status: "unknown" },
        },
        claim: { status: "none", propositionBinding: bindProposition(proposition) },
      },
    ],
  };
  const analysis = analyzeTrace(trace);
  assert.equal(analysis.firstGuardSignalLoss?.boundary, "wire->model");
  assert.equal(analysis.firstUnlicensedNegative?.stageId, "model");
  assert.deepEqual(
    analysis.findings.map(({ code }) => code).sort(),
    ["guard_signal_loss", "guard_signal_loss", "guard_signal_loss", "unlicensed_negative"].sort(),
  );
});

test("naked NONE is rejected even when the local observation is otherwise licensed", () => {
  const request = { q: "needle" };
  const analysis = analyzeTrace({
    traceId: "naked-none",
    request,
    proposition,
    stages: [{
      stageId: "agent",
      kind: "agent_claim",
      observation: createProbePayload("complete-zero", request).observation,
      claim: { status: "none" },
    }],
  });
  assert.deepEqual(
    analysis.findings.map(({ code }) => code),
    ["claim_binding_missing", "unlicensed_negative"],
  );
});

test("a claim bound to a broader proposition is rejected", () => {
  const request = { q: "needle" };
  const broader: NegativeProposition = {
    ...proposition,
    scope: { tenant: "all-tenants" },
  };
  const analysis = analyzeTrace({
    traceId: "broadened-none",
    request,
    proposition,
    stages: [{
      stageId: "agent",
      kind: "agent_claim",
      observation: createProbePayload("complete-zero", request).observation,
      claim: { status: "none", propositionBinding: bindProposition(broader) },
    }],
  });
  assert.deepEqual(
    analysis.findings.map(({ code }) => code),
    ["claim_binding_mismatch", "unlicensed_negative"],
  );
});

test("trace request is rehashed by the receiver", () => {
  const request = { q: "needle" };
  const observation = createProbePayload("complete-zero", request).observation;
  assert.equal(observation.queryBinding.requestDigest, sha256Digest(request));
  const analysis = analyzeTrace({
    traceId: "wrong-binding",
    request: { q: "different" },
    proposition,
    stages: [{
      stageId: "adapter",
      kind: "adapter",
      observation,
      claim: { status: "unknown" },
    }],
  });
  assert.equal(analysis.findings[0]?.code, "query_binding_mismatch");
});

test("self-declared evidence cannot suppress an unsupported upgrade", () => {
  const request = { q: "needle" };
  const partial = createProbePayload("continued-zero", request).observation;
  const completeResponse = {
    execution: "success",
    items: [],
    coverage: "complete",
    continuation: "exhausted",
    scopeBinding: "exact",
    traversalStatus: "single_page_complete",
  };
  const complete = assessWithProfile("generic-enumeration", request, completeResponse);
  const analysis = analyzeTrace({
    traceId: "forged-evidence",
    request,
    proposition,
    stages: [
      { stageId: "source", kind: "source", observation: partial, claim: { status: "unknown" } },
      {
        stageId: "adapter",
        kind: "adapter",
        observation: complete,
        claim: { status: "none", propositionBinding: bindProposition(proposition) },
        evidenceIntroduction: {
          profileId: "generic-enumeration",
          profileVersion: "0.2.0",
          request,
          response: completeResponse,
          requestDigest: sha256Digest(request),
          responseDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        },
      },
    ],
  });
  assert.ok(analysis.findings.some(({ code }) => code === "unverified_evidence_introduction"));
  assert.ok(analysis.findings.some(({ code }) => code === "unsupported_upgrade"));
});

test("receiver-revalidated evidence permits a legitimate closure upgrade", () => {
  const request = { q: "needle" };
  const response = {
    execution: "success",
    items: [],
    coverage: "complete",
    continuation: "exhausted",
    scopeBinding: "exact",
    traversalStatus: "single_page_complete",
  };
  const complete = assessWithProfile("generic-enumeration", request, response);
  const partial = createProbePayload("continued-zero", request).observation;
  const analysis = analyzeTrace({
    traceId: "validated-upgrade",
    request,
    proposition,
    stages: [
      { stageId: "page-1", kind: "source", observation: partial, claim: { status: "unknown" } },
      {
        stageId: "reassessment",
        kind: "source",
        observation: complete,
        claim: { status: "none", propositionBinding: bindProposition(proposition) },
        evidenceIntroduction: {
          profileId: "generic-enumeration",
          profileVersion: "0.2.0",
          request,
          response,
          requestDigest: sha256Digest(request),
          responseDigest: sha256Digest(response),
        },
      },
    ],
  });
  assert.equal(analysis.conformant, true);
});
