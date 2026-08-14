import { canonicalizeJson, sha256Digest } from "./canonical.js";
import { assessClosure } from "./oracle.js";
import { getSourceProfile } from "./profiles.js";
import { bindProposition } from "./proposition.js";
import type {
  ClosureObservation,
  ClosureTrace,
  EvidenceIntroduction,
  FindingCode,
  TraceAnalysis,
  TraceFinding,
  TraceStage,
} from "./types.js";

type GuardAxis =
  | "execution"
  | "cardinality"
  | "coverage"
  | "continuation"
  | "traversalBinding"
  | "scopeBinding"
  | "validation";

interface AxisRule {
  axis: GuardAxis;
  favorable: readonly string[];
  explicitBlockers: readonly string[];
  unknowns: readonly string[];
}

const AXIS_RULES: readonly AxisRule[] = [
  { axis: "execution", favorable: ["success"], explicitBlockers: ["denied", "failed"], unknowns: ["unknown"] },
  { axis: "cardinality", favorable: ["zero"], explicitBlockers: ["unavailable"], unknowns: [] },
  { axis: "coverage", favorable: ["complete"], explicitBlockers: ["partial"], unknowns: ["unknown"] },
  { axis: "continuation", favorable: ["exhausted"], explicitBlockers: ["present"], unknowns: ["unknown"] },
  {
    axis: "traversalBinding",
    favorable: ["single_page_complete", "aggregate_complete"],
    explicitBlockers: ["continued", "segment_only"],
    unknowns: ["unknown"],
  },
  { axis: "scopeBinding", favorable: ["exact"], explicitBlockers: ["narrower", "mismatch"], unknowns: ["unbound"] },
  { axis: "validation", favorable: ["profile_validated"], explicitBlockers: ["declared_only", "invalid"], unknowns: ["unavailable"] },
];

function boundary(upstream: TraceStage, downstream: TraceStage): string {
  return `${upstream.stageId}->${downstream.stageId}`;
}

function axisValue(observation: ClosureObservation, axis: GuardAxis): string {
  return axis === "traversalBinding"
    ? observation.traversalBinding.status
    : observation[axis];
}

function finding(
  code: FindingCode,
  stageId: string,
  message: string,
  options: Omit<TraceFinding, "code" | "stageId" | "message" | "severity"> & {
    severity?: TraceFinding["severity"];
  } = {},
): TraceFinding {
  const { severity = "error", ...rest } = options;
  return { code, severity, stageId, message, ...rest };
}

interface EvidenceVerification {
  verified: boolean;
  reason?: string;
}

function verifyEvidenceIntroduction(
  stage: TraceStage,
  introduction: EvidenceIntroduction,
): EvidenceVerification {
  try {
    const profile = getSourceProfile(introduction.profileId);
    if (profile.version !== introduction.profileVersion) {
      return { verified: false, reason: "profile version does not match the installed profile" };
    }
    if (sha256Digest(introduction.request) !== introduction.requestDigest) {
      return { verified: false, reason: "request digest does not match the supplied request" };
    }
    if (sha256Digest(introduction.response) !== introduction.responseDigest) {
      return { verified: false, reason: "response digest does not match the supplied response" };
    }
    const reconstructed = profile.assess(introduction.request, introduction.response);
    if (canonicalizeJson(reconstructed) !== canonicalizeJson(stage.observation)) {
      return { verified: false, reason: "profile reconstruction does not match the stage observation" };
    }
    return { verified: true };
  } catch (error) {
    return {
      verified: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function analyzeTrace(trace: ClosureTrace): TraceAnalysis {
  if (trace.stages.length === 0) {
    throw new Error("A closure trace must contain at least one stage");
  }

  const stageAssessments = trace.stages.map((stage) => ({
    stageId: stage.stageId,
    assessment: assessClosure(stage.observation),
    claim: stage.claim,
  }));
  const findings: TraceFinding[] = [];
  const expectedRequestDigest = sha256Digest(trace.request);
  const expectedPropositionBinding = bindProposition(trace.proposition);
  const evidenceVerified = trace.stages.map((stage) => {
    if (stage.evidenceIntroduction === undefined) return false;
    const verification = verifyEvidenceIntroduction(stage, stage.evidenceIntroduction);
    if (!verification.verified) {
      findings.push(
        finding(
          "unverified_evidence_introduction",
          stage.stageId,
          `Evidence introduction could not be receiver-revalidated: ${verification.reason ?? "unknown reason"}`,
          { axis: "evidenceIntroduction" },
        ),
      );
    }
    return verification.verified;
  });

  trace.stages.forEach((stage, index) => {
    const assessment = stageAssessments[index]!.assessment;
    const queryDigestMatches =
      stage.observation.queryBinding.requestDigest === expectedRequestDigest;
    const traversalRootMatches =
      stage.observation.traversalBinding.rootRequestDigest === expectedRequestDigest;
    const queryMatches = queryDigestMatches && traversalRootMatches;
    if (!queryMatches) {
      const mismatchedFields = [
        ...(queryDigestMatches ? [] : ["queryBinding.requestDigest"]),
        ...(traversalRootMatches ? [] : ["traversalBinding.rootRequestDigest"]),
      ];
      findings.push(
        finding(
          "query_binding_mismatch",
          stage.stageId,
          `Stage ${stage.stageId} mismatches the trace request at ${mismatchedFields.join(" and ")}`,
          {
            axis: "queryBinding",
            upstream: expectedRequestDigest,
            downstream: mismatchedFields.map((field) =>
              field === "queryBinding.requestDigest"
                ? stage.observation.queryBinding.requestDigest
                : stage.observation.traversalBinding.rootRequestDigest
            ).join(","),
          },
        ),
      );
    }

    let claimBindingMatches = true;
    if (stage.claim.status === "none") {
      const binding = stage.claim.propositionBinding;
      if (binding === undefined) {
        claimBindingMatches = false;
        findings.push(
          finding(
            "claim_binding_missing",
            stage.stageId,
            `Stage ${stage.stageId} asserts none without a proposition binding`,
            { axis: "propositionBinding" },
          ),
        );
      } else if (
        binding.algorithm !== expectedPropositionBinding.algorithm ||
        binding.propositionDigest !== expectedPropositionBinding.propositionDigest
      ) {
        claimBindingMatches = false;
        findings.push(
          finding(
            "claim_binding_mismatch",
            stage.stageId,
            `Stage ${stage.stageId} asserts none for a different proposition`,
            {
              axis: "propositionBinding",
              upstream: expectedPropositionBinding.propositionDigest,
              downstream: binding.propositionDigest,
            },
          ),
        );
      }

      if (
        assessment.negativeLicense !== "licensed" ||
        !queryMatches ||
        !claimBindingMatches
      ) {
        findings.push(
          finding(
            "unlicensed_negative",
            stage.stageId,
            `Stage ${stage.stageId} asserts none without a query- and proposition-bound negative license`,
            { axis: "claim", downstream: "none" },
          ),
        );
      }
    }

    if (index === 0) return;
    const upstream = trace.stages[index - 1]!;
    const upstreamAssessment = stageAssessments[index - 1]!.assessment;
    const boundaryId = boundary(upstream, stage);
    const hasVerifiedNewEvidence = evidenceVerified[index] === true;

    for (const rule of AXIS_RULES) {
      const before = axisValue(upstream.observation, rule.axis);
      const after = axisValue(stage.observation, rule.axis);
      if (rule.explicitBlockers.includes(before) && rule.unknowns.includes(after)) {
        findings.push(
          finding(
            "guard_signal_loss",
            stage.stageId,
            `${rule.axis} guard changed from ${before} to ${after}`,
            {
              severity: "warning",
              boundary: boundaryId,
              axis: rule.axis,
              upstream: before,
              downstream: after,
            },
          ),
        );
      }

      if (
        !rule.favorable.includes(before) &&
        rule.favorable.includes(after) &&
        !hasVerifiedNewEvidence
      ) {
        findings.push(
          finding(
            "dangerous_mutation",
            stage.stageId,
            `${rule.axis} changed from ${before} to ${after} without receiver-validated new evidence`,
            {
              boundary: boundaryId,
              axis: rule.axis,
              upstream: before,
              downstream: after,
            },
          ),
        );
      }
    }

    if (
      upstreamAssessment.negativeLicense !== "licensed" &&
      assessment.negativeLicense === "licensed" &&
      !hasVerifiedNewEvidence
    ) {
      findings.push(
        finding(
          "unsupported_upgrade",
          stage.stageId,
          `Negative license upgraded at ${boundaryId} without receiver-validated new evidence`,
          {
            boundary: boundaryId,
            axis: "negativeLicense",
            upstream: upstreamAssessment.negativeLicense,
            downstream: assessment.negativeLicense,
          },
        ),
      );
    }
  });

  const firstGuardSignalLoss = findings.find((item) => item.code === "guard_signal_loss");
  const firstUnlicensedNegative = findings.find((item) => item.code === "unlicensed_negative");

  return {
    traceId: trace.traceId,
    stages: stageAssessments,
    findings,
    ...(firstGuardSignalLoss === undefined ? {} : { firstGuardSignalLoss }),
    ...(firstUnlicensedNegative === undefined ? {} : { firstUnlicensedNegative }),
    conformant: findings.length === 0,
  };
}
