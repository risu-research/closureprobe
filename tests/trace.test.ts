import assert from "node:assert/strict";
import { test } from "node:test";

import { sha256Digest } from "../src/canonical.js";
import { createProbePayload, type ProbeScenario } from "../src/probe.js";
import { bindProposition } from "../src/proposition.js";
import { analyzeTrace } from "../src/trace.js";
import type {
  ClosureTrace,
  EvidenceIntroduction,
  NegativeProposition,
  SourceContextIdentity,
  SourceGrounding,
} from "../src/types.js";

const sourceContext: SourceContextIdentity = {
  producer: "closureprobe-controlled-probe",
  instance: { server: "fixture" },
  authority: { principal: "fixture-user" },
};

const proposition: NegativeProposition = {
  subject: { collection: "documents" },
  predicate: { q: "needle" },
  scope: { tenant: "fixture" },
};

const grounding: SourceGrounding = {
  sourceContext,
  propositionScope: proposition.scope,
};

function evidence(
  scenario: ProbeScenario,
  request: ClosureTrace["request"],
  responseDigest = sha256Digest({ scenario }),
): EvidenceIntroduction {
  return {
    profileId: "closureprobe-controlled-probe",
    profileVersion: "0.3.0",
    request,
    response: { scenario },
    grounding,
    requestDigest: sha256Digest(request),
    responseDigest,
  };
}

function baseTrace(
  traceId: string,
  scenario: ProbeScenario,
  request: ClosureTrace["request"] = { q: "needle" },
): Omit<ClosureTrace, "stages"> {
  return {
    traceId,
    request,
    sourceContext,
    proposition,
    rootEvidence: evidence(scenario, request),
  };
}

test("trace analysis separates guard loss from a bound unlicensed claim", () => {
  const request = { q: "needle" };
  const source = createProbePayload("continued-zero", request, grounding).observation;
  const trace: ClosureTrace = {
    ...baseTrace("loss-separation", "continued-zero", request),
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
        claim: {
          status: "none",
          propositionBinding: bindProposition(proposition, sourceContext),
        },
      },
    ],
  };
  const analysis = analyzeTrace(trace);
  assert.equal(analysis.firstGuardSignalLoss?.boundary, "wire->model");
  assert.equal(analysis.firstUnlicensedNegative?.stageId, "model");
  assert.equal(analysis.stages[0]?.evidenceAnchored, true);
  assert.deepEqual(
    analysis.findings.map(({ code }) => code).sort(),
    ["guard_signal_loss", "guard_signal_loss", "guard_signal_loss", "unlicensed_negative"].sort(),
  );
});

test("naked NONE is rejected even when root evidence is anchored", () => {
  const request = { q: "needle" };
  const analysis = analyzeTrace({
    ...baseTrace("naked-none", "complete-zero", request),
    stages: [{
      stageId: "agent",
      kind: "agent_claim",
      observation: createProbePayload("complete-zero", request, grounding).observation,
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
    ...baseTrace("broadened-none", "complete-zero", request),
    stages: [{
      stageId: "agent",
      kind: "agent_claim",
      observation: createProbePayload("complete-zero", request, grounding).observation,
      claim: {
        status: "none",
        propositionBinding: bindProposition(broader, sourceContext),
      },
    }],
  });
  assert.deepEqual(
    analysis.findings.map(({ code }) => code),
    ["claim_binding_mismatch", "unlicensed_negative"],
  );
});

test("trace request and root evidence are independently receiver-checked", () => {
  const evidenceRequest = { q: "needle" };
  const traceRequest = { q: "different" };
  const observation = createProbePayload("complete-zero", evidenceRequest, grounding).observation;
  const analysis = analyzeTrace({
    traceId: "wrong-binding",
    request: traceRequest,
    sourceContext,
    proposition,
    rootEvidence: evidence("complete-zero", evidenceRequest),
    stages: [{
      stageId: "adapter",
      kind: "adapter",
      observation,
      claim: { status: "unknown" },
    }],
  });
  assert.ok(analysis.findings.some(({ code }) => code === "unanchored_root_evidence"));
  assert.ok(analysis.findings.some(({ code }) => code === "query_binding_mismatch"));
});

test("a self-declared root profile validation cannot anchor NONE", () => {
  const request = { q: "needle" };
  const analysis = analyzeTrace({
    ...baseTrace("forged-root", "complete-zero", request),
    rootEvidence: evidence(
      "complete-zero",
      request,
      "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    ),
    stages: [{
      stageId: "source",
      kind: "source",
      observation: createProbePayload("complete-zero", request, grounding).observation,
      claim: {
        status: "none",
        propositionBinding: bindProposition(proposition, sourceContext),
      },
      evidenceIntroduction: evidence("complete-zero", request),
    }],
  });
  assert.deepEqual(
    analysis.findings.map(({ code }) => code),
    ["unanchored_root_evidence", "unlicensed_negative"],
  );
  assert.equal(analysis.stages[0]?.evidenceAnchored, false);
});

test("scope or source-context drift breaks the anchored chain", () => {
  const request = { q: "needle" };
  const source = createProbePayload("complete-zero", request, grounding).observation;
  const otherGrounding: SourceGrounding = {
    ...grounding,
    propositionScope: { tenant: "all-tenants" },
  };
  const drifted = createProbePayload("complete-zero", request, otherGrounding).observation;
  const analysis = analyzeTrace({
    ...baseTrace("scope-drift", "complete-zero", request),
    stages: [
      { stageId: "source", kind: "source", observation: source, claim: { status: "unknown" } },
      {
        stageId: "claim",
        kind: "agent_claim",
        observation: drifted,
        claim: {
          status: "none",
          propositionBinding: bindProposition(proposition, sourceContext),
        },
      },
    ],
  });
  assert.ok(analysis.findings.some(({ code }) => code === "grounding_binding_mismatch"));
  assert.ok(analysis.findings.some(({ code }) => code === "unlicensed_negative"));
  assert.equal(analysis.stages[1]?.evidenceAnchored, false);
});

test("source profile substitution without reconstructed evidence breaks the chain", () => {
  const request = { q: "needle" };
  const source = createProbePayload("complete-zero", request, grounding).observation;
  const analysis = analyzeTrace({
    ...baseTrace("profile-drift", "complete-zero", request),
    stages: [
      { stageId: "source", kind: "source", observation: source, claim: { status: "unknown" } },
      {
        stageId: "adapter",
        kind: "adapter",
        observation: { ...source, profileId: "forged-profile" },
        claim: {
          status: "none",
          propositionBinding: bindProposition(proposition, sourceContext),
        },
      },
    ],
  });
  assert.ok(analysis.findings.some(({ code }) => code === "profile_binding_change"));
  assert.ok(analysis.findings.some(({ code }) => code === "unlicensed_negative"));
});

test("forged introduced evidence cannot suppress an unsupported upgrade", () => {
  const request = { q: "needle" };
  const partial = createProbePayload("continued-zero", request, grounding).observation;
  const complete = createProbePayload("complete-zero", request, grounding).observation;
  const analysis = analyzeTrace({
    ...baseTrace("forged-evidence", "continued-zero", request),
    stages: [
      { stageId: "source", kind: "source", observation: partial, claim: { status: "unknown" } },
      {
        stageId: "adapter",
        kind: "adapter",
        observation: complete,
        claim: {
          status: "none",
          propositionBinding: bindProposition(proposition, sourceContext),
        },
        evidenceIntroduction: evidence(
          "complete-zero",
          request,
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        ),
      },
    ],
  });
  assert.ok(analysis.findings.some(({ code }) => code === "unverified_evidence_introduction"));
  assert.ok(analysis.findings.some(({ code }) => code === "unsupported_upgrade"));
  assert.ok(analysis.findings.some(({ code }) => code === "unlicensed_negative"));
});

test("receiver-reconstructed evidence permits a legitimate closure upgrade", () => {
  const request = { q: "needle" };
  const partial = createProbePayload("continued-zero", request, grounding).observation;
  const complete = createProbePayload("complete-zero", request, grounding).observation;
  const analysis = analyzeTrace({
    ...baseTrace("validated-upgrade", "continued-zero", request),
    stages: [
      { stageId: "page-1", kind: "source", observation: partial, claim: { status: "unknown" } },
      {
        stageId: "reassessment",
        kind: "source",
        observation: complete,
        claim: {
          status: "none",
          propositionBinding: bindProposition(proposition, sourceContext),
        },
        evidenceIntroduction: evidence("complete-zero", request),
      },
    ],
  });
  assert.equal(analysis.conformant, true);
  assert.equal(analysis.stages[1]?.evidenceAnchored, true);
});
