import { sha256Digest } from "./canonical.js";
import type { ClosureObservation, JsonValue } from "./types.js";

export type ProbeScenario =
  | "complete-zero"
  | "partial-zero"
  | "continued-zero"
  | "denied-zero"
  | "failed-zero"
  | "scope-mismatch-zero";
export type ProbeCarrier = "dual" | "structured-only" | "text-only";

export interface ProbePayload {
  scenario: ProbeScenario;
  request: JsonValue;
  observation: ClosureObservation;
}

export function createProbePayload(
  scenario: ProbeScenario,
  request: JsonValue,
): ProbePayload {
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
    observation: {
      profileId: "closureprobe-controlled-probe",
      profileVersion: "0.1.0",
      queryBinding: {
        algorithm: "closureprobe-canonical-json-v1",
        requestDigest: sha256Digest(request),
        status: scopeBinding,
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
