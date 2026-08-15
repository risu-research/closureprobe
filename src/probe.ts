import { sha256Digest } from "./canonical.js";
import { bindGrounding, isValidGrounding } from "./grounding.js";
import type { ClosureObservation, JsonValue, SourceGrounding } from "./types.js";

export type ProbeScenario =
  | "complete-zero"
  | "partial-zero"
  | "continued-zero"
  | "denied-zero"
  | "failed-zero"
  | "scope-mismatch-zero"
  | "segment-zero";
export type ProbeCarrier = "dual" | "structured-only" | "text-only";

export interface ProbePayload {
  scenario: ProbeScenario;
  request: JsonValue;
  grounding: SourceGrounding;
  observation: ClosureObservation;
}

export function createProbePayload(
  scenario: ProbeScenario,
  request: JsonValue,
  grounding: SourceGrounding,
): ProbePayload {
  if (!isValidGrounding(grounding, "closureprobe-controlled-probe")) {
    throw new Error("Controlled probe grounding must identify closureprobe-controlled-probe");
  }
  const execution = scenario === "denied-zero"
    ? "denied"
    : scenario === "failed-zero"
      ? "failed"
      : "success";
  const coverage = scenario === "partial-zero" || scenario === "continued-zero"
    ? "partial"
    : "complete";
  const continuation = scenario === "continued-zero" ? "present" : "exhausted";
  const scopeBinding = scenario === "scope-mismatch-zero" ? "mismatch" : "exact";

  return {
    scenario,
    request,
    grounding,
    observation: {
      profileId: "closureprobe-controlled-probe",
      profileVersion: "0.3.0",
      queryBinding: {
        algorithm: "closureprobe-canonical-json-v1",
        requestDigest: sha256Digest(request),
        status: scopeBinding,
      },
      groundingBinding: bindGrounding(grounding),
      traversalBinding: {
        algorithm: "closureprobe-traversal-v1",
        rootRequestDigest: sha256Digest(request),
        segmentRequestDigest: sha256Digest(request),
        status: scenario === "complete-zero" || scenario === "scope-mismatch-zero"
          ? "single_page_complete"
          : scenario === "continued-zero"
            ? "continued"
            : scenario === "segment-zero"
              ? "segment_only"
              : "unknown",
        pageCount: 1,
      },
      execution,
      cardinality: "zero",
      observedCount: 0,
      coverage,
      continuation,
      scopeBinding,
      validation: "profile_validated",
      evidencePointers: ["/scenario"],
      notes: ["Controlled fixture; not a source-truth claim"],
    },
  };
}
