#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateInvalidRunsLedger } from "./invalid-runs.mjs";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const matrix = JSON.parse(readFileSync(resolve(studyRoot, "matrix.json"), "utf8"));
const runOrder = JSON.parse(readFileSync(resolve(studyRoot, "run-order.json"), "utf8"));
const study = JSON.parse(readFileSync(resolve(studyRoot, "study.json"), "utf8"));
const invalidRuns = JSON.parse(readFileSync(resolve(studyRoot, "invalid-runs.json"), "utf8"));
const invalidRunSummary = validateInvalidRunsLedger(
  invalidRuns,
  study,
  matrix,
  runOrder,
);
const invalidExhausted = new Set(invalidRunSummary.invalidExhaustedCellIds);
const resultsRoot = resolve(studyRoot, "evidence/public/results");
const outputPath = resolve(studyRoot, "RESULTS.md");

const rows = runOrder.entries.map((entry) => {
  const cell = matrix.cells.find(({ id }) => id === entry.cellId);
  if (cell === undefined) throw new Error(`Run order references unknown cell ${entry.cellId}`);
  const path = resolve(resultsRoot, `${cell.id}.json`);
  if (!existsSync(path)) {
    return {
      cell,
      status: invalidExhausted.has(cell.id) ? "invalid_exhausted" : "pending",
      position: entry.position,
      client: "—",
      model: "—",
      cumulative: "—",
      claim: "—",
      license: "—",
      firstChange: "—",
      localization: "—",
      firstLoss: "—",
      firstStrengthening: "—",
    };
  }
  const result = JSON.parse(readFileSync(path, "utf8"));
  if (invalidExhausted.has(cell.id)) {
    throw new Error(`${cell.id}.json exists after both permitted attempts were invalid`);
  }
  if (result.studyId !== matrix.studyId || result.cell?.id !== cell.id) {
    throw new Error(`${cell.id}.json does not identify the expected study cell`);
  }
  const invalidAttempts = invalidRunSummary.attemptsByCell.get(cell.id) ?? new Set();
  if (
    !Number.isSafeInteger(result.run?.attempt) ||
    result.run.attempt < 1 ||
    result.run.attempt > 2 ||
    invalidAttempts.has(result.run.attempt) ||
    (result.run.attempt === 2 && !invalidAttempts.has(1))
  ) {
    throw new Error(`${cell.id}.json contradicts the frozen attempt ledger`);
  }
  return {
    cell,
    status: "observed",
    position: entry.position,
    client: result.endpoints.pClient,
    model: result.endpoints.pModel,
    cumulative: result.endpoints.pCumulative,
    claim: result.endpoints.explicitClaim,
    license: result.endpoints.claimLicense,
    firstChange: result.endpoints.firstObservableNormativeChange ?? "none observed",
    localization: result.endpoints.localizationStatus,
    firstLoss: result.endpoints.firstGuardSignalLossBoundary ?? "none observed",
    firstStrengthening: result.endpoints.firstUnsupportedStrengtheningBoundary ?? "none observed",
  };
});

const observed = rows.filter(({ status }) => status === "observed").length;
const exhausted = rows.filter(({ status }) => status === "invalid_exhausted").length;
const lines = [
  "# External Boundary Study 01 — Results",
  "",
  `Status: **${observed === 0 && exhausted === 0 && invalidRunSummary.attemptCount === 0
    ? "primary execution pending"
    : `${observed}/${rows.length} primary cells observed; ${exhausted} invalid_exhausted`}**`,
  "",
  "Commissioning runs are excluded. This ledger reports a preregistered structural",
  "case series, not product-wide rates or safety claims.",
  `Invalid primary attempts retained: **${invalidRunSummary.attemptCount}**`,
  `Cells invalid_exhausted after two invalid attempts: **${exhausted}**`,
  "",
  "| Order | Cell | Scenario | Carrier | Status | P_client | P_model | P cumulative | C claim | C license | First change | Localization | Guard loss | Unsupported strengthening |",
  "| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map(({ position, cell, status, client, model, cumulative, claim, license, firstChange, localization, firstLoss, firstStrengthening }) =>
    `| ${position} | ${cell.id} | ${cell.scenario} | ${cell.carrier} | ${status} | ${client} | ${model} | ${cumulative} | ${claim} | ${license} | ${firstChange} | ${localization} | ${firstLoss} | ${firstStrengthening} |`
  ),
  "",
  observed === 0
    ? "No primary VS Code/Copilot result is claimed yet; pre-primary v3 commissioning diagnostics are excluded and are not reused as v4 commissioning evidence."
    : "Interpret every row only with the frozen specimen tuple and its public result artifact.",
  "A cell marked `invalid_exhausted` receives no third attempt; its affected preregistered contrasts remain incomplete while the matrix continues.",
];
const content = `${lines.join("\n")}\n`;

if (process.argv.includes("--check")) {
  if (readFileSync(outputPath, "utf8") !== content) throw new Error("RESULTS.md is stale");
  process.stdout.write("Study results ledger verified\n");
} else {
  writeFileSync(outputPath, content, "utf8");
  process.stdout.write(`Study results ledger generated (${observed}/${rows.length} observed)\n`);
}
