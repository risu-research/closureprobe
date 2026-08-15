import assert from "node:assert/strict";
import { test } from "node:test";

import { assessClosure } from "../src/oracle.js";
import { assessWithProfile } from "../src/profiles.js";
import type { SourceGrounding } from "../src/types.js";

function grounding(
  producer: string,
  instance: Record<string, string> = { tenant: "fixture" },
): SourceGrounding {
  return {
    sourceContext: {
      producer,
      instance,
      authority: { principal: "fixture-user" },
    },
    propositionScope: { corpus: "fixture-corpus" },
  };
}

const driveGrounding = grounding("google-drive");
const dynamoGrounding = grounding("aws-dynamodb");
const relayGrounding = grounding("graphql-relay");
const graphGrounding = grounding("microsoft-graph");
const elasticGrounding = grounding("elasticsearch", { cluster: "fixture", mode: "local" });

test("Drive final continuation segment cannot establish root-query emptiness", () => {
  const request = {
    q: "name contains 'needle'",
    fields: "files(id),incompleteSearch,nextPageToken",
    pageToken: "page-2",
  };
  const assessment = assessClosure(assessWithProfile(
    "google-drive-files-list",
    request,
    { files: [], incompleteSearch: false },
    driveGrounding,
  ));
  assert.equal(assessment.observation.traversalBinding.status, "segment_only");
  assert.ok(assessment.blockers.includes("traversal_not_query_complete"));
});

test("Drive aggregate links every page and counts earlier results", () => {
  const root = {
    q: "name contains 'needle'",
    fields: "files(id),incompleteSearch,nextPageToken",
  };
  const assessment = assessClosure(assessWithProfile(
    "google-drive-files-list",
    root,
    {
      pages: [
        {
          request: root,
          response: { files: [{ id: "found" }], incompleteSearch: false, nextPageToken: "page-2" },
        },
        {
          request: { ...root, pageToken: "page-2" },
          response: { files: [], incompleteSearch: false },
        },
      ],
    },
    driveGrounding,
  ));
  assert.equal(assessment.observation.traversalBinding.status, "aggregate_complete");
  assert.equal(assessment.observation.observedCount, 1);
  assert.equal(assessment.branch, "positive_observed");
});

test("malformed or lookalike Drive closure fields fail closed", () => {
  const lookalike = assessWithProfile(
    "google-drive-files-list",
    { fields: "notfiles,nextPageToken,incompleteSearch" },
    { files: [], incompleteSearch: false },
    driveGrounding,
  );
  assert.equal(assessClosure(lookalike).negativeLicense, "not_licensed");

  const malformedToken = assessWithProfile(
    "google-drive-files-list",
    { fields: "files(id),nextPageToken,incompleteSearch" },
    { files: [], incompleteSearch: false, nextPageToken: 7 },
    driveGrounding,
  );
  assert.equal(malformedToken.validation, "invalid");
});

test("DynamoDB rejects a broken pagination chain", () => {
  const root = { TableName: "T", KeyConditionExpression: "pk = :v" };
  const observation = assessWithProfile(
    "aws-dynamodb-query",
    root,
    {
      pages: [
        { request: root, response: { Items: [], LastEvaluatedKey: { pk: { S: "right" } } } },
        { request: { ...root, ExclusiveStartKey: { pk: { S: "wrong" } } }, response: { Items: [] } },
      ],
    },
    dynamoGrounding,
  );
  assert.equal(observation.validation, "invalid");
  assert.equal(observation.traversalBinding.status, "unknown");
});

test("Relay profile accepts forward root and rejects backward pagination", () => {
  const response = { data: { search: { edges: [], pageInfo: { hasNextPage: false, hasPreviousPage: true } } } };
  const forward = assessClosure(assessWithProfile(
    "graphql-relay-forward-connection",
    { query: "query { search(first: 10) { edges { node { id } } pageInfo { hasNextPage } } }" },
    response,
    relayGrounding,
  ));
  const backward = assessClosure(assessWithProfile(
    "graphql-relay-forward-connection",
    { query: "query { search(last: 10, before: \"cursor\") { edges { node { id } } pageInfo { hasNextPage hasPreviousPage } } }" },
    response,
    relayGrounding,
  ));
  assert.equal(forward.negativeLicense, "licensed");
  assert.equal(backward.observation.validation, "invalid");
  assert.equal(backward.negativeLicense, "not_licensed");
});

test("Relay after cursor is segment-only even on a final empty response", () => {
  const assessment = assessClosure(assessWithProfile(
    "graphql-relay-forward-connection",
    {
      query: "query Search($after: String) { search(first: 10, after: $after) { edges { node { id } } pageInfo { hasNextPage } } }",
      variables: { after: "cursor-1" },
      operationName: "Search",
    },
    { data: { search: { edges: [], pageInfo: { hasNextPage: false } } } },
    relayGrounding,
  ));
  assert.equal(assessment.observation.traversalBinding.status, "segment_only");
  assert.ok(assessment.blockers.includes("traversal_not_query_complete"));
});

test("Graph delta counts all linked pages rather than only the final page", () => {
  const root = { url: "https://graph.example/users/delta" };
  const assessment = assessClosure(assessWithProfile(
    "microsoft-graph-delta-traversal",
    root,
    {
      pages: [
        {
          requestUrl: root.url,
          response: { value: [{ id: "alice" }], "@odata.nextLink": "https://graph.example/users/delta?$skiptoken=2" },
        },
        {
          requestUrl: "https://graph.example/users/delta?$skiptoken=2",
          response: { value: [], "@odata.deltaLink": "https://graph.example/users/delta?$deltatoken=end" },
        },
      ],
    },
    graphGrounding,
  ));
  assert.equal(assessment.observation.observedCount, 1);
  assert.equal(assessment.branch, "positive_observed");
});

test("Elasticsearch exact total controls cardinality and early termination blocks closure", () => {
  const base = {
    timed_out: false,
    _shards: { total: 1, successful: 1, failed: 0 },
    hits: { total: { value: 3, relation: "eq" }, hits: [] },
  };
  const positive = assessClosure(assessWithProfile(
    "elasticsearch-search-zero",
    { index: "docs", size: 0 },
    base,
    elasticGrounding,
  ));
  assert.equal(positive.branch, "positive_observed");
  assert.equal(positive.observation.observedCount, 3);

  const early = assessClosure(assessWithProfile(
    "elasticsearch-search-zero",
    { index: "docs" },
    { ...base, terminated_early: true, hits: { total: { value: 0, relation: "eq" }, hits: [] } },
    elasticGrounding,
  ));
  assert.equal(early.negativeLicense, "not_licensed");
  assert.equal(early.observation.coverage, "partial");
});

test("Elasticsearch zero resolved shards fails closed", () => {
  const assessment = assessClosure(assessWithProfile(
    "elasticsearch-search-zero",
    { index: "missing-*" },
    {
      timed_out: false,
      _shards: { total: 0, successful: 0, failed: 0 },
      hits: { total: { value: 0, relation: "eq" }, hits: [] },
    },
    elasticGrounding,
  ));
  assert.equal(assessment.negativeLicense, "not_licensed");
});

test("malformed Elasticsearch counts and GraphQL errors fail closed", () => {
  const elastic = assessWithProfile(
    "elasticsearch-search-zero",
    {},
    {
      timed_out: false,
      _shards: { total: 1.5, successful: 1.5, failed: 0 },
      hits: { total: { value: 0, relation: "eq" }, hits: [] },
    },
    elasticGrounding,
  );
  assert.equal(assessClosure(elastic).negativeLicense, "not_licensed");

  const relay = assessWithProfile(
    "graphql-relay-forward-connection",
    { query: "query { search(first: 10) { edges { node { id } } pageInfo { hasNextPage } } }" },
    { errors: {}, data: { search: { edges: [], pageInfo: { hasNextPage: false } } } },
    relayGrounding,
  );
  assert.equal(relay.validation, "invalid");
});

test("Elasticsearch cross-cluster responses are outside the local-only profile", () => {
  const observation = assessWithProfile(
    "elasticsearch-search-zero",
    { index: "local:docs" },
    {
      timed_out: false,
      _shards: { total: 1, successful: 1, failed: 0 },
      _clusters: { total: 2, successful: 1, skipped: 1, partial: 0, failed: 0, running: 0 },
      hits: { total: { value: 0, relation: "eq" }, hits: [] },
    },
    elasticGrounding,
  );
  assert.equal(observation.validation, "invalid");
  assert.equal(assessClosure(observation).negativeLicense, "not_licensed");
});

test("Graph delta rejects empty relative and cross-origin traversal links", () => {
  const root = { url: "https://graph.example/users/delta" };
  for (const link of ["", "/users/delta?$deltatoken=end", "https://other.example/users/delta"] as const) {
    const observation = assessWithProfile(
      "microsoft-graph-delta-traversal",
      root,
      { pages: [{ requestUrl: root.url, response: { value: [], "@odata.deltaLink": link } }] },
      graphGrounding,
    );
    assert.equal(observation.validation, "invalid", link);
  }
});
