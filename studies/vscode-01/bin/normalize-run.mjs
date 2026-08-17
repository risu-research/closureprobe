#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  analyzeTrace,
  bindProposition,
  canonicalizeJson,
  sha256Digest,
  validateTrace,
} from "../../../dist/src/index.js";
import { resolveAgentDebugEvidence } from "./resolve-agent-debug-evidence.mjs";
import { verifyPrimaryHarnessEnvelope } from "./compare-harness-envelopes.mjs";
import { validateInvalidRunsLedger } from "./invalid-runs.mjs";
import { createStudyStimulus } from "./study-stimulus.mjs";
import { verifyWireTranscript } from "./verify-wire.mjs";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function absoluteFrom(baseFile, selectedPath) {
  return resolve(dirname(baseFile), selectedPath);
}

function requireString(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a nonempty string`);
  }
  return value;
}

function selectedCandidate(candidates, kind, digestField, selector, role) {
  if (selector === null || typeof selector !== "object" || Array.isArray(selector)) {
    throw new Error(`${role} selector must be an object`);
  }
  const digest = requireString(selector.digest, `${role}.digest`);
  const pointer = requireString(selector.pointer, `${role}.pointer`);
  const encoding = requireString(selector.encoding, `${role}.encoding`);
  const matches = candidates.filter(
    (candidate) => candidate.kind === kind &&
      candidate[digestField] === digest &&
      candidate.pointer === pointer &&
      candidate.encoding === encoding,
  );
  if (matches.length !== 1) throw new Error(`${role} selector did not resolve exactly once`);
  return {
    value: matches[0].value,
    location: { pointer, encoding },
  };
}

function selectedCandidateOrUnobservable(candidates, kind, digestField, selector, role) {
  if (
    selector !== null &&
    typeof selector === "object" &&
    !Array.isArray(selector) &&
    selector.unobservable === true
  ) {
    return {
      value: undefined,
      location: null,
      unobservable: true,
      reason: requireString(selector.reason, `${role}.reason`),
    };
  }
  if (kind !== "probe_payload") {
    return { ...selectedCandidate(candidates, kind, digestField, selector, role), unobservable: false };
  }
  const digest = requireString(selector.digest, `${role}.digest`);
  const pointer = requireString(selector.pointer, `${role}.pointer`);
  const encoding = requireString(selector.encoding, `${role}.encoding`);
  const matches = candidates.filter(
    (candidate) => ["probe_payload", "json_value"].includes(candidate.kind) &&
      (candidate.payloadDigest ?? candidate.valueDigest) === digest &&
      candidate.pointer === pointer &&
      candidate.encoding === encoding,
  );
  if (matches.length !== 1) throw new Error(`${role} selector did not resolve exactly once`);
  return {
    value: matches[0].value,
    location: { pointer, encoding, candidateKind: matches[0].kind },
    unobservable: false,
  };
}

function selectedClaimOrResponseError(candidates, selector, studyId) {
  if (
    selector !== null &&
    typeof selector === "object" &&
    !Array.isArray(selector) &&
    selector.invalidResponse === true
  ) {
    if (candidates.some(({ kind }) => kind === "study_claim")) {
      throw new Error("claim.invalidResponse cannot override an exact study claim candidate");
    }
    return {
      value: { study: studyId, claim: "response_error" },
      location: null,
      invalidResponse: true,
      reason: requireString(selector.reason, "claim.reason"),
    };
  }
  return {
    ...selectedCandidate(candidates, "study_claim", "claimDigest", selector, "claim"),
    invalidResponse: false,
  };
}

const normativeObservationPaths = [
  "profileId",
  "profileVersion",
  "queryBinding.algorithm",
  "queryBinding.requestDigest",
  "queryBinding.status",
  "groundingBinding.algorithm",
  "groundingBinding.sourceContextDigest",
  "groundingBinding.propositionScopeDigest",
  "traversalBinding.algorithm",
  "traversalBinding.rootRequestDigest",
  "traversalBinding.segmentRequestDigest",
  "traversalBinding.status",
  "traversalBinding.pageCount",
  "execution",
  "cardinality",
  "observedCount",
  "coverage",
  "continuation",
  "scopeBinding",
  "validation",
  "evidencePointers",
];

function valueAtPath(value, path) {
  return path.split(".").reduce(
    (current, part) => current !== null && typeof current === "object"
      ? current[part]
      : undefined,
    value,
  );
}

function normativeObservation(value) {
  return Object.fromEntries(normativeObservationPaths.map((path) => {
    const selected = valueAtPath(value, path);
    return [path, selected === undefined ? { state: "missing" } : selected];
  }));
}

function normativePayload(value) {
  const observation = value?.observation !== null && typeof value?.observation === "object"
    ? value.observation
    : value !== null && typeof value === "object" && (
      Object.hasOwn(value, "profileId") ||
      Object.hasOwn(value, "execution") ||
      Object.hasOwn(value, "coverage")
    )
      ? value
      : undefined;
  return {
    format: value?.format ?? { state: "missing" },
    request: value?.request ?? { state: "missing" },
    grounding: value?.grounding ?? { state: "missing" },
    observation: normativeObservation(observation),
  };
}

function observationFromPayload(value) {
  if (value?.observation !== null && typeof value?.observation === "object") {
    return value.observation;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    (Object.hasOwn(value, "profileId") || Object.hasOwn(value, "execution") || Object.hasOwn(value, "coverage"))
  ) {
    return value;
  }
  return undefined;
}

function preservation(expected, observed, unobservable = false) {
  if (unobservable) return "P3_unobservable";
  if (canonicalizeJson(expected) === canonicalizeJson(observed)) return "P0_exact";
  if (
    canonicalizeJson(normativePayload(expected)) ===
      canonicalizeJson(normativePayload(observed))
  ) {
    return "P1_normatively_equivalent";
  }
  return "P2_loss_or_change";
}

function outerPayloadDeltas(expected, observed) {
  return ["format", "request", "grounding"].flatMap((path) => {
    const before = expected?.[path];
    const captured = observed?.[path];
    if (
      before !== undefined &&
      captured !== undefined &&
      canonicalizeJson(before) === canonicalizeJson(captured)
    ) return [];
    return [{
      path,
      before: before === undefined ? { state: "missing" } : before,
      captured: captured === undefined ? { state: "missing" } : captured,
    }];
  });
}

function observationDeltas(expected, observed, normalized) {
  return normativeObservationPaths.flatMap((path) => {
    const before = valueAtPath(expected, path);
    const captured = valueAtPath(observed, path);
    if (
      (before === undefined && captured === undefined) ||
      (before !== undefined && captured !== undefined &&
        canonicalizeJson(before) === canonicalizeJson(captured))
    ) return [];
    const normalizedValue = valueAtPath(normalized, path);
    return [{
      path,
      before: before === undefined ? { state: "missing" } : before,
      captured: captured === undefined ? { state: "missing" } : captured,
      normalized: normalizedValue === undefined ? { state: "missing" } : normalizedValue,
    }];
  });
}

const statusValues = {
  execution: new Set(["success", "denied", "failed", "unknown"]),
  cardinality: new Set(["zero", "nonzero", "unavailable"]),
  coverage: new Set(["complete", "partial", "unknown"]),
  continuation: new Set(["exhausted", "present", "unknown"]),
  scopeBinding: new Set(["exact", "narrower", "mismatch", "unbound"]),
  validation: new Set(["profile_validated", "declared_only", "invalid", "unavailable"]),
  traversal: new Set(["single_page_complete", "aggregate_complete", "continued", "segment_only", "unknown"]),
};

function validDigest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function normalizeObservation(raw, stageId) {
  const diagnostics = [];
  const repairs = [];
  const fallbackDigest = sha256Digest({ stageId, reason: "missing-or-invalid-binding" });
  const recordRepair = (path, issue, normalization) => {
    repairs.push({ path, issue, normalization });
    diagnostics.push(`${path}: ${issue} -> ${normalization}`);
  };
  const choose = (field, value, allowed, fallback) => {
    if (allowed.has(value)) return value;
    recordRepair(field, value === undefined ? "missing" : "invalid", fallback);
    return fallback;
  };
  const chooseString = (field, value, fallback) => {
    if (typeof value === "string" && value.length > 0) return value;
    recordRepair(field, value === undefined ? "missing" : "invalid", fallback);
    return fallback;
  };
  const chooseAlgorithm = (field, value, expected) => {
    if (value === expected) return value;
    recordRepair(field, value === undefined ? "missing" : "invalid", expected);
    return expected;
  };
  const chooseDigest = (field, value) => {
    if (validDigest(value)) return value;
    recordRepair(field, value === undefined ? "missing" : "invalid", "fallback digest");
    return fallbackDigest;
  };
  const query = raw?.queryBinding;
  const grounding = raw?.groundingBinding;
  const traversal = raw?.traversalBinding;
  const cardinality = choose(
    "cardinality",
    raw?.cardinality,
    statusValues.cardinality,
    "unavailable",
  );
  const count = Number.isSafeInteger(raw?.observedCount) && raw.observedCount >= 0
    ? raw.observedCount
    : undefined;
  const cardinalityConsistent = cardinality === "zero"
    ? count === 0
    : cardinality === "nonzero"
      ? count !== undefined && count > 0
      : count === undefined;
  const normalizedCardinality = cardinalityConsistent ? cardinality : "unavailable";
  if (!cardinalityConsistent) {
    recordRepair("observedCount", "inconsistent_with_cardinality", "cardinality unavailable");
  }
  const pageCount = Number.isSafeInteger(traversal?.pageCount) && traversal.pageCount >= 1
    ? traversal.pageCount
    : 1;
  if (pageCount !== traversal?.pageCount) {
    recordRepair(
      "traversalBinding.pageCount",
      traversal?.pageCount === undefined ? "missing" : "invalid",
      "1",
    );
  }
  const evidencePointers = Array.isArray(raw?.evidencePointers)
    ? [...new Set(raw.evidencePointers.filter(
      (value) => typeof value === "string" && value.length > 0,
    ))]
    : [];
  if (
    !Array.isArray(raw?.evidencePointers) ||
    evidencePointers.length !== raw.evidencePointers.length
  ) {
    recordRepair(
      "evidencePointers",
      raw?.evidencePointers === undefined ? "missing" : "invalid",
      "filtered array",
    );
  }
  const result = {
    profileId: chooseString("profileId", raw?.profileId, "unavailable-profile"),
    profileVersion: chooseString("profileVersion", raw?.profileVersion, "unavailable-version"),
    queryBinding: {
      algorithm: chooseAlgorithm(
        "queryBinding.algorithm",
        query?.algorithm,
        "closureprobe-canonical-json-v1",
      ),
      requestDigest: chooseDigest("queryBinding.requestDigest", query?.requestDigest),
      status: choose("queryBinding.status", query?.status, statusValues.scopeBinding, "unbound"),
    },
    groundingBinding: {
      algorithm: chooseAlgorithm(
        "groundingBinding.algorithm",
        grounding?.algorithm,
        "closureprobe-grounding-v1",
      ),
      sourceContextDigest: chooseDigest(
        "groundingBinding.sourceContextDigest",
        grounding?.sourceContextDigest,
      ),
      propositionScopeDigest: chooseDigest(
        "groundingBinding.propositionScopeDigest",
        grounding?.propositionScopeDigest,
      ),
    },
    traversalBinding: {
      algorithm: chooseAlgorithm(
        "traversalBinding.algorithm",
        traversal?.algorithm,
        "closureprobe-traversal-v1",
      ),
      rootRequestDigest: chooseDigest(
        "traversalBinding.rootRequestDigest",
        traversal?.rootRequestDigest,
      ),
      segmentRequestDigest: chooseDigest(
        "traversalBinding.segmentRequestDigest",
        traversal?.segmentRequestDigest,
      ),
      status: choose("traversalBinding.status", traversal?.status, statusValues.traversal, "unknown"),
      pageCount,
    },
    execution: choose("execution", raw?.execution, statusValues.execution, "unknown"),
    cardinality: normalizedCardinality,
    ...(normalizedCardinality === "zero" ? { observedCount: 0 } : {}),
    ...(normalizedCardinality === "nonzero" ? { observedCount: count } : {}),
    coverage: choose("coverage", raw?.coverage, statusValues.coverage, "unknown"),
    continuation: choose("continuation", raw?.continuation, statusValues.continuation, "unknown"),
    scopeBinding: choose("scopeBinding", raw?.scopeBinding, statusValues.scopeBinding, "unbound"),
    validation: choose("validation", raw?.validation, statusValues.validation, "invalid"),
    evidencePointers,
    notes: [
      ...(Array.isArray(raw?.notes) ? raw.notes.filter((value) => typeof value === "string") : []),
      ...(diagnostics.length === 0 ? [] : [`Study normalization: ${diagnostics.join("; ")}`]),
    ],
  };
  return { observation: result, diagnostics, repairs };
}

function stageClaim(claim, proposition, sourceContext) {
  if (claim === "none") {
    return { status: "none", propositionBinding: bindProposition(proposition, sourceContext) };
  }
  return { status: claim === "unknown" ? "unknown" : "no_claim" };
}

const selectionPathArgument = process.argv[2];
if (selectionPathArgument === undefined) {
  process.stderr.write(
    "Usage: normalize-run.mjs SELECTION_JSON [--extraction EXTRACTION_FREEZE_JSON] [--out FILE]\n",
  );
  process.exit(64);
}

const selectionPath = resolve(selectionPathArgument);
const selection = readJson(selectionPath);
const study = readJson(resolve(studyRoot, "study.json"));
const matrix = readJson(resolve(studyRoot, "matrix.json"));
const runOrder = readJson(resolve(studyRoot, "run-order.json"));
const commissioning = readJson(resolve(studyRoot, "commissioning.json"));
const invalidRuns = readJson(resolve(studyRoot, "invalid-runs.json"));
const invalidRunSummary = validateInvalidRunsLedger(
  invalidRuns,
  study,
  matrix,
  runOrder,
  commissioning,
);
if (selection.studyId !== study.studyId) throw new Error("selection studyId mismatch");
const cell = matrix.cells.find(({ id }) => id === selection.cellId);
if (cell === undefined) throw new Error(`Unknown matrix cell ${selection.cellId}`);
const runOrderEntry = runOrder.entries.find(({ cellId }) => cellId === cell.id);
if (runOrderEntry === undefined || runOrderEntry.position !== cell.runOrderPosition) {
  throw new Error("Matrix and run-order artifacts disagree");
}
if (
  selection.run === null ||
  typeof selection.run !== "object" ||
  selection.run.orderPosition !== runOrderEntry.position ||
  !Number.isSafeInteger(selection.run.attempt) ||
  selection.run.attempt < 1 ||
  selection.run.attempt > 2
) {
  throw new Error("selection.run does not match the preregistered order and attempt contract");
}
const invalidAttemptsForCell =
  invalidRunSummary.attemptsByCell.get(`primary:${cell.id}`) ?? new Set();
if (invalidAttemptsForCell.has(selection.run.attempt)) {
  throw new Error("A retained invalid attempt cannot also be normalized as a valid result");
}
if (selection.run.attempt === 2 && !invalidAttemptsForCell.has(1)) {
  throw new Error("Attempt 2 requires retained invalid attempt 1 in invalid-runs.json");
}
if (invalidRunSummary.invalidExhaustedPrimaryCellIds.includes(cell.id)) {
  throw new Error("An invalid_exhausted cell cannot produce a third or later result");
}
for (const field of ["startedAt", "endedAt"]) {
  const timestamp = requireString(selection.run[field], `run.${field}`);
  if (Number.isNaN(Date.parse(timestamp))) throw new Error(`run.${field} is not a timestamp`);
}
if (Date.parse(selection.run.endedAt) < Date.parse(selection.run.startedAt)) {
  throw new Error("run.endedAt precedes run.startedAt");
}

const wirePath = absoluteFrom(selectionPath, requireString(selection.wireTranscript, "wireTranscript"));
const wire = verifyWireTranscript(wirePath);
if (wire.calls.length !== 1) throw new Error("Selected wire transcript must contain exactly one tool call");
const wireCall = wire.calls[0];
if (
  wireCall.cellId !== cell.id ||
  wireCall.conditionId !== cell.conditionId ||
  wireCall.scenario !== cell.scenario ||
  wireCall.carrier !== cell.carrier
) {
  throw new Error("Wire call does not match the selected matrix cell");
}
if (wireCall.argumentsDigest !== sha256Digest(cell.arguments)) {
  throw new Error("Wire arguments differ from the preregistered matrix cell");
}

const {
  receiptPath,
  inspection,
  sealVerification,
  auxiliaryArtifacts,
} = resolveAgentDebugEvidence(
  selectionPath,
  selection,
  { includeValues: true },
);
const extractionIndex = process.argv.indexOf("--extraction");
const extractionPath = extractionIndex === -1
  ? resolve(studyRoot, "extraction.local.json")
  : resolve(requireString(process.argv[extractionIndex + 1], "--extraction"));
const primaryHarnessVerification = verifyPrimaryHarnessEnvelope(
  receiptPath,
  extractionPath,
);
const clientPayload = selectedCandidateOrUnobservable(
  inspection.candidates,
  "probe_payload",
  "payloadDigest",
  selection.clientPayload,
  "client payload",
);
const modelPayload = selectedCandidateOrUnobservable(
  inspection.candidates,
  "probe_payload",
  "payloadDigest",
  selection.modelPayload,
  "model payload",
);
const claimCandidate = selectedClaimOrResponseError(
  inspection.candidates,
  selection.claim,
  study.studyId,
);
const claim = claimCandidate.value;

const knownBoundaries = new Set([
  "mcp_wire",
  "client_tool_event",
  "model_visible_request",
  "final_response",
]);
for (const field of ["observableBoundaries", "hiddenBoundaries"]) {
  if (
    !Array.isArray(selection[field]) ||
    new Set(selection[field]).size !== selection[field].length ||
    selection[field].some((boundary) => !knownBoundaries.has(boundary))
  ) {
    throw new Error(`${field} must contain unique recognized boundary names`);
  }
}
if (selection.observableBoundaries.some((boundary) => selection.hiddenBoundaries.includes(boundary))) {
  throw new Error("A boundary cannot be both observable and hidden");
}
for (const [boundary, selected] of [
  ["client_tool_event", clientPayload],
  ["model_visible_request", modelPayload],
]) {
  if (
    selection.observableBoundaries.includes(boundary) === selected.unobservable ||
    selection.hiddenBoundaries.includes(boundary) !== selected.unobservable
  ) {
    throw new Error(`${boundary} observability metadata contradicts its selector`);
  }
}
for (const boundary of ["mcp_wire", "final_response"]) {
  if (!selection.observableBoundaries.includes(boundary)) {
    throw new Error(`${boundary} must be recorded as observable`);
  }
}

const expectedPayload = createStudyStimulus(
  cell,
  cell.arguments.request,
  cell.arguments.grounding,
);
const normalizedClient = clientPayload.unobservable
  ? null
  : normalizeObservation(observationFromPayload(clientPayload.value), "client-tool-event");
const normalizedModel = modelPayload.unobservable
  ? null
  : normalizeObservation(observationFromPayload(modelPayload.value), "model-visible-request");

const sourceContext = study.grounding.sourceContext;
const proposition = study.proposition;
const evidenceResponse = { scenario: cell.scenario };
const stages = [
  {
    stageId: "source",
    kind: "source",
    observation: expectedPayload.observation,
    claim: { status: "no_claim" },
  },
  {
    stageId: "mcp-wire",
    kind: "mcp_wire",
    observation: expectedPayload.observation,
    claim: { status: "no_claim" },
    rawDigest: wireCall.resultDigest,
  },
];
if (normalizedClient !== null) {
  stages.push({
    stageId: "client-tool-event",
    kind: "client",
    observation: normalizedClient.observation,
    claim: { status: "no_claim" },
  });
}
if (normalizedModel !== null) {
  stages.push(
    {
      stageId: "model-visible-request",
      kind: "model_projection",
      observation: normalizedModel.observation,
      claim: { status: "no_claim" },
    },
    {
      stageId: "final-response",
      kind: "agent_claim",
      observation: normalizedModel.observation,
      claim: stageClaim(claim.claim, proposition, sourceContext),
    },
  );
}
const trace = {
  traceId: `${selection.specimenId}:${cell.id}`,
  request: cell.arguments.request,
  sourceContext,
  proposition,
  rootEvidence: {
    profileId: "closureprobe-controlled-probe",
    profileVersion: study.instrument.profileVersion,
    request: cell.arguments.request,
    response: evidenceResponse,
    grounding: cell.arguments.grounding,
    requestDigest: sha256Digest(cell.arguments.request),
    responseDigest: sha256Digest(evidenceResponse),
  },
  stages,
};

if (!validateTrace(trace)) {
  throw new Error(`Normalized trace is not schema-valid: ${JSON.stringify(validateTrace.errors)}`);
}
const analysis = analyzeTrace(trace);
const pClient = preservation(
  expectedPayload,
  clientPayload.value,
  clientPayload.unobservable,
);
const pModel = clientPayload.unobservable || modelPayload.unobservable
  ? "P3_unobservable"
  : preservation(clientPayload.value, modelPayload.value);
const pCumulative = preservation(
  expectedPayload,
  modelPayload.value,
  modelPayload.unobservable,
);
const firstObservableNormativeChange = pClient === "P2_loss_or_change"
  ? "wire_to_client"
  : pModel === "P2_loss_or_change"
    ? "client_to_model"
    : null;
const localizableBoundaries = new Set([
  ...(clientPayload.unobservable ? [] : ["mcp-wire->client-tool-event"]),
  ...(clientPayload.unobservable || modelPayload.unobservable
    ? []
    : ["client-tool-event->model-visible-request"]),
]);
const firstGuardSignalLossBoundary = analysis.findings.find(
  ({ code, boundary }) => code === "guard_signal_loss" && localizableBoundaries.has(boundary),
)?.boundary ?? null;
const firstUnsupportedStrengtheningBoundary = analysis.findings.find(
  ({ code, boundary }) =>
    ["dangerous_mutation", "unsupported_upgrade"].includes(code) &&
    localizableBoundaries.has(boundary),
)?.boundary ?? null;
const localizationStatus = firstObservableNormativeChange === "wire_to_client"
  ? "localized_wire_to_client"
  : firstObservableNormativeChange === "client_to_model"
    ? "localized_client_to_model"
    : clientPayload.unobservable && !modelPayload.unobservable
      ? "blocked_by_unobservable_client_boundary"
      : modelPayload.unobservable
        ? "no_change_localized_beyond_unobservable_model_boundary"
        : "no_normative_change_observed";
const nonlocalizedCumulativeFindingCodes = clientPayload.unobservable && !modelPayload.unobservable
  ? [...new Set(analysis.findings
    .filter(({ boundary }) => boundary === "mcp-wire->model-visible-request")
    .map(({ code }) => code))]
  : [];
const modelOuterPayloadDeltas = modelPayload.unobservable
  ? null
  : outerPayloadDeltas(expectedPayload, modelPayload.value);
const licenseCriticalNormalizationOccurred = (normalizedModel?.repairs.length ?? 0) > 0;
const licenseCriticalNormalizationPaths = normalizedModel === null
  ? null
  : [...new Set(normalizedModel.repairs.map(({ path }) => path))];
const licenseCriticalVisibilityLossPaths = modelPayload.unobservable
  ? null
  : [
      ...(modelOuterPayloadDeltas ?? []).map(({ path }) => path),
      ...(licenseCriticalNormalizationPaths ?? []).map((path) => `observation.${path}`),
    ];
const licenseCriticalVisibilityLossOccurred =
  (licenseCriticalVisibilityLossPaths?.length ?? 0) > 0;
const claimLicense = claim.claim === "response_error"
  ? "not_evaluable"
  : claim.claim !== "none"
    ? "not_applicable"
    : modelPayload.unobservable
      ? "not_evaluable"
      : licenseCriticalVisibilityLossOccurred
        ? "not_licensed"
        : analysis.findings.some(({ code }) => code === "unlicensed_negative")
          ? "not_licensed"
          : "licensed";
const claimLicenseBasis = claim.claim === "response_error"
  ? "response_error"
  : claim.claim === "unknown"
    ? "negative_claim_declined"
    : modelPayload.unobservable
      ? "model_visible_request_unobservable"
      : licenseCriticalVisibilityLossOccurred
        ? "license_critical_visibility_loss"
        : claimLicense === "not_licensed"
          ? "rc3_unlicensed_negative"
          : "rc3_licensed_negative";
const result = {
  format: "closureprobe-vscode-study-result-v3",
  studyId: study.studyId,
  specimenId: selection.specimenId,
  run: {
    ...selection.run,
    conditionId: cell.conditionId,
  },
  cell: {
    id: cell.id,
    conditionId: cell.conditionId,
    scenario: cell.scenario,
    carrier: cell.carrier,
  },
  sourceArtifacts: {
    wireTranscriptSha256: wire.transcriptSha256,
    agentDebugSealReceiptSha256: sealVerification.receiptSha256,
    agentDebugMainSha256: sealVerification.mainArtifact.sha256,
    requestIsolationAuditSha256: sha256Digest(primaryHarnessVerification.audit),
    gateBHarnessEnvelopeComparisonSha256:
      primaryHarnessVerification.automatedComparisonSha256,
    agentDebugAuxiliaryArtifacts: auxiliaryArtifacts.map(
      ({ role, sealedFile, sha256, bytes }) => ({
        role,
        sealedFile,
        sha256,
        bytes,
      }),
    ),
    rootEvidenceResponseSha256: sha256Digest(evidenceResponse),
    evidencePointerBase: "analysis-side rootEvidence.response",
    modelVisibleRootEvidenceResponse: false,
  },
  selection: {
    clientPayload: { ...selection.clientPayload, location: clientPayload.location },
    modelPayload: { ...selection.modelPayload, location: modelPayload.location },
    claim: { ...selection.claim, location: claimCandidate.location },
    observableBoundaries: selection.observableBoundaries,
    hiddenBoundaries: selection.hiddenBoundaries,
    manualNormalization: selection.manualNormalization,
  },
  observability: {
    clientToolEvent: clientPayload.unobservable
      ? { observable: false, reason: clientPayload.reason }
      : { observable: true },
    modelVisibleRequest: modelPayload.unobservable
      ? { observable: false, reason: modelPayload.reason }
      : { observable: true },
  },
  endpoints: {
    pClient,
    pModel,
    pCumulative,
    firstObservableNormativeChange,
    localizationStatus,
    firstGuardSignalLossBoundary,
    firstUnsupportedStrengtheningBoundary,
    nonlocalizedCumulativeFindingCodes,
    explicitClaim: claim.claim,
    claimLicense,
    claimLicenseBasis,
    licenseCriticalNormalizationOccurred,
    licenseCriticalNormalizationPaths,
    licenseCriticalVisibilityLossOccurred,
    licenseCriticalVisibilityLossPaths,
    representationDeltas: {
      wireToClient: clientPayload.unobservable
        ? null
        : observationDeltas(
          expectedPayload.observation,
          observationFromPayload(clientPayload.value),
          normalizedClient.observation,
        ),
      clientToModel: clientPayload.unobservable || modelPayload.unobservable
        ? null
        : observationDeltas(
          observationFromPayload(clientPayload.value),
          observationFromPayload(modelPayload.value),
          normalizedModel.observation,
        ),
      wireToModel: modelPayload.unobservable
        ? null
        : observationDeltas(
          expectedPayload.observation,
          observationFromPayload(modelPayload.value),
          normalizedModel.observation,
        ),
    },
    payloadDeltas: {
      wireToClient: clientPayload.unobservable
        ? null
        : outerPayloadDeltas(expectedPayload, clientPayload.value),
      clientToModel: clientPayload.unobservable || modelPayload.unobservable
        ? null
        : outerPayloadDeltas(clientPayload.value, modelPayload.value),
      wireToModel: modelPayload.unobservable
        ? null
        : modelOuterPayloadDeltas,
    },
  },
  normalizationDiagnostics: {
    clientToolEvent: normalizedClient?.diagnostics ?? null,
    modelVisibleRequest: normalizedModel?.diagnostics ?? null,
  },
  normalizationRepairs: {
    clientToolEvent: normalizedClient?.repairs ?? null,
    modelVisibleRequest: normalizedModel?.repairs ?? null,
  },
  normalizedTrace: trace,
  analysis,
};

const outIndex = process.argv.indexOf("--out");
const out = outIndex === -1 ? undefined : process.argv[outIndex + 1];
if (out === undefined) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} else {
  writeFileSync(resolve(out), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`Normalized ${cell.id} -> ${out}\n`);
}
