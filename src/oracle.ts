import type {
  Blocker,
  ClosureAssessment,
  ClosureObservation,
} from "./types.js";

export const BLOCKER_ORDER: readonly Blocker[] = [
  "execution_not_success",
  "cardinality_not_zero",
  "coverage_not_complete",
  "continuation_not_exhausted",
  "traversal_not_query_complete",
  "binding_inconsistent",
  "scope_not_exact",
  "validation_not_profile_validated",
];

export function assessClosure(observation: ClosureObservation): ClosureAssessment {
  if (observation.cardinality === "nonzero") {
    return {
      observation,
      branch: "positive_observed",
      negativeLicense: "not_applicable",
      blockers: [],
    };
  }

  const blockers: Blocker[] = [];
  if (observation.execution !== "success") {
    blockers.push("execution_not_success");
  }
  if (observation.cardinality !== "zero") {
    blockers.push("cardinality_not_zero");
  }
  if (observation.coverage !== "complete") {
    blockers.push("coverage_not_complete");
  }
  if (observation.continuation !== "exhausted") {
    blockers.push("continuation_not_exhausted");
  }
  if (
    observation.traversalBinding.status !== "single_page_complete" &&
    observation.traversalBinding.status !== "aggregate_complete"
  ) {
    blockers.push("traversal_not_query_complete");
  }
  if (
    observation.queryBinding.requestDigest !==
    observation.traversalBinding.rootRequestDigest
  ) {
    blockers.push("binding_inconsistent");
  }
  if (
    observation.scopeBinding !== "exact" ||
    observation.queryBinding.status !== "exact"
  ) {
    blockers.push("scope_not_exact");
  }
  if (observation.validation !== "profile_validated") {
    blockers.push("validation_not_profile_validated");
  }

  return {
    observation,
    branch:
      observation.cardinality === "zero" ? "negative_candidate" : "no_result_claim",
    negativeLicense: blockers.length === 0 ? "licensed" : "not_licensed",
    blockers,
  };
}

export function licensesNegative(observation: ClosureObservation): boolean {
  return assessClosure(observation).negativeLicense === "licensed";
}
