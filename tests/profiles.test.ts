import assert from "node:assert/strict";
import { test } from "node:test";

import { assessClosure } from "../src/oracle.js";
import { assessWithProfile } from "../src/profiles.js";

test("Drive field projection is part of the closure evidence", () => {
  const response = { files: [], incompleteSearch: false };
  const projected = assessClosure(
    assessWithProfile(
      "google-drive-files-list",
      { q: "needle", fields: "files(id),incompleteSearch,nextPageToken" },
      response,
    ),
  );
  const omitted = assessClosure(
    assessWithProfile(
      "google-drive-files-list",
      { q: "needle", fields: "files(id)" },
      response,
    ),
  );
  assert.equal(projected.negativeLicense, "licensed");
  assert.deepEqual(omitted.blockers, [
    "coverage_not_complete",
    "continuation_not_exhausted",
  ]);
});

test("pagination signals remain producer-specific but map to the same contract", () => {
  const dynamo = assessClosure(
    assessWithProfile(
      "aws-dynamodb-query",
      { TableName: "T" },
      { Items: [], LastEvaluatedKey: { pk: { S: "next" } } },
    ),
  );
  const relay = assessClosure(
    assessWithProfile(
      "graphql-relay-connection",
      { query: "search" },
      { data: { search: { edges: [], pageInfo: { hasNextPage: true } } } },
    ),
  );
  const graph = assessClosure(
    assessWithProfile(
      "microsoft-graph-delta",
      { resource: "/users/delta" },
      { value: [], "@odata.nextLink": "https://example.test/next" },
    ),
  );
  for (const assessment of [dynamo, relay, graph]) {
    assert.equal(assessment.negativeLicense, "not_licensed");
    assert.deepEqual(assessment.blockers, [
      "coverage_not_complete",
      "continuation_not_exhausted",
    ]);
  }
});

test("Elasticsearch zero fails closed on an unsupported early-termination request", () => {
  const assessment = assessClosure(
    assessWithProfile(
      "elasticsearch-search-zero",
      { index: "docs", terminate_after: 1 },
      {
        timed_out: false,
        _shards: { total: 1, successful: 1, failed: 0 },
        hits: { total: { value: 0, relation: "eq" }, hits: [] },
      },
    ),
  );
  assert.equal(assessment.negativeLicense, "not_licensed");
});
