import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalizeJson, sha256Digest } from "../src/canonical.js";

test("canonical JSON is independent of object key insertion order", () => {
  const left = { z: 1, a: { y: [2, 1], x: true } };
  const right = { a: { x: true, y: [2, 1] }, z: 1 };
  assert.equal(canonicalizeJson(left), canonicalizeJson(right));
  assert.equal(sha256Digest(left), sha256Digest(right));
});

test("array order remains significant", () => {
  assert.notEqual(sha256Digest([1, 2]), sha256Digest([2, 1]));
});

test("non-JSON values are rejected rather than silently normalized", () => {
  assert.throws(() => canonicalizeJson({ value: Number.NaN }), /non-finite/);
  assert.throws(() => canonicalizeJson({ value: undefined }), /non-JSON/);
});
