import assert from "node:assert/strict";
import { test } from "node:test";

import { assessClosure } from "../src/oracle.js";
import { createProbePayload } from "../src/probe.js";

const grounding = {
  sourceContext: {
    producer: "closureprobe-controlled-probe",
    instance: { server: "fixture" },
    authority: { principal: "fixture-user" },
  },
  propositionScope: { tenant: "fixture" },
} as const;

test("only the complete controlled zero earns a negative license", () => {
  const request = { q: "needle" };
  assert.equal(
    assessClosure(createProbePayload("complete-zero", request, grounding).observation).negativeLicense,
    "licensed",
  );

  for (const scenario of [
    "partial-zero",
    "continued-zero",
    "denied-zero",
    "failed-zero",
    "scope-mismatch-zero",
    "segment-zero",
  ] as const) {
    assert.equal(
      assessClosure(createProbePayload(scenario, request, grounding).observation).negativeLicense,
      "not_licensed",
      scenario,
    );
  }
});

test("a positive result is not evaluated as a negative candidate", () => {
  const payload = createProbePayload("complete-zero", { q: "needle" }, grounding);
  const assessment = assessClosure({
    ...payload.observation,
    cardinality: "nonzero",
    observedCount: 1,
  });
  assert.equal(assessment.branch, "positive_observed");
  assert.equal(assessment.negativeLicense, "not_applicable");
  assert.deepEqual(assessment.blockers, []);
});

test("internally inconsistent request and traversal bindings block a license", () => {
  const observation = createProbePayload("complete-zero", { q: "needle" }, grounding).observation;
  const assessment = assessClosure({
    ...observation,
    traversalBinding: {
      ...observation.traversalBinding,
      rootRequestDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    },
  });
  assert.equal(assessment.negativeLicense, "not_licensed");
  assert.ok(assessment.blockers.includes("binding_inconsistent"));
});
