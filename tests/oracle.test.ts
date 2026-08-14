import assert from "node:assert/strict";
import { test } from "node:test";

import { assessClosure } from "../src/oracle.js";
import { createProbePayload } from "../src/probe.js";

test("only the complete controlled zero earns a negative license", () => {
  const request = { q: "needle" };
  assert.equal(
    assessClosure(createProbePayload("complete-zero", request).observation).negativeLicense,
    "licensed",
  );

  for (const scenario of [
    "partial-zero",
    "continued-zero",
    "denied-zero",
    "failed-zero",
    "scope-mismatch-zero",
  ] as const) {
    assert.equal(
      assessClosure(createProbePayload(scenario, request).observation).negativeLicense,
      "not_licensed",
      scenario,
    );
  }
});

test("a positive result is not evaluated as a negative candidate", () => {
  const payload = createProbePayload("complete-zero", { q: "needle" });
  const assessment = assessClosure({
    ...payload.observation,
    cardinality: "nonzero",
    observedCount: 1,
  });
  assert.equal(assessment.branch, "positive_observed");
  assert.equal(assessment.negativeLicense, "not_applicable");
  assert.deepEqual(assessment.blockers, []);
});
