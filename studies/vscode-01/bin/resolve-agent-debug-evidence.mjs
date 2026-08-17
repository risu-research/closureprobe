import { dirname, resolve } from "node:path";

import { inspectAgentDebug } from "./inspect-agent-debug.mjs";
import { verifyAgentDebugSeal } from "./verify-agent-debug-seal.mjs";

function requireObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a nonempty string`);
  }
  return value;
}

function absoluteFrom(baseFile, selectedPath) {
  return resolve(dirname(resolve(baseFile)), selectedPath);
}

export function resolveAgentDebugEvidence(
  selectionPath,
  selection,
  options = {},
) {
  requireObject(selection, "selection");

  for (const legacyField of [
    "otlpExport",
    "otlpSha256",
    "agentDebugArtifact",
    "agentDebugSha256",
  ]) {
    if (Object.hasOwn(selection, legacyField)) {
      throw new Error(
        `${legacyField} is not permitted by the v5 sealed-receipt evidence contract`,
      );
    }
  }

  const receiptPath = absoluteFrom(
    selectionPath,
    requireString(
      selection.agentDebugSealReceipt,
      "agentDebugSealReceipt",
    ),
  );

  const selectedReceiptSha256 = requireString(
    selection.agentDebugSealReceiptSha256,
    "agentDebugSealReceiptSha256",
  );

  const sealVerification =
    verifyAgentDebugSeal(receiptPath);

  if (
    sealVerification.receiptSha256 !==
    selectedReceiptSha256
  ) {
    throw new Error(
      "Agent Debug seal receipt digest does not match the selection record",
    );
  }

  const artifactPath = resolve(
    dirname(receiptPath),
    sealVerification.mainArtifact.sealedFile,
  );

  const inspection = inspectAgentDebug(
    artifactPath,
    options,
  );

  if (
    inspection.sourceSha256 !==
    sealVerification.mainArtifact.sha256
  ) {
    throw new Error(
      "Inspected Agent Debug main artifact differs from the receipt-bound digest",
    );
  }

  return {
    receiptPath,
    artifactPath,
    sealVerification,
    inspection,
    auxiliaryArtifacts:
      sealVerification.artifacts.filter(
        ({ role }) => role !== "main",
      ),
  };
}
