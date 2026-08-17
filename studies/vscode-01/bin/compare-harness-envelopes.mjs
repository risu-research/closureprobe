#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { canonicalizeJson } from "../../../dist/src/index.js";
import { auditAgentDebugRequest } from "./audit-agent-debug-request.mjs";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const commissioning = JSON.parse(
  readFileSync(resolve(studyRoot, "commissioning.json"), "utf8"),
);

function requireAudit(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.format !== "closureprobe-agent-debug-request-audit-v5" ||
    value.valid !== true
  ) {
    throw new Error(`${label} is not a passing Version 5 request audit`);
  }
  return value;
}

function readAudit(path) {
  return requireAudit(JSON.parse(readFileSync(resolve(path), "utf8")), path);
}

function exactValue(audit, path) {
  return path.split(".").reduce((value, part) => value?.[part], audit);
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

const exactPaths = [
  "model",
  "firstRequest.systemPromptContentSha256",
  "firstRequest.inputMessagesSha256",
  "firstRequest.inputMessagesStructureSha256",
  "firstRequest.userRequestSha256",
];

function requireDigest(value, label) {
  if (typeof value !== "string" || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return value;
}

function toolNamesDigest(audit, label) {
  if (!Array.isArray(audit.toolDefinitionSidecars) || audit.toolDefinitionSidecars.length === 0) {
    throw new Error(`${label} has no sealed tool-definition sidecar evidence`);
  }
  const values = [...new Set(audit.toolDefinitionSidecars.map(
    ({ toolNamesSha256 }) => requireDigest(toolNamesSha256, `${label} toolNamesSha256`),
  ))];
  if (values.length !== 1) {
    throw new Error(`${label} changed its tool-name surface between requests`);
  }
  return values[0];
}

export function harnessEnvelopeValues(audit) {
  requireAudit(audit, "request audit");
  const values = Object.fromEntries(exactPaths.map((path) => {
    const value = exactValue(audit, path);
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Harness audit is missing ${path}`);
    }
    return [path, value];
  }));
  return {
    model: values.model,
    firstRequest: {
      systemPromptContentSha256: values["firstRequest.systemPromptContentSha256"],
      inputMessagesSha256: values["firstRequest.inputMessagesSha256"],
      inputMessagesStructureSha256: values["firstRequest.inputMessagesStructureSha256"],
      userRequestSha256: values["firstRequest.userRequestSha256"],
    },
    toolNamesSha256: toolNamesDigest(audit, "Harness audit"),
  };
}

function comparisonCore(values) {
  return {
    cells: commissioning.cells.map(({ id }) => id).sort(),
    exactComparisons: exactPaths.map((path) => ({
      path,
      value: exactValue(values, path),
    })),
    toolNamesSha256: values.toolNamesSha256,
  };
}

function comparisonDigest(values) {
  return `sha256:${createHash("sha256")
    .update(canonicalizeJson(comparisonCore(values)))
    .digest("hex")}`;
}

function requireCompletedFreeze(extraction) {
  if (extraction === null || typeof extraction !== "object" || Array.isArray(extraction)) {
    throw new Error("Gate-B extraction freeze must be an object");
  }
  if (extraction.studyId !== commissioning.studyId) {
    throw new Error("Gate-B extraction freeze studyId mismatch");
  }
  if (extraction.selectionRuleFrozenBeforePrimary !== true) {
    throw new Error("Gate-B extraction rule was not frozen before primary execution");
  }
  const envelope = extraction.harnessEnvelope;
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new Error("Gate-B extraction freeze has no harnessEnvelope");
  }
  if (
    envelope.automatedComparisonRequiredAcrossAllCommissioningPaths !== true ||
    envelope.arbitrarySystemInstructionsWhitelisted !== false
  ) {
    throw new Error("Gate-B harness-envelope contract is incomplete");
  }
  const review = envelope.manualContentReview;
  const requiredReviewFields = [
    "completed",
    "fixedClientGeneratedOnly",
    "conditionIndependent",
    "representationPathIndependent",
    "semanticOrConditionContentAbsent",
    "memoryOrUnrelatedInstructionContentAbsent",
    "nonPredeclaredExecutableToolCapabilityAbsent",
  ];
  if (
    review === null ||
    typeof review !== "object" ||
    Array.isArray(review) ||
    requiredReviewFields.some((field) => review[field] !== true)
  ) {
    throw new Error("Gate-B manual harness content/privacy review is incomplete");
  }
  const frozenValues = envelope.frozenComparisonValues;
  if (
    frozenValues === null ||
    typeof frozenValues !== "object" ||
    Array.isArray(frozenValues)
  ) {
    throw new Error("Gate-B harness freeze has no frozenComparisonValues");
  }
  requireString(frozenValues.model, "frozenComparisonValues.model");
  if (
    frozenValues.firstRequest === null ||
    typeof frozenValues.firstRequest !== "object" ||
    Array.isArray(frozenValues.firstRequest)
  ) {
    throw new Error("frozenComparisonValues.firstRequest must be an object");
  }
  for (const field of [
    "systemPromptContentSha256",
    "inputMessagesSha256",
    "inputMessagesStructureSha256",
    "userRequestSha256",
  ]) {
    requireDigest(frozenValues.firstRequest[field], `frozenComparisonValues.firstRequest.${field}`);
  }
  requireDigest(frozenValues.toolNamesSha256, "frozenComparisonValues.toolNamesSha256");
  const expectedDigest = comparisonDigest(frozenValues);
  if (envelope.automatedComparisonSha256 !== expectedDigest) {
    throw new Error("Gate-B harness values do not match automatedComparisonSha256");
  }
  return { envelope, frozenValues };
}

export function verifyPrimaryHarnessEnvelope(receiptPath, extractionPath) {
  const audit = auditAgentDebugRequest(receiptPath);
  const extraction = JSON.parse(readFileSync(resolve(extractionPath), "utf8"));
  const { envelope, frozenValues } = requireCompletedFreeze(extraction);
  const observedValues = harnessEnvelopeValues(audit);
  for (const path of [...exactPaths, "toolNamesSha256"]) {
    if (exactValue(observedValues, path) !== exactValue(frozenValues, path)) {
      throw new Error(`Primary harness envelope differs from Gate B at ${path}`);
    }
  }
  return {
    audit,
    observedValues,
    automatedComparisonSha256: envelope.automatedComparisonSha256,
  };
}

export function compareHarnessEnvelopes(audits) {
  if (!Array.isArray(audits) || audits.length !== commissioning.cells.length) {
    throw new Error(`Expected ${commissioning.cells.length} commissioning request audits`);
  }
  audits.forEach((audit, index) => requireAudit(audit, `audit ${index + 1}`));

  const expectedCells = commissioning.cells.map(({ id }) => id).sort();
  const observedCells = audits.map(({ cellId }) => cellId).sort();
  if (canonicalizeJson(observedCells) !== canonicalizeJson(expectedCells)) {
    throw new Error("Harness comparison must contain each frozen commissioning cell exactly once");
  }

  const exactComparisons = exactPaths.map((path) => {
    const values = audits.map((audit) => exactValue(audit, path));
    if (values.some((value) => typeof value !== "string" || value.length === 0)) {
      throw new Error(`Harness audit is missing ${path}`);
    }
    if (new Set(values).size !== 1) {
      throw new Error(`Commissioning harness envelope differs at ${path}`);
    }
    return { path, value: values[0] };
  });

  const toolNameDigests = audits.map((audit) => toolNamesDigest(audit, "A commissioning attempt"));
  if (new Set(toolNameDigests).size !== 1) {
    throw new Error("Commissioning representation paths expose different tool-name surfaces");
  }

  const frozenComparisonValues = harnessEnvelopeValues(audits[0]);
  return {
    format: "closureprobe-harness-envelope-comparison-v5",
    status: "automated_comparison_passed_manual_review_required",
    studyId: commissioning.studyId,
    commissioningCells: expectedCells,
    conditionIndependent: true,
    representationPathIndependent: true,
    exactComparisons,
    toolNamesSha256: toolNameDigests[0],
    frozenComparisonValues,
    comparisonSha256: comparisonDigest(frozenComparisonValues),
    arbitrarySystemInstructionsWhitelisted: false,
    manualContentReviewRequired: true,
  };
}

const invokedPath = process.argv[1] === undefined
  ? undefined
  : pathToFileURL(resolve(process.argv[1])).href;

if (invokedPath === import.meta.url) {
  const outIndex = process.argv.indexOf("--out");
  const auditPaths = process.argv.slice(2).filter((value, index, values) =>
    value !== "--out" && (index === 0 || values[index - 1] !== "--out")
  );
  if (auditPaths.length !== commissioning.cells.length) {
    process.stderr.write(
      `Usage: compare-harness-envelopes.mjs ${commissioning.cells.map(() => "AUDIT_JSON").join(" ")} [--out FILE]\n`,
    );
    process.exit(64);
  }
  try {
    const result = compareHarnessEnvelopes(auditPaths.map(readAudit));
    const content = `${JSON.stringify(result, null, 2)}\n`;
    if (outIndex === -1) {
      process.stdout.write(content);
    } else {
      const out = process.argv[outIndex + 1];
      if (out === undefined) throw new Error("Missing value after --out");
      writeFileSync(resolve(out), content, "utf8");
      process.stdout.write(`Harness envelope comparison verified -> ${out}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
