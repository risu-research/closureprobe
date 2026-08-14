import { assessClosure } from "./oracle.js";
import { sha256Digest } from "./canonical.js";
import type {
  ClosureObservation,
  ClosureTrace,
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
  | "scopeBinding"
  | "validation";

interface AxisRule {
  axis: GuardAxis;
  favorable: string;
  explicitBlockers: readonly string[];
  unknowns: readonly string[];
}

const AXIS_RULES: readonly AxisRule[] = [
  {
    axis: "execution",
    favorable: "success",
    explicitBlockers: ["denied", "failed"],
    unknowns: ["unknown"],
  },
  {
    axis: "cardinality",
    favorable: "zero",
    explicitBlockers: ["unavailable"],
    unknowns: [],
  },
  {
    axis: "coverage",
    favorable: "complete",
    explicitBlockers: ["partial"],
    unknowns: ["unknown"],
  },
  {
    axis: "continuation",
    favorable: "exhausted",
    explicitBlockers: ["present"],
    unknowns: ["unknown"],
  },
  {
    axis: "scopeBinding",
    favorable: "exact",
    explicitBlockers: ["narrower", "mismatch"],
    unknowns: ["unbound"],
  },
  {
    axis: "validation",
    favorable: "profile_validated",
    explicitBlockers: ["declared_only", "invalid"],
    unknowns: ["unavailable"],
  },
];

function boundary(upstream: TraceStage, downstream: TraceStage): string {
  return `${upstream.stageId}->${downstream.stageId}`;
}

function axisValue(observation: ClosureObservation, axis: GuardAxis): string {
  return observation[axis];
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

  trace.stages.forEach((stage, index) => {
    const assessment = stageAssessments[index]!.assessment;
    if (stage.observation.queryBinding.requestDigest !== expectedRequestDigest) {
      findings.push(
        finding(
          "query_binding_mismatch",
          stage.stageId,
          `Stage ${stage.stageId} is bound to a different canonical request digest`,
          {
            axis: "queryBinding",
            upstream: expectedRequestDigest,
            downstream: stage.observation.queryBinding.requestDigest,
          },
        ),
      );
    }
    if (stage.claim === "none" && assessment.negativeLicense !== "licensed") {
      findings.push(
        finding(
          "unlicensed_negative",
          stage.stageId,
          `Stage ${stage.stageId} asserts none without a negative license`,
          { axis: "claim", downstream: "none" },
        ),
      );
    }

    if (index === 0) return;
    const upstream = trace.stages[index - 1]!;
    const upstreamAssessment = stageAssessments[index - 1]!.assessment;
    const boundaryId = boundary(upstream, stage);

    for (const rule of AXIS_RULES) {
      const before = axisValue(upstream.observation, rule.axis);
      const after = axisValue(stage.observation, rule.axis);
      if (
        rule.explicitBlockers.includes(before) &&
        rule.unknowns.includes(after)
      ) {
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
        before !== rule.favorable &&
        after === rule.favorable &&
        !stage.introducedValidatedEvidence
      ) {
        findings.push(
          finding(
            "dangerous_mutation",
            stage.stageId,
            `${rule.axis} changed from ${before} to ${after} without new validated evidence`,
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
      !stage.introducedValidatedEvidence
    ) {
      findings.push(
        finding(
          "unsupported_upgrade",
          stage.stageId,
          `Negative license upgraded at ${boundaryId} without new validated evidence`,
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

  const firstGuardSignalLoss = findings.find(
    (item) => item.code === "guard_signal_loss",
  );
  const firstUnlicensedNegative = findings.find(
    (item) => item.code === "unlicensed_negative",
  );

  return {
    traceId: trace.traceId,
    stages: stageAssessments,
    findings,
    ...(firstGuardSignalLoss === undefined ? {} : { firstGuardSignalLoss }),
    ...(firstUnlicensedNegative === undefined ? {} : { firstUnlicensedNegative }),
    conformant: findings.length === 0,
  };
}
