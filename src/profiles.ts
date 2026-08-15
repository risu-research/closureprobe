import { Kind, parse, type FieldNode, type OperationDefinitionNode, type ValueNode } from "graphql";

import { canonicalizeJson, sha256Digest } from "./canonical.js";
import { bindGrounding, isValidGrounding } from "./grounding.js";
import { createProbePayload, type ProbeScenario } from "./probe.js";
import type {
  CardinalityStatus,
  ClosureObservation,
  ContinuationStatus,
  CoverageStatus,
  ExecutionStatus,
  JsonValue,
  SourceGrounding,
  SourceProfile,
  TraversalStatus,
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

function nonnegativeInteger(value: JsonObject, key: string): number | undefined {
  const child = value[key];
  return typeof child === "number" &&
    Number.isSafeInteger(child) &&
    child >= 0
    ? child
    : undefined;
}

function hasOwn(value: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function absoluteHttpsUrl(value: string | undefined): URL | undefined {
  if (value === undefined || value.length === 0) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.length > 0
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function cardinalityFromCount(count: number | undefined): {
  status: CardinalityStatus;
  count?: number;
} {
  if (count === undefined) return { status: "unavailable" };
  return count === 0
    ? { status: "zero", count: 0 }
    : { status: "nonzero", count };
}

function executionFromError(response: JsonObject): ExecutionStatus {
  if (!isObject(response.error)) return "success";
  const code = response.error.code;
  return code === 401 || code === 403 || code === "DENIED" ? "denied" : "failed";
}

function sameJson(left: JsonValue, right: JsonValue): boolean {
  return canonicalizeJson(left) === canonicalizeJson(right);
}

function withoutKey(value: JsonObject, key: string): JsonObject {
  return Object.fromEntries(
    Object.entries(value).filter(([name]) => name !== key),
  ) as JsonObject;
}

interface ObservationInput {
  profileId: string;
  profileVersion: string;
  rootRequest: JsonValue;
  grounding: SourceGrounding;
  segmentRequest?: JsonValue;
  traversalStatus: TraversalStatus;
  pageCount?: number;
  execution: ExecutionStatus;
  cardinality: CardinalityStatus;
  observedCount?: number;
  coverage: CoverageStatus;
  continuation: ContinuationStatus;
  scopeBinding?: ClosureObservation["scopeBinding"];
  validation: ValidationStatus;
  evidencePointers: string[];
  notes?: string[];
}

function observation(input: ObservationInput): ClosureObservation {
  const rootDigest = sha256Digest(input.rootRequest);
  const segmentDigest = sha256Digest(input.segmentRequest ?? input.rootRequest);
  const scopeBinding = input.scopeBinding ?? "exact";
  return {
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    queryBinding: {
      algorithm: "closureprobe-canonical-json-v1",
      requestDigest: rootDigest,
      status: scopeBinding,
    },
    groundingBinding: bindGrounding(input.grounding),
    traversalBinding: {
      algorithm: "closureprobe-traversal-v1",
      rootRequestDigest: rootDigest,
      segmentRequestDigest: segmentDigest,
      status: input.traversalStatus,
      pageCount: input.pageCount ?? 1,
    },
    execution: input.execution,
    cardinality: input.cardinality,
    ...(input.observedCount === undefined ? {} : { observedCount: input.observedCount }),
    coverage: input.coverage,
    continuation: input.continuation,
    scopeBinding,
    validation: input.validation,
    evidencePointers: input.evidencePointers,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  };
}

function invalidObservation(
  profileId: string,
  profileVersion: string,
  request: JsonValue,
  grounding: SourceGrounding,
  note: string,
): ClosureObservation {
  return observation({
    profileId,
    profileVersion,
    rootRequest: request,
    grounding,
    traversalStatus: "unknown",
    execution: "unknown",
    cardinality: "unavailable",
    coverage: "unknown",
    continuation: "unknown",
    scopeBinding: "unbound",
    validation: "invalid",
    evidencePointers: [],
    notes: [note],
  });
}

const PROFILE_VERSION = "0.3.0";

const generic: SourceProfile = {
  id: "generic-enumeration",
  version: PROFILE_VERSION,
  assess(request, response, grounding) {
    if (!isValidGrounding(grounding, "controlled")) {
      return invalidObservation(this.id, this.version, request, grounding, "Grounding is invalid for the controlled producer");
    }
    if (!isObject(response)) {
      return invalidObservation(this.id, this.version, request, grounding, "Response is not an object");
    }
    const items = getArray(response, "items");
    const count = cardinalityFromCount(items?.length);
    const execution = response.execution;
    const coverage = response.coverage;
    const continuation = response.continuation;
    const scopeBinding = response.scopeBinding;
    const traversalStatus = response.traversalStatus;
    const valid =
      ["success", "denied", "failed", "unknown"].includes(String(execution)) &&
      ["complete", "partial", "unknown"].includes(String(coverage)) &&
      ["exhausted", "present", "unknown"].includes(String(continuation)) &&
      ["exact", "narrower", "mismatch", "unbound"].includes(String(scopeBinding)) &&
      ["single_page_complete", "aggregate_complete", "continued", "segment_only", "unknown"].includes(String(traversalStatus));

    return observation({
      profileId: this.id,
      profileVersion: this.version,
      rootRequest: request,
      grounding,
      traversalStatus: valid ? traversalStatus as TraversalStatus : "unknown",
      execution: valid ? execution as ExecutionStatus : "unknown",
      cardinality: count.status,
      ...(count.count === undefined ? {} : { observedCount: count.count }),
      coverage: valid ? coverage as CoverageStatus : "unknown",
      continuation: valid ? continuation as ContinuationStatus : "unknown",
      scopeBinding: valid
        ? scopeBinding as ClosureObservation["scopeBinding"]
        : "unbound",
      validation: valid ? "profile_validated" : "invalid",
      evidencePointers: valid
        ? ["/execution", "/items", "/coverage", "/continuation", "/scopeBinding", "/traversalStatus"]
        : [],
      ...(valid ? {} : { notes: ["Generic response does not satisfy the explicit fixture profile"] }),
    });
  },
};

interface PagePair {
  request: JsonObject;
  response: JsonObject;
}

function pagePairs(response: JsonObject): PagePair[] | undefined {
  const pages = response.pages;
  if (!Array.isArray(pages) || pages.length === 0) return undefined;
  const pairs: PagePair[] = [];
  for (const page of pages) {
    if (!isObject(page) || !isObject(page.request) || !isObject(page.response)) {
      return undefined;
    }
    pairs.push({ request: page.request, response: page.response });
  }
  return pairs;
}

function driveProjection(request: JsonObject): boolean {
  const fields = stringValue(request, "fields");
  if (fields === undefined) return false;
  const projected = (name: string): boolean =>
    new RegExp(`(?:^|[,\\s(])${name}(?=$|[,\\s()])`).test(fields);
  return projected("files") &&
    projected("incompleteSearch") &&
    projected("nextPageToken");
}

const googleDrive: SourceProfile = {
  id: "google-drive-files-list",
  version: PROFILE_VERSION,
  assess(request, response, grounding) {
    if (!isValidGrounding(grounding, "google-drive")) {
      return invalidObservation(this.id, this.version, request, grounding, "Grounding is invalid for Google Drive");
    }
    if (!isObject(request) || !isObject(response)) {
      return invalidObservation(this.id, this.version, request, grounding, "Request and response must be objects");
    }

    const pages = pagePairs(response);
    if (response.pages !== undefined && pages === undefined) {
      return invalidObservation(this.id, this.version, request, grounding, "pages is not a nonempty request/response bundle");
    }
    if (pages !== undefined) {
      if (request.pageToken !== undefined || !sameJson(pages[0]!.request, request)) {
        return invalidObservation(this.id, this.version, request, grounding, "Drive aggregate must start at the exact root request without pageToken");
      }
      let count = 0;
      let priorToken: string | undefined;
      let partial = false;
      for (const [index, page] of pages.entries()) {
        if (!sameJson(withoutKey(page.request, "pageToken"), request)) {
          return invalidObservation(this.id, this.version, request, grounding, `Drive page ${index + 1} changed the root query`);
        }
        if (!driveProjection(page.request)) {
          return invalidObservation(this.id, this.version, request, grounding, `Drive page ${index + 1} omitted closure fields`);
        }
        const suppliedToken = stringValue(page.request, "pageToken");
        if (index === 0 ? suppliedToken !== undefined : suppliedToken !== priorToken) {
          return invalidObservation(this.id, this.version, request, grounding, `Drive page ${index + 1} does not follow the prior nextPageToken`);
        }
        if (executionFromError(page.response) !== "success") {
          return invalidObservation(this.id, this.version, request, grounding, `Drive page ${index + 1} contains an error`);
        }
        const files = getArray(page.response, "files");
        const incomplete = explicitBoolean(page.response, "incompleteSearch");
        if (files === undefined || incomplete === undefined) {
          return invalidObservation(this.id, this.version, request, grounding, `Drive page ${index + 1} is missing files or incompleteSearch`);
        }
        if (hasOwn(page.response, "nextPageToken") && stringValue(page.response, "nextPageToken") === undefined) {
          return invalidObservation(this.id, this.version, request, grounding, `Drive page ${index + 1} has a malformed nextPageToken`);
        }
        count += files.length;
        partial ||= incomplete;
        priorToken = stringValue(page.response, "nextPageToken");
        if (index < pages.length - 1 && priorToken === undefined) {
          return invalidObservation(this.id, this.version, request, grounding, `Drive page ${index + 1} ended before the supplied bundle`);
        }
      }
      const completed = priorToken === undefined;
      const countResult = cardinalityFromCount(count);
      return observation({
        profileId: this.id,
        profileVersion: this.version,
        rootRequest: request,
        grounding,
        segmentRequest: pages.at(-1)!.request,
        traversalStatus: completed ? "aggregate_complete" : "continued",
        pageCount: pages.length,
        execution: "success",
        cardinality: countResult.status,
        observedCount: count,
        coverage: partial ? "partial" : completed ? "complete" : "partial",
        continuation: completed ? "exhausted" : "present",
        validation: "profile_validated",
        evidencePointers: pages.flatMap((_, index) => [
          `/pages/${index}/request`,
          `/pages/${index}/response/files`,
          `/pages/${index}/response/incompleteSearch`,
          `/pages/${index}/response/nextPageToken`,
        ]),
      });
    }

    const execution = executionFromError(response);
    if (execution !== "success") {
      return observation({
        profileId: this.id,
        profileVersion: this.version,
        rootRequest: request,
        grounding,
        traversalStatus: request.pageToken === undefined ? "unknown" : "segment_only",
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
      return invalidObservation(this.id, this.version, request, grounding, "files is not an array");
    }
    const projection = driveProjection(request);
    const incomplete = explicitBoolean(response, "incompleteSearch");
    if (hasOwn(response, "nextPageToken") && stringValue(response, "nextPageToken") === undefined) {
      return invalidObservation(this.id, this.version, request, grounding, "nextPageToken is present but is not a string");
    }
    const nextToken = stringValue(response, "nextPageToken");
    const isContinuationSegment = request.pageToken !== undefined;
    const traversalStatus: TraversalStatus = !projection || incomplete === undefined
      ? "unknown"
      : isContinuationSegment
        ? "segment_only"
        : nextToken === undefined
          ? "single_page_complete"
          : "continued";
    return observation({
      profileId: this.id,
      profileVersion: this.version,
      rootRequest: request,
      grounding,
      traversalStatus,
      execution,
      cardinality: files.length === 0 ? "zero" : "nonzero",
      observedCount: files.length,
      coverage: !projection || incomplete === undefined
        ? "unknown"
        : incomplete || nextToken !== undefined ? "partial" : "complete",
      continuation: !projection ? "unknown" : nextToken === undefined ? "exhausted" : "present",
      validation: "profile_validated",
      evidencePointers: ["/files", "/incompleteSearch", "/nextPageToken"],
      ...(isContinuationSegment
        ? { notes: ["A final continuation segment is not proof that earlier pages were empty"] }
        : {}),
    });
  },
};

const dynamoDb: SourceProfile = {
  id: "aws-dynamodb-query",
  version: PROFILE_VERSION,
  assess(request, response, grounding) {
    if (!isValidGrounding(grounding, "aws-dynamodb")) {
      return invalidObservation(this.id, this.version, request, grounding, "Grounding is invalid for DynamoDB");
    }
    if (!isObject(request) || !isObject(response)) {
      return invalidObservation(this.id, this.version, request, grounding, "Request and response must be objects");
    }
    const pages = pagePairs(response);
    if (response.pages !== undefined && pages === undefined) {
      return invalidObservation(this.id, this.version, request, grounding, "pages is not a nonempty request/response bundle");
    }
    if (pages !== undefined) {
      if (request.ExclusiveStartKey !== undefined || !sameJson(pages[0]!.request, request)) {
        return invalidObservation(this.id, this.version, request, grounding, "DynamoDB aggregate must start at the exact root request without ExclusiveStartKey");
      }
      let count = 0;
      let priorKey: JsonObject | undefined;
      for (const [index, page] of pages.entries()) {
        if (!sameJson(withoutKey(page.request, "ExclusiveStartKey"), request)) {
          return invalidObservation(this.id, this.version, request, grounding, `DynamoDB page ${index + 1} changed the root query`);
        }
        const suppliedKey = isObject(page.request.ExclusiveStartKey)
          ? page.request.ExclusiveStartKey
          : undefined;
        if (index === 0 ? suppliedKey !== undefined : suppliedKey === undefined || !sameJson(suppliedKey, priorKey!)) {
          return invalidObservation(this.id, this.version, request, grounding, `DynamoDB page ${index + 1} does not follow the prior LastEvaluatedKey`);
        }
        if (executionFromError(page.response) !== "success") {
          return invalidObservation(this.id, this.version, request, grounding, `DynamoDB page ${index + 1} contains an error`);
        }
        const items = getArray(page.response, "Items");
        if (items === undefined) {
          return invalidObservation(this.id, this.version, request, grounding, `DynamoDB page ${index + 1} has no Items array`);
        }
        count += items.length;
        const lastKey = page.response.LastEvaluatedKey;
        if (hasOwn(page.response, "LastEvaluatedKey") && !isObject(lastKey)) {
          return invalidObservation(this.id, this.version, request, grounding, `DynamoDB page ${index + 1} has a malformed LastEvaluatedKey`);
        }
        priorKey = isObject(lastKey) && Object.keys(lastKey).length > 0 ? lastKey : undefined;
        if (index < pages.length - 1 && priorKey === undefined) {
          return invalidObservation(this.id, this.version, request, grounding, `DynamoDB page ${index + 1} ended before the supplied bundle`);
        }
      }
      const completed = priorKey === undefined;
      return observation({
        profileId: this.id,
        profileVersion: this.version,
        rootRequest: request,
        grounding,
        segmentRequest: pages.at(-1)!.request,
        traversalStatus: completed ? "aggregate_complete" : "continued",
        pageCount: pages.length,
        execution: "success",
        cardinality: count === 0 ? "zero" : "nonzero",
        observedCount: count,
        coverage: completed ? "complete" : "partial",
        continuation: completed ? "exhausted" : "present",
        validation: "profile_validated",
        evidencePointers: pages.flatMap((_, index) => [
          `/pages/${index}/request`,
          `/pages/${index}/response/Items`,
          `/pages/${index}/response/LastEvaluatedKey`,
        ]),
      });
    }

    const execution = executionFromError(response);
    if (execution !== "success") {
      return observation({
        profileId: this.id,
        profileVersion: this.version,
        rootRequest: request,
        grounding,
        traversalStatus: request.ExclusiveStartKey === undefined ? "unknown" : "segment_only",
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
      return invalidObservation(this.id, this.version, request, grounding, "Items is not an array");
    }
    const lastKey = response.LastEvaluatedKey;
    if (hasOwn(response, "LastEvaluatedKey") && !isObject(lastKey)) {
      return invalidObservation(this.id, this.version, request, grounding, "LastEvaluatedKey is present but is not an object");
    }
    const hasLastKey = isObject(lastKey) && Object.keys(lastKey).length > 0;
    const isContinuationSegment = request.ExclusiveStartKey !== undefined;
    return observation({
      profileId: this.id,
      profileVersion: this.version,
      rootRequest: request,
      grounding,
      traversalStatus: isContinuationSegment
        ? "segment_only"
        : hasLastKey ? "continued" : "single_page_complete",
      execution,
      cardinality: items.length === 0 ? "zero" : "nonzero",
      observedCount: items.length,
      coverage: hasLastKey ? "partial" : "complete",
      continuation: hasLastKey ? "present" : "exhausted",
      validation: "profile_validated",
      evidencePointers: ["/Items", "/LastEvaluatedKey"],
      ...(isContinuationSegment
        ? { notes: ["A final continuation segment is not proof that earlier pages were empty"] }
        : {}),
    });
  },
};

function unsupportedElasticsearchRequest(request: JsonObject): boolean {
  const terminateAfter = numericValue(request, "terminate_after");
  return request.scroll !== undefined ||
    request.search_after !== undefined ||
    (terminateAfter !== undefined && terminateAfter > 0) ||
    request.track_total_hits === false ||
    request.ignore_unavailable === true;
}

function targetsRemoteElasticsearchCluster(request: JsonObject): boolean {
  const index = request.index;
  if (typeof index === "string") return index.includes(":");
  return Array.isArray(index) && index.some(
    (item) => typeof item === "string" && item.includes(":"),
  );
}

const elasticsearch: SourceProfile = {
  id: "elasticsearch-search-zero",
  version: PROFILE_VERSION,
  assess(request, response, grounding) {
    if (!isValidGrounding(grounding, "elasticsearch")) {
      return invalidObservation(this.id, this.version, request, grounding, "Grounding is invalid for Elasticsearch");
    }
    if (!isObject(request) || !isObject(response)) {
      return invalidObservation(this.id, this.version, request, grounding, "Request and response must be objects");
    }
    const elasticInstance = grounding.sourceContext.instance;
    if (
      !isObject(elasticInstance) ||
      elasticInstance.mode !== "local" ||
      hasOwn(response, "_clusters") ||
      targetsRemoteElasticsearchCluster(request)
    ) {
      return invalidObservation(
        this.id,
        this.version,
        request,
        grounding,
        "Profile v0.3 supports explicitly grounded local-cluster searches only",
      );
    }
    const execution = executionFromError(response);
    if (execution !== "success") {
      return observation({
        profileId: this.id,
        profileVersion: this.version,
        rootRequest: request,
        grounding,
        traversalStatus: "unknown",
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
      return invalidObservation(this.id, this.version, request, grounding, "hits.hits, hits.total, or _shards is missing");
    }
    const timedOut = explicitBoolean(response, "timed_out");
    const terminatedEarly = explicitBoolean(response, "terminated_early");
    const relation = stringValue(total, "relation");
    const totalValue = nonnegativeInteger(total, "value");
    const failed = nonnegativeInteger(shards, "failed");
    const successful = nonnegativeInteger(shards, "successful");
    const shardTotal = nonnegativeInteger(shards, "total");
    const malformedTerminatedEarly = hasOwn(response, "terminated_early") &&
      terminatedEarly === undefined;
    const unsupported = unsupportedElasticsearchRequest(request);
    const explicitPartial = timedOut === true || terminatedEarly === true ||
      (failed !== undefined && failed > 0) || relation === "gte";
    const exactTotal = relation === "eq" && totalValue !== undefined;
    const explicitlyComplete = !unsupported && !malformedTerminatedEarly &&
      !explicitPartial && timedOut === false &&
      failed === 0 && successful !== undefined && shardTotal !== undefined &&
      shardTotal > 0 && successful === shardTotal && exactTotal;
    const count = exactTotal
      ? cardinalityFromCount(totalValue)
      : hitItems.length > 0
        ? cardinalityFromCount(hitItems.length)
        : cardinalityFromCount(undefined);
    return observation({
      profileId: this.id,
      profileVersion: this.version,
      rootRequest: request,
      grounding,
      traversalStatus: explicitlyComplete ? "single_page_complete" : "unknown",
      execution,
      cardinality: count.status,
      ...(count.count === undefined ? {} : { observedCount: count.count }),
      coverage: explicitPartial ? "partial" : explicitlyComplete ? "complete" : "unknown",
      continuation: explicitlyComplete ? "exhausted" : "unknown",
      validation: "profile_validated",
      evidencePointers: ["/timed_out", "/terminated_early", "/_shards", "/hits/total", "/hits/hits"],
      ...(unsupported ? { notes: ["Request variant is unsupported by profile v0.3"] } : {}),
    });
  },
};

function resolveGraphqlValue(
  node: ValueNode | undefined,
  variables: JsonObject,
): JsonValue | undefined {
  if (node === undefined) return undefined;
  switch (node.kind) {
    case Kind.VARIABLE:
      return variables[node.name.value];
    case Kind.INT:
      return Number.parseInt(node.value, 10);
    case Kind.STRING:
    case Kind.ENUM:
      return node.value;
    case Kind.BOOLEAN:
      return node.value;
    case Kind.NULL:
      return null;
    default:
      return undefined;
  }
}

interface RelayRequest {
  valid: boolean;
  root: boolean;
  note?: string;
}

function relayRequest(request: JsonObject): RelayRequest {
  const source = stringValue(request, "query");
  const variables = getObject(request, "variables") ?? {};
  const operationName = stringValue(request, "operationName");
  if (source === undefined) return { valid: false, root: false, note: "query is missing" };
  try {
    const document = parse(source);
    const operations = document.definitions.filter(
      (definition): definition is OperationDefinitionNode => definition.kind === Kind.OPERATION_DEFINITION,
    );
    const operation = operationName === undefined
      ? operations.length === 1 ? operations[0] : undefined
      : operations.find((candidate) => candidate.name?.value === operationName);
    if (operation === undefined || operation.operation !== "query") {
      return { valid: false, root: false, note: "exact query operation cannot be selected" };
    }
    const selections = operation.selectionSet.selections;
    const searchFields = selections.filter(
      (selection): selection is FieldNode => selection.kind === Kind.FIELD && selection.name.value === "search",
    );
    const search = searchFields[0];
    if (searchFields.length !== 1 || search === undefined || search.alias !== undefined || search.selectionSet === undefined) {
      return { valid: false, root: false, note: "profile supports an unaliased top-level search connection only" };
    }
    const args = new Map(search.arguments?.map((argument) => [argument.name.value, argument.value]));
    const first = resolveGraphqlValue(args.get("first"), variables);
    const after = resolveGraphqlValue(args.get("after"), variables);
    if (args.has("last") || args.has("before") || typeof first !== "number" || !Number.isInteger(first) || first <= 0) {
      return { valid: false, root: false, note: "profile supports forward first/after pagination only" };
    }
    if (after !== undefined && after !== null && typeof after !== "string") {
      return { valid: false, root: false, note: "after must resolve to a string or null" };
    }
    const edges = search.selectionSet.selections.find(
      (selection): selection is FieldNode => selection.kind === Kind.FIELD && selection.name.value === "edges",
    );
    const pageInfo = search.selectionSet.selections.find(
      (selection): selection is FieldNode => selection.kind === Kind.FIELD && selection.name.value === "pageInfo",
    );
    const hasNextPage = pageInfo?.selectionSet?.selections.some(
      (selection) => selection.kind === Kind.FIELD && selection.name.value === "hasNextPage",
    );
    if (edges === undefined || pageInfo === undefined || hasNextPage !== true) {
      return { valid: false, root: false, note: "edges and pageInfo.hasNextPage must be selected directly" };
    }
    return { valid: true, root: after === undefined || after === null };
  } catch (error) {
    return { valid: false, root: false, note: error instanceof Error ? error.message : String(error) };
  }
}

const graphqlRelay: SourceProfile = {
  id: "graphql-relay-forward-connection",
  version: PROFILE_VERSION,
  assess(request, response, grounding) {
    if (!isValidGrounding(grounding, "graphql-relay")) {
      return invalidObservation(this.id, this.version, request, grounding, "Grounding is invalid for GraphQL Relay");
    }
    if (!isObject(request) || !isObject(response)) {
      return invalidObservation(this.id, this.version, request, grounding, "Request and response must be objects");
    }
    const parsedRequest = relayRequest(request);
    const errors = getArray(response, "errors");
    if (hasOwn(response, "errors") && errors === undefined) {
      return invalidObservation(this.id, this.version, request, grounding, "errors is present but is not an array");
    }
    const data = getObject(response, "data");
    const search = data === undefined ? undefined : getObject(data, "search");
    const edges = search === undefined ? undefined : getArray(search, "edges");
    const pageInfo = search === undefined ? undefined : getObject(search, "pageInfo");
    if (edges === undefined || pageInfo === undefined) {
      return invalidObservation(this.id, this.version, request, grounding, "data.search.edges or pageInfo is missing");
    }
    const hasNextPage = explicitBoolean(pageInfo, "hasNextPage");
    const hasErrors = errors !== undefined && errors.length > 0;
    if (!parsedRequest.valid || hasNextPage === undefined) {
      return observation({
        profileId: this.id,
        profileVersion: this.version,
        rootRequest: request,
        grounding,
        traversalStatus: "unknown",
        execution: hasErrors ? "failed" : "unknown",
        cardinality: edges.length === 0 ? "zero" : "nonzero",
        observedCount: edges.length,
        coverage: "unknown",
        continuation: "unknown",
        scopeBinding: "unbound",
        validation: "invalid",
        evidencePointers: ["/data/search/edges", "/data/search/pageInfo/hasNextPage", "/errors"],
        notes: [parsedRequest.note ?? "Relay request is outside the forward profile"],
      });
    }
    return observation({
      profileId: this.id,
      profileVersion: this.version,
      rootRequest: request,
      grounding,
      traversalStatus: parsedRequest.root
        ? hasNextPage ? "continued" : "single_page_complete"
        : "segment_only",
      execution: hasErrors ? "failed" : "success",
      cardinality: edges.length === 0 ? "zero" : "nonzero",
      observedCount: edges.length,
      coverage: hasErrors || hasNextPage ? "partial" : "complete",
      continuation: hasNextPage ? "present" : "exhausted",
      validation: "profile_validated",
      evidencePointers: ["/data/search/edges", "/data/search/pageInfo/hasNextPage", "/errors"],
      ...(!parsedRequest.root
        ? { notes: ["A final forward continuation segment is not a complete root traversal"] }
        : {}),
    });
  },
};

const graphDelta: SourceProfile = {
  id: "microsoft-graph-delta-traversal",
  version: PROFILE_VERSION,
  assess(request, response, grounding) {
    if (!isValidGrounding(grounding, "microsoft-graph")) {
      return invalidObservation(this.id, this.version, request, grounding, "Grounding is invalid for Microsoft Graph");
    }
    if (!isObject(request) || !isObject(response)) {
      return invalidObservation(this.id, this.version, request, grounding, "Request and response must be objects");
    }
    const rootUrl = stringValue(request, "url");
    const pagesValue = response.pages;
    const parsedRootUrl = absoluteHttpsUrl(rootUrl);
    if (rootUrl === undefined || parsedRootUrl === undefined || !Array.isArray(pagesValue) || pagesValue.length === 0) {
      return invalidObservation(this.id, this.version, request, grounding, "Graph delta requires a root url and a nonempty traversal bundle");
    }
    if (/skiptoken/i.test(rootUrl)) {
      return invalidObservation(this.id, this.version, request, grounding, "Graph delta root URL cannot be a continuation nextLink");
    }
    let count = 0;
    let expectedUrl = rootUrl;
    let lastRequest: JsonValue = request;
    let finalKind: "next" | "delta" | undefined;
    for (const [index, pageValue] of pagesValue.entries()) {
      if (!isObject(pageValue) || typeof pageValue.requestUrl !== "string" || !isObject(pageValue.response)) {
        return invalidObservation(this.id, this.version, request, grounding, `Graph delta page ${index + 1} is malformed`);
      }
      if (pageValue.requestUrl !== expectedUrl) {
        return invalidObservation(this.id, this.version, request, grounding, `Graph delta page ${index + 1} does not follow the prior nextLink`);
      }
      lastRequest = { url: pageValue.requestUrl };
      if (executionFromError(pageValue.response) !== "success") {
        return invalidObservation(this.id, this.version, request, grounding, `Graph delta page ${index + 1} contains an error`);
      }
      const values = getArray(pageValue.response, "value");
      if (values === undefined) {
        return invalidObservation(this.id, this.version, request, grounding, `Graph delta page ${index + 1} has no value array`);
      }
      count += values.length;
      const nextLink = stringValue(pageValue.response, "@odata.nextLink");
      const deltaLink = stringValue(pageValue.response, "@odata.deltaLink");
      if (
        (hasOwn(pageValue.response, "@odata.nextLink") && nextLink === undefined) ||
        (hasOwn(pageValue.response, "@odata.deltaLink") && deltaLink === undefined)
      ) {
        return invalidObservation(this.id, this.version, request, grounding, `Graph delta page ${index + 1} has a malformed traversal link`);
      }
      const traversalLink = nextLink ?? deltaLink;
      const parsedTraversalLink = absoluteHttpsUrl(traversalLink);
      if (
        parsedTraversalLink === undefined ||
        parsedTraversalLink.origin !== parsedRootUrl.origin
      ) {
        return invalidObservation(this.id, this.version, request, grounding, `Graph delta page ${index + 1} has a non-HTTPS, relative, empty, or cross-origin traversal link`);
      }
      if ((nextLink === undefined) === (deltaLink === undefined)) {
        return invalidObservation(this.id, this.version, request, grounding, `Graph delta page ${index + 1} must contain exactly one traversal link`);
      }
      if (deltaLink !== undefined && index !== pagesValue.length - 1) {
        return invalidObservation(this.id, this.version, request, grounding, `Graph delta page ${index + 1} closes before the supplied bundle ends`);
      }
      if (nextLink !== undefined) {
        expectedUrl = nextLink;
        finalKind = "next";
      } else {
        finalKind = "delta";
      }
    }
    const completed = finalKind === "delta";
    return observation({
      profileId: this.id,
      profileVersion: this.version,
      rootRequest: request,
      grounding,
      segmentRequest: lastRequest,
      traversalStatus: completed ? "aggregate_complete" : "continued",
      pageCount: pagesValue.length,
      execution: "success",
      cardinality: count === 0 ? "zero" : "nonzero",
      observedCount: count,
      coverage: completed ? "complete" : "partial",
      continuation: completed ? "exhausted" : "present",
      validation: "profile_validated",
      evidencePointers: pagesValue.flatMap((_, index) => [
        `/pages/${index}/requestUrl`,
        `/pages/${index}/response/value`,
        `/pages/${index}/response/@odata.nextLink`,
        `/pages/${index}/response/@odata.deltaLink`,
      ]),
      notes: [
        "A licensed zero is limited to zero resources or change events in this exact delta round",
      ],
    });
  },
};

const CONTROLLED_SCENARIOS = new Set<ProbeScenario>([
  "complete-zero",
  "partial-zero",
  "continued-zero",
  "denied-zero",
  "failed-zero",
  "scope-mismatch-zero",
  "segment-zero",
]);

const controlledProbe: SourceProfile = {
  id: "closureprobe-controlled-probe",
  version: PROFILE_VERSION,
  assess(request, response, grounding) {
    if (
      !isValidGrounding(grounding, this.id) ||
      !isObject(response) ||
      typeof response.scenario !== "string" ||
      !CONTROLLED_SCENARIOS.has(response.scenario as ProbeScenario)
    ) {
      return invalidObservation(
        this.id,
        this.version,
        request,
        grounding,
        "Controlled probe evidence requires a recognized scenario and matching grounding",
      );
    }
    return createProbePayload(
      response.scenario as ProbeScenario,
      request,
      grounding,
    ).observation;
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

const installedProfiles: ReadonlyMap<string, SourceProfile> = new Map(
  [...profileList, controlledProbe].map((profile) => [profile.id, profile]),
);

export function getSourceProfile(profileId: string): SourceProfile {
  const profile = installedProfiles.get(profileId);
  if (profile === undefined) throw new Error(`Unknown source profile: ${profileId}`);
  return profile;
}

export function assessWithProfile(
  profileId: string,
  request: JsonValue,
  response: JsonValue,
  grounding: SourceGrounding,
): ClosureObservation {
  return getSourceProfile(profileId).assess(request, response, grounding);
}
