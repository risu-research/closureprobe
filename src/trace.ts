import { canonicalizeJson, sha256Digest } from "./canonical.js";
import { bindGrounding, groundingFor } from "./grounding.js";
import { assessClosure } from "./oracle.js";
import { getSourceProfile } from "./profiles.js";
import { bindProposition } from "./proposition.js";
import type {
  ClosureObservation,
  ClosureTrace,
  EvidenceIntroduction,
  FindingCode,
  SourceGrounding,
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

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalizeJson(left as never) === canonicalizeJson(right as never);
}

function verifyEvidence(
  observation: ClosureObservation,
  evidence: EvidenceIntroduction,
  expectedRequest: ClosureTrace["request"],
  expectedGrounding: SourceGrounding,
): EvidenceVerification {
  try {
    const profile = getSourceProfile(evidence.profileId);
    if (profile.version !== evidence.profileVersion) {
      return { verified: false, reason: "profile version does not match the installed profile" };
    }
    if (!sameJson(evidence.request, expectedRequest)) {
      return { verified: false, reason: "evidence request does not match the trace root request" };
    }
    if (!sameJson(evidence.grounding, expectedGrounding)) {
      return { verified: false, reason: "evidence grounding does not match the trace context and proposition scope" };
    }
    if (sha256Digest(evidence.request) !== evidence.requestDigest) {
      return { verified: false, reason: "request digest does not match the supplied request" };
    }
    if (sha256Digest(evidence.response) !== evidence.responseDigest) {
      return { verified: false, reason: "response digest does not match the supplied response" };
    }
    const reconstructed = profile.assess(
      evidence.request,
      evidence.response,
      evidence.grounding,
    );
    if (!sameJson(reconstructed, observation)) {
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

function profileIdentity(stage: TraceStage): string {
  return `${stage.observation.profileId}@${stage.observation.profileVersion}`;
}

export function analyzeTrace(trace: ClosureTrace): TraceAnalysis {
  if (trace.stages.length === 0) {
    throw new Error("A closure trace must contain at least one stage");
  }

  const expectedRequestDigest = sha256Digest(trace.request);
  const expectedGrounding = groundingFor(trace.sourceContext, trace.proposition.scope);
  const expectedGroundingBinding = bindGrounding(expectedGrounding);
  const expectedPropositionBinding = bindProposition(
    trace.proposition,
    trace.sourceContext,
  );
  const assessments = trace.stages.map((stage) => assessClosure(stage.observation));
  const findings: TraceFinding[] = [];

  const rootVerification = verifyEvidence(
    trace.stages[0]!.observation,
    trace.rootEvidence,
    trace.request,
    expectedGrounding,
  );
  if (!rootVerification.verified) {
    findings.push(
      finding(
        "unanchored_root_evidence",
        trace.stages[0]!.stageId,
        `Trace root could not be receiver-reconstructed: ${rootVerification.reason ?? "unknown reason"}`,
        { axis: "rootEvidence" },
      ),
    );
  }

  const introducedEvidenceVerified = trace.stages.map((stage) => {
    if (stage.evidenceIntroduction === undefined) return false;
    const verification = verifyEvidence(
      stage.observation,
      stage.evidenceIntroduction,
      trace.request,
      expectedGrounding,
    );
    if (!verification.verified) {
      findings.push(
        finding(
          "unverified_evidence_introduction",
          stage.stageId,
          `Evidence introduction could not be receiver-reconstructed: ${verification.reason ?? "unknown reason"}`,
          { axis: "evidenceIntroduction" },
        ),
      );
    }
    return verification.verified;
  });

  const evidenceAnchored: boolean[] = [];

  trace.stages.forEach((stage, index) => {
    const assessment = assessments[index]!;
    const queryDigestMatches =
      stage.observation.queryBinding.requestDigest === expectedRequestDigest;
    const traversalRootMatches =
      stage.observation.traversalBinding.rootRequestDigest === expectedRequestDigest;
    const queryMatches = queryDigestMatches && traversalRootMatches;
    const groundingMatches = sameJson(
      stage.observation.groundingBinding,
      expectedGroundingBinding,
    );

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

    if (!groundingMatches) {
      findings.push(
        finding(
          "grounding_binding_mismatch",
          stage.stageId,
          `Stage ${stage.stageId} is not bound to the trace source context and proposition scope`,
          {
            axis: "groundingBinding",
            upstream: `${expectedGroundingBinding.sourceContextDigest},${expectedGroundingBinding.propositionScopeDigest}`,
            downstream: `${stage.observation.groundingBinding.sourceContextDigest},${stage.observation.groundingBinding.propositionScopeDigest}`,
          },
        ),
      );
    }

    let integrityBreak = !queryMatches || !groundingMatches;
    const hasVerifiedNewEvidence = introducedEvidenceVerified[index] === true;

    if (index > 0) {
      const upstream = trace.stages[index - 1]!;
      const upstreamAssessment = assessments[index - 1]!;
      const boundaryId = boundary(upstream, stage);
      const profileChanged = profileIdentity(upstream) !== profileIdentity(stage);

      if (profileChanged && !hasVerifiedNewEvidence) {
        integrityBreak = true;
        findings.push(
          finding(
            "profile_binding_change",
            stage.stageId,
            `Source profile identity changed at ${boundaryId} without receiver-reconstructed evidence`,
            {
              boundary: boundaryId,
              axis: "profileBinding",
              upstream: profileIdentity(upstream),
              downstream: profileIdentity(stage),
            },
          ),
        );
      }

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
          integrityBreak = true;
          findings.push(
            finding(
              "dangerous_mutation",
              stage.stageId,
              `${rule.axis} changed from ${before} to ${after} without receiver-reconstructed evidence`,
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
        integrityBreak = true;
        findings.push(
          finding(
            "unsupported_upgrade",
            stage.stageId,
            `Negative license upgraded at ${boundaryId} without receiver-reconstructed evidence`,
            {
              boundary: boundaryId,
              axis: "negativeLicense",
              upstream: upstreamAssessment.negativeLicense,
              downstream: assessment.negativeLicense,
            },
          ),
        );
      }
    }

    evidenceAnchored[index] = index === 0
      ? rootVerification.verified && queryMatches && groundingMatches
      : hasVerifiedNewEvidence
        ? queryMatches && groundingMatches
        : evidenceAnchored[index - 1] === true && !integrityBreak;

    let claimBindingMatches = true;
    if (stage.claim.status === "none") {
      const binding = stage.claim.propositionBinding;
      if (binding === undefined) {
        claimBindingMatches = false;
        findings.push(
          finding(
            "claim_binding_missing",
            stage.stageId,
            `Stage ${stage.stageId} asserts none without a context-bound proposition binding`,
            { axis: "propositionBinding" },
          ),
        );
      } else if (!sameJson(binding, expectedPropositionBinding)) {
        claimBindingMatches = false;
        findings.push(
          finding(
            "claim_binding_mismatch",
            stage.stageId,
            `Stage ${stage.stageId} asserts none for a different source context or proposition`,
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
        !groundingMatches ||
        !claimBindingMatches ||
        evidenceAnchored[index] !== true
      ) {
        findings.push(
          finding(
            "unlicensed_negative",
            stage.stageId,
            `Stage ${stage.stageId} asserts none without an anchored, query-, context-, scope-, and proposition-bound negative license`,
            { axis: "claim", downstream: "none" },
          ),
        );
      }
    }
  });

  const stages = trace.stages.map((stage, index) => ({
    stageId: stage.stageId,
    assessment: assessments[index]!,
    claim: stage.claim,
    evidenceAnchored: evidenceAnchored[index] === true,
  }));
  const firstGuardSignalLoss = findings.find((item) => item.code === "guard_signal_loss");
  const firstUnlicensedNegative = findings.find((item) => item.code === "unlicensed_negative");

  return {
    traceId: trace.traceId,
    stages,
    findings,
    ...(firstGuardSignalLoss === undefined ? {} : { firstGuardSignalLoss }),
    ...(firstUnlicensedNegative === undefined ? {} : { firstUnlicensedNegative }),
    conformant: findings.length === 0,
  };
}
