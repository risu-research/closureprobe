import { sha256Digest } from "./canonical.js";
import type {
  CardinalityStatus,
  ClosureObservation,
  ContinuationStatus,
  CoverageStatus,
  ExecutionStatus,
  JsonValue,
  SourceProfile,
  ValidationStatus,
} from "./types.js";

type JsonObject = { [key: string]: JsonValue };

function isObject(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getObject(value: JsonValue, key: string): JsonObject | undefined {
  if (!isObject(value)) return undefined;
  const child = value[key];
  return isObject(child) ? child : undefined;
}

function getArray(value: JsonValue, key: string): JsonValue[] | undefined {
  if (!isObject(value)) return undefined;
  const child = value[key];
  return Array.isArray(child) ? child : undefined;
}

function explicitBoolean(value: JsonObject, key: string): boolean | undefined {
  const child = value[key];
  return typeof child === "boolean" ? child : undefined;
}

function stringValue(value: JsonObject, key: string): string | undefined {
  const child = value[key];
  return typeof child === "string" ? child : undefined;
}

function numericValue(value: JsonObject, key: string): number | undefined {
  const child = value[key];
  return typeof child === "number" && Number.isFinite(child) ? child : undefined;
}

function cardinality(items: JsonValue[] | undefined): {
  status: CardinalityStatus;
  count?: number;
} {
  if (items === undefined) return { status: "unavailable" };
  return items.length === 0
    ? { status: "zero", count: 0 }
    : { status: "nonzero", count: items.length };
}

function executionFromError(response: JsonValue): ExecutionStatus {
  if (!isObject(response) || !isObject(response.error)) return "success";
  const code = response.error.code;
  return code === 401 || code === 403 || code === "DENIED" ? "denied" : "failed";
}

interface ObservationInput {
  profileId: string;
  profileVersion: string;
  request: JsonValue;
  execution: ExecutionStatus;
  cardinality: CardinalityStatus;
  observedCount?: number;
  coverage: CoverageStatus;
  continuation: ContinuationStatus;
  validation: ValidationStatus;
  evidencePointers: string[];
  notes?: string[];
}

function observation(input: ObservationInput): ClosureObservation {
  return {
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    queryBinding: {
      algorithm: "closureprobe-canonical-json-v1",
      requestDigest: sha256Digest(input.request),
      status: "exact",
    },
    execution: input.execution,
    cardinality: input.cardinality,
    ...(input.observedCount === undefined ? {} : { observedCount: input.observedCount }),
    coverage: input.coverage,
    continuation: input.continuation,
    scopeBinding: "exact",
    validation: input.validation,
    evidencePointers: input.evidencePointers,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  };
}

function invalidObservation(
  profileId: string,
  profileVersion: string,
  request: JsonValue,
  note: string,
): ClosureObservation {
  return observation({
    profileId,
    profileVersion,
    request,
    execution: "unknown",
    cardinality: "unavailable",
    coverage: "unknown",
    continuation: "unknown",
    validation: "invalid",
    evidencePointers: [],
    notes: [note],
  });
}

const PROFILE_VERSION = "0.1.0";

const generic: SourceProfile = {
  id: "generic-enumeration",
  version: PROFILE_VERSION,
  assess(request, response) {
    if (!isObject(response)) {
      return invalidObservation(this.id, this.version, request, "Response is not an object");
    }
    const items = getArray(response, "items");
    const count = cardinality(items);
    const execution = response.execution;
    const coverage = response.coverage;
    const continuation = response.continuation;
    const scopeBinding = response.scopeBinding;
    const valid =
      ["success", "denied", "failed", "unknown"].includes(String(execution)) &&
      ["complete", "partial", "unknown"].includes(String(coverage)) &&
      ["exhausted", "present", "unknown"].includes(String(continuation)) &&
      ["exact", "narrower", "mismatch", "unbound"].includes(String(scopeBinding));

    const base = observation({
      profileId: this.id,
      profileVersion: this.version,
      request,
      execution: valid ? (execution as ExecutionStatus) : "unknown",
      cardinality: count.status,
      ...(count.count === undefined ? {} : { observedCount: count.count }),
      coverage: valid ? (coverage as CoverageStatus) : "unknown",
      continuation: valid ? (continuation as ContinuationStatus) : "unknown",
      validation: valid ? "profile_validated" : "invalid",
      evidencePointers: valid
        ? ["/execution", "/items", "/coverage", "/continuation", "/scopeBinding"]
        : [],
      ...(valid ? {} : { notes: ["Generic response does not satisfy the profile"] }),
    });
    return {
      ...base,
      scopeBinding: valid ? (scopeBinding as ClosureObservation["scopeBinding"]) : "unbound",
      queryBinding: {
        ...base.queryBinding,
        status: valid
          ? (scopeBinding as ClosureObservation["queryBinding"]["status"])
          : "unbound",
      },
    };
  },
};

const googleDrive: SourceProfile = {
  id: "google-drive-files-list",
  version: PROFILE_VERSION,
  assess(request, response) {
    if (!isObject(response)) {
      return invalidObservation(this.id, this.version, request, "Response is not an object");
    }
    const execution = executionFromError(response);
    if (execution !== "success") {
      return observation({
        profileId: this.id,
        profileVersion: this.version,
        request,
        execution,
        cardinality: "unavailable",
        coverage: "unknown",
        continuation: "unknown",
        validation: "profile_validated",
        evidencePointers: ["/error"],
      });
    }

    const files = getArray(response, "files");
    if (files === undefined) {
      return invalidObservation(this.id, this.version, request, "files is not an array");
    }
    const count = cardinality(files);
    const incompleteSearch = explicitBoolean(response, "incompleteSearch");
    const fields = isObject(request) ? stringValue(request, "fields") : undefined;
    const requestedCoverage = fields?.includes("incompleteSearch") === true;
    const requestedContinuation = fields?.includes("nextPageToken") === true;
    const nextPageToken = stringValue(response, "nextPageToken");
    const coverage: CoverageStatus =
      !requestedCoverage || incompleteSearch === undefined
        ? "unknown"
        : incompleteSearch
          ? "partial"
          : "complete";
    const continuation: ContinuationStatus = !requestedContinuation
      ? "unknown"
      : nextPageToken === undefined
        ? "exhausted"
        : "present";

    return observation({
      profileId: this.id,
      profileVersion: this.version,
      request,
      execution,
      cardinality: count.status,
      ...(count.count === undefined ? {} : { observedCount: count.count }),
      coverage,
      continuation,
      validation: "profile_validated",
      evidencePointers: [
        "/files",
        ...(requestedCoverage ? ["/incompleteSearch"] : []),
        ...(requestedContinuation ? ["/nextPageToken"] : []),
      ],
      ...(!requestedCoverage || !requestedContinuation
        ? { notes: ["Request projection omitted a required closure signal"] }
        : {}),
    });
  },
};

const dynamoDb: SourceProfile = {
  id: "aws-dynamodb-query",
  version: PROFILE_VERSION,
  assess(request, response) {
    if (!isObject(response)) {
      return invalidObservation(this.id, this.version, request, "Response is not an object");
    }
    const execution = executionFromError(response);
    if (execution !== "success") {
      return observation({
        profileId: this.id,
        profileVersion: this.version,
        request,
        execution,
        cardinality: "unavailable",
        coverage: "unknown",
        continuation: "unknown",
        validation: "profile_validated",
        evidencePointers: ["/error"],
      });
    }
    const items = getArray(response, "Items");
    if (items === undefined) {
      return invalidObservation(this.id, this.version, request, "Items is not an array");
    }
    const count = cardinality(items);
    const lastKey = response.LastEvaluatedKey;
    const hasLastKey = isObject(lastKey) && Object.keys(lastKey).length > 0;
    return observation({
      profileId: this.id,
      profileVersion: this.version,
      request,
      execution,
      cardinality: count.status,
      ...(count.count === undefined ? {} : { observedCount: count.count }),
      coverage: hasLastKey ? "partial" : "complete",
      continuation: hasLastKey ? "present" : "exhausted",
      validation: "profile_validated",
      evidencePointers: ["/Items", "/LastEvaluatedKey"],
    });
  },
};

function unsupportedElasticsearchRequest(request: JsonValue): boolean {
  if (!isObject(request)) return true;
  return ["scroll", "search_after", "terminate_after"].some(
    (key) => request[key] !== undefined,
  );
}

const elasticsearch: SourceProfile = {
  id: "elasticsearch-search-zero",
  version: PROFILE_VERSION,
  assess(request, response) {
    if (!isObject(response)) {
      return invalidObservation(this.id, this.version, request, "Response is not an object");
    }
    const execution = executionFromError(response);
    if (execution !== "success") {
      return observation({
        profileId: this.id,
        profileVersion: this.version,
        request,
        execution,
        cardinality: "unavailable",
        coverage: "unknown",
        continuation: "unknown",
        validation: "profile_validated",
        evidencePointers: ["/error"],
      });
    }

    const hits = getObject(response, "hits");
    const hitItems = hits === undefined ? undefined : getArray(hits, "hits");
    const total = hits === undefined ? undefined : getObject(hits, "total");
    const shards = getObject(response, "_shards");
    if (hitItems === undefined || total === undefined || shards === undefined) {
      return invalidObservation(
        this.id,
        this.version,
        request,
        "hits.hits, hits.total, or _shards is missing",
      );
    }
    const count = cardinality(hitItems);
    const timedOut = explicitBoolean(response, "timed_out");
    const relation = stringValue(total, "relation");
    const totalValue = numericValue(total, "value");
    const failed = numericValue(shards, "failed");
    const successful = numericValue(shards, "successful");
    const shardTotal = numericValue(shards, "total");
    const requestUnsupported = unsupportedElasticsearchRequest(request);
    const explicitlyPartial =
      timedOut === true ||
      (failed !== undefined && failed > 0) ||
      relation === "gte";
    const explicitlyComplete =
      !requestUnsupported &&
      timedOut === false &&
      failed === 0 &&
      successful !== undefined &&
      shardTotal !== undefined &&
      successful === shardTotal &&
      relation === "eq" &&
      totalValue !== undefined;
    const coverage: CoverageStatus = explicitlyPartial
      ? "partial"
      : explicitlyComplete
        ? "complete"
        : "unknown";
    const continuation: ContinuationStatus =
      explicitlyComplete && totalValue === 0 ? "exhausted" : "unknown";

    return observation({
      profileId: this.id,
      profileVersion: this.version,
      request,
      execution,
      cardinality: count.status,
      ...(count.count === undefined ? {} : { observedCount: count.count }),
      coverage,
      continuation,
      validation: "profile_validated",
      evidencePointers: ["/timed_out", "/_shards", "/hits/total", "/hits/hits"],
      ...(requestUnsupported ? { notes: ["Request variant is unsupported by v0.1"] } : {}),
    });
  },
};

const graphqlRelay: SourceProfile = {
  id: "graphql-relay-connection",
  version: PROFILE_VERSION,
  assess(request, response) {
    if (!isObject(response)) {
      return invalidObservation(this.id, this.version, request, "Response is not an object");
    }
    const errors = getArray(response, "errors");
    const data = getObject(response, "data");
    const search = data === undefined ? undefined : getObject(data, "search");
    const edges = search === undefined ? undefined : getArray(search, "edges");
    const pageInfo = search === undefined ? undefined : getObject(search, "pageInfo");
    if (edges === undefined || pageInfo === undefined) {
      return invalidObservation(
        this.id,
        this.version,
        request,
        "data.search.edges or pageInfo is missing",
      );
    }
    const count = cardinality(edges);
    const hasNextPage = explicitBoolean(pageInfo, "hasNextPage");
    const hasErrors = errors !== undefined && errors.length > 0;
    const coverage: CoverageStatus = hasErrors
      ? "partial"
      : hasNextPage === true
        ? "partial"
        : hasNextPage === false
          ? "complete"
          : "unknown";
    const continuation: ContinuationStatus =
      hasNextPage === true ? "present" : hasNextPage === false ? "exhausted" : "unknown";
    return observation({
      profileId: this.id,
      profileVersion: this.version,
      request,
      execution: hasErrors ? "failed" : "success",
      cardinality: count.status,
      ...(count.count === undefined ? {} : { observedCount: count.count }),
      coverage,
      continuation,
      validation: "profile_validated",
      evidencePointers: ["/data/search/edges", "/data/search/pageInfo/hasNextPage", "/errors"],
    });
  },
};

const graphDelta: SourceProfile = {
  id: "microsoft-graph-delta",
  version: PROFILE_VERSION,
  assess(request, response) {
    if (!isObject(response)) {
      return invalidObservation(this.id, this.version, request, "Response is not an object");
    }
    const execution = executionFromError(response);
    if (execution !== "success") {
      return observation({
        profileId: this.id,
        profileVersion: this.version,
        request,
        execution,
        cardinality: "unavailable",
        coverage: "unknown",
        continuation: "unknown",
        validation: "profile_validated",
        evidencePointers: ["/error"],
      });
    }
    const values = getArray(response, "value");
    if (values === undefined) {
      return invalidObservation(this.id, this.version, request, "value is not an array");
    }
    const count = cardinality(values);
    const nextLink = stringValue(response, "@odata.nextLink");
    const deltaLink = stringValue(response, "@odata.deltaLink");
    const ambiguous = nextLink !== undefined && deltaLink !== undefined;
    const coverage: CoverageStatus = ambiguous
      ? "unknown"
      : deltaLink !== undefined
        ? "complete"
        : nextLink !== undefined
          ? "partial"
          : "unknown";
    const continuation: ContinuationStatus = ambiguous
      ? "unknown"
      : deltaLink !== undefined
        ? "exhausted"
        : nextLink !== undefined
          ? "present"
          : "unknown";
    return observation({
      profileId: this.id,
      profileVersion: this.version,
      request,
      execution,
      cardinality: count.status,
      ...(count.count === undefined ? {} : { observedCount: count.count }),
      coverage,
      continuation,
      validation: ambiguous ? "invalid" : "profile_validated",
      evidencePointers: ["/value", "/@odata.nextLink", "/@odata.deltaLink"],
      ...(ambiguous ? { notes: ["Both nextLink and deltaLink are present"] } : {}),
    });
  },
};

const profileList: readonly SourceProfile[] = [
  generic,
  googleDrive,
  dynamoDb,
  elasticsearch,
  graphqlRelay,
  graphDelta,
];

export const sourceProfiles: ReadonlyMap<string, SourceProfile> = new Map(
  profileList.map((profile) => [profile.id, profile]),
);

export function getSourceProfile(profileId: string): SourceProfile {
  const profile = sourceProfiles.get(profileId);
  if (profile === undefined) {
    throw new Error(`Unknown source profile: ${profileId}`);
  }
  return profile;
}

export function assessWithProfile(
  profileId: string,
  request: JsonValue,
  response: JsonValue,
): ClosureObservation {
  return getSourceProfile(profileId).assess(request, response);
}
