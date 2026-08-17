import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { auditAgentDebugRequest } from "../bin/audit-agent-debug-request.mjs";
import {
  compareHarnessEnvelopes,
  verifyPrimaryHarnessEnvelope,
} from "../bin/compare-harness-envelopes.mjs";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const seal = resolve(studyRoot, "bin/seal-agent-debug.mjs");
const study = JSON.parse(readFileSync(resolve(studyRoot, "study.json"), "utf8"));
const commissioning = JSON.parse(
  readFileSync(resolve(studyRoot, "commissioning.json"), "utf8"),
);
const prompt = readFileSync(resolve(studyRoot, "prompts/01.txt"), "utf8");

function createFixture(root, label, overrides = {}) {
  const session = resolve(root, `${label}-session`);
  const sealed = resolve(root, `${label}-sealed`);
  mkdirSync(session, { recursive: true });

  const systemPrompt = overrides.systemPrompt ?? "Fixed neutral Copilot Agent harness envelope.";
  const model = overrides.model ?? study.design.harnessIsolation.model;
  const userRequest = overrides.userRequest ?? prompt;
  const tools = overrides.tools ?? [{
    type: "function",
    name: study.design.harnessIsolation.modelFacingToolName,
    description: "Return controlled query evidence.",
    parameters: { type: "object" },
  }];
  writeFileSync(
    resolve(session, "system_prompt_0.json"),
    `${JSON.stringify({ content: systemPrompt })}\n`,
    "utf8",
  );
  writeFileSync(
    resolve(session, "tools_0.json"),
    `${JSON.stringify({ content: JSON.stringify(tools) })}\n`,
    "utf8",
  );

  const request = {
    type: "llm_request",
    name: `chat:${model}`,
    attrs: {
      model,
      systemPromptFile: "system_prompt_0.json",
      toolsFile: "tools_0.json",
      userRequest,
      inputMessages: overrides.inputMessages ?? JSON.stringify([
        { role: "system", content: systemPrompt },
        { role: "user", content: userRequest },
      ]),
    },
  };
  const toolCall = {
    type: "tool_call",
    name: "closureprobe_probe",
    attrs: {
      args: JSON.stringify({ request: study.request, grounding: study.grounding }),
      result: "withheld synthetic controlled result",
    },
  };
  const records = overrides.records ?? [
    request,
    { type: "agent_response", name: "agent_response", attrs: { response: "tool call" } },
    toolCall,
    ...(overrides.subagent === true
      ? [{ type: "subagent", name: "runSubagent", attrs: {} }]
      : []),
    structuredClone(request),
    {
      type: "agent_response",
      name: "agent_response",
      attrs: { response: '{"study":"closureprobe-vscode-01","claim":"unknown"}' },
    },
    {
      type: "agent_response_metadata",
      attrs: { toolsFile: "tools_99.json", response: "ignored non-request reference" },
    },
  ];
  writeFileSync(
    resolve(session, "main.jsonl"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [seal, "--session-dir", session, "--out-dir", sealed],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return {
    receipt: resolve(sealed, "seal-receipt.json"),
    request,
    toolCall,
  };
}

function writeCompletedFreeze(path, comparison) {
  const extraction = {
    studyId: study.studyId,
    status: "commissioned",
    selectionRuleFrozenBeforePrimary: true,
    harnessEnvelope: {
      arbitrarySystemInstructionsWhitelisted: false,
      automatedComparisonRequiredAcrossAllCommissioningPaths: true,
      automatedComparisonSha256: comparison.comparisonSha256,
      frozenComparisonValues: comparison.frozenComparisonValues,
      manualContentReview: {
        completed: true,
        fixedClientGeneratedOnly: true,
        conditionIndependent: true,
        representationPathIndependent: true,
        semanticOrConditionContentAbsent: true,
        memoryOrUnrelatedInstructionContentAbsent: true,
        nonPredeclaredExecutableToolCapabilityAbsent: true,
      },
    },
  };
  writeFileSync(path, `${JSON.stringify(extraction, null, 2)}\n`, "utf8");
}

function createCompletedFreeze(root) {
  const audits = commissioning.cells.map((cell, index) => {
    const fixture = createFixture(root, `freeze-cell-${index + 1}`);
    return auditAgentDebugRequest(fixture.receipt, { commissioningCellId: cell.id });
  });
  const comparison = compareHarnessEnvelopes(audits);
  const path = resolve(root, "extraction-freeze.json");
  writeCompletedFreeze(path, comparison);
  return { path, comparison, audits };
}

test("request audit proves the frozen v5 model, tools, sidecars, and no subagents", (context) => {
  const root = mkdtempSync(join(tmpdir(), "closureprobe-request-audit-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const fixture = createFixture(root, "passing");
  const audit = auditAgentDebugRequest(fixture.receipt, {
    commissioningCellId: commissioning.cells[0].id,
  });
  assert.equal(audit.valid, true);
  assert.equal(audit.modelRequestCount, 2);
  assert.equal(audit.toolCallCount, 1);
  assert.equal(audit.subagentCount, 0);
  assert.equal(audit.toolDefinitionSidecars.length, 1);
  assert.deepEqual(
    audit.toolDefinitionSidecars[0].toolNames,
    [study.design.harnessIsolation.modelFacingToolName],
  );
  assert.deepEqual(audit.prohibitedContentCategories, []);
  assert.equal(audit.harnessEnvelopeRule.arbitrarySystemInstructionsWhitelisted, false);
  assert.equal(audit.harnessEnvelopeRule.manualContentReviewStillRequired, true);
});

test("request audit rejects an additional tool or housekeeping tool call", (context) => {
  const root = mkdtempSync(join(tmpdir(), "closureprobe-request-audit-reject-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const extraTool = createFixture(root, "extra-tool", {
    tools: [
      { type: "function", name: study.design.harnessIsolation.modelFacingToolName },
      { type: "function", name: "manage_todo_list" },
    ],
  });
  assert.throws(
    () => auditAgentDebugRequest(extraTool.receipt),
    /must expose only/,
  );

  const seed = createFixture(root, "seed");
  const records = [
    seed.request,
    { type: "agent_response", name: "agent_response", attrs: { response: "todo" } },
    { type: "tool_call", name: "manage_todo_list", attrs: { args: "{}" } },
    seed.toolCall,
    structuredClone(seed.request),
    { type: "agent_response", name: "agent_response", attrs: { response: "final" } },
  ];
  const housekeeping = createFixture(root, "housekeeping", { records });
  assert.throws(
    () => auditAgentDebugRequest(housekeeping.receipt),
    /exactly one main tool call/,
  );
});

test("harness comparison requires exact fixed evidence from all three paths", (context) => {
  const root = mkdtempSync(join(tmpdir(), "closureprobe-harness-compare-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const audits = commissioning.cells.map((cell, index) => {
    const fixture = createFixture(root, `cell-${index + 1}`);
    return auditAgentDebugRequest(fixture.receipt, { commissioningCellId: cell.id });
  });
  const comparison = compareHarnessEnvelopes(audits);
  assert.equal(comparison.conditionIndependent, true);
  assert.equal(comparison.representationPathIndependent, true);
  assert.equal(comparison.arbitrarySystemInstructionsWhitelisted, false);
  assert.equal(comparison.manualContentReviewRequired, true);
  assert.equal(comparison.frozenComparisonValues.model, study.design.harnessIsolation.model);
  assert.match(comparison.frozenComparisonValues.toolNamesSha256, /^sha256:[a-f0-9]{64}$/);

  const changed = structuredClone(audits);
  changed[2].firstRequest.systemPromptContentSha256 = `sha256:${"0".repeat(64)}`;
  assert.throws(
    () => compareHarnessEnvelopes(changed),
    /differs at firstRequest\.systemPromptContentSha256/,
  );
  assert.throws(
    () => compareHarnessEnvelopes(audits.slice(0, 2)),
    /Expected 3 commissioning request audits/,
  );
});

test("primary harness verification derives the audit from the receipt and enforces Gate B", (context) => {
  const root = mkdtempSync(join(tmpdir(), "closureprobe-primary-harness-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const freeze = createCompletedFreeze(root);

  const passing = createFixture(root, "primary-passing");
  const verified = verifyPrimaryHarnessEnvelope(passing.receipt, freeze.path);
  assert.equal(verified.audit.valid, true);
  assert.deepEqual(verified.observedValues, freeze.comparison.frozenComparisonValues);

  const incompleteReviewPath = resolve(root, "incomplete-review-extraction-freeze.json");
  const incompleteReview = JSON.parse(readFileSync(freeze.path, "utf8"));
  incompleteReview.harnessEnvelope.manualContentReview.completed = false;
  writeFileSync(incompleteReviewPath, `${JSON.stringify(incompleteReview, null, 2)}\n`, "utf8");
  assert.throws(
    () => verifyPrimaryHarnessEnvelope(passing.receipt, incompleteReviewPath),
    /manual harness content\/privacy review is incomplete/,
  );

  const inconsistentFreezePath = resolve(root, "inconsistent-extraction-freeze.json");
  const inconsistentFreeze = JSON.parse(readFileSync(freeze.path, "utf8"));
  inconsistentFreeze.harnessEnvelope.frozenComparisonValues.firstRequest
    .systemPromptContentSha256 = `sha256:${"0".repeat(64)}`;
  writeFileSync(inconsistentFreezePath, `${JSON.stringify(inconsistentFreeze, null, 2)}\n`, "utf8");
  assert.throws(
    () => verifyPrimaryHarnessEnvelope(passing.receipt, inconsistentFreezePath),
    /values do not match automatedComparisonSha256/,
  );

  const changedModel = createFixture(root, "changed-model", { model: "different-model" });
  assert.throws(
    () => verifyPrimaryHarnessEnvelope(changedModel.receipt, freeze.path),
    /model different-model != MAI-Code-1\.1-Flash/,
  );

  const additionalTool = createFixture(root, "additional-tool-primary", {
    tools: [
      { type: "function", name: study.design.harnessIsolation.modelFacingToolName },
      { type: "function", name: "unrelated_tool" },
    ],
  });
  assert.throws(
    () => verifyPrimaryHarnessEnvelope(additionalTool.receipt, freeze.path),
    /must expose only/,
  );

  const subagent = createFixture(root, "subagent-primary", { subagent: true });
  assert.throws(
    () => verifyPrimaryHarnessEnvelope(subagent.receipt, freeze.path),
    /Subagent activity is not permitted/,
  );

  const changedSystemPrompt = createFixture(root, "changed-system-prompt", {
    systemPrompt: "Different but still neutral client harness envelope.",
  });
  assert.throws(
    () => verifyPrimaryHarnessEnvelope(changedSystemPrompt.receipt, freeze.path),
    /differs from Gate B at firstRequest\.systemPromptContentSha256/,
  );

  const changedInputBytes = createFixture(root, "changed-input-bytes", {
    inputMessages: JSON.stringify([
      { role: "system", content: "Fixed neutral Copilot Agent harness envelope." },
      { role: "user", content: prompt },
    ], null, 2),
  });
  assert.throws(
    () => verifyPrimaryHarnessEnvelope(changedInputBytes.receipt, freeze.path),
    /differs from Gate B at firstRequest\.inputMessagesSha256/,
  );

  const changedInputStructure = createFixture(root, "changed-input-structure", {
    inputMessages: JSON.stringify([{ role: "user", content: prompt }]),
  });
  const changedStructureAudit = auditAgentDebugRequest(changedInputStructure.receipt);
  const structureControlAudits = freeze.audits.map((audit) => {
    const controlled = structuredClone(audit);
    controlled.firstRequest.inputMessagesSha256 =
      changedStructureAudit.firstRequest.inputMessagesSha256;
    return controlled;
  });
  const structureControlComparison = compareHarnessEnvelopes(structureControlAudits);
  const structureControlPath = resolve(root, "structure-control-extraction-freeze.json");
  writeCompletedFreeze(structureControlPath, structureControlComparison);
  assert.throws(
    () => verifyPrimaryHarnessEnvelope(changedInputStructure.receipt, structureControlPath),
    /differs from Gate B at firstRequest\.inputMessagesStructureSha256/,
  );

  const changedUserRequest = createFixture(root, "changed-user-request", {
    userRequest: `${prompt}\n`,
  });
  assert.throws(
    () => verifyPrimaryHarnessEnvelope(changedUserRequest.receipt, freeze.path),
    /userRequest differs from the frozen prompt bytes/,
  );

  const missingSidecar = createFixture(root, "missing-sidecar-primary");
  rmSync(resolve(missingSidecar.receipt, "../sidecar-system_prompt_0.json"));
  assert.throws(
    () => verifyPrimaryHarnessEnvelope(missingSidecar.receipt, freeze.path),
    /Sealed Agent Debug artifact missing: sidecar-system_prompt_0\.json/,
  );
});

test("primary harness verification ignores an operator-authored audit claim", (context) => {
  const root = mkdtempSync(join(tmpdir(), "closureprobe-primary-audit-source-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const freeze = createCompletedFreeze(root);
  const changedModel = createFixture(root, "operator-claim-cannot-override", {
    model: "operator-claimed-passing-model",
  });
  const extraction = JSON.parse(readFileSync(freeze.path, "utf8"));
  extraction.operatorAuthoredRequestAudit = {
    format: "closureprobe-agent-debug-request-audit-v5",
    valid: true,
    note: "This untrusted claim must not override receipt-bound evidence.",
  };
  writeFileSync(freeze.path, `${JSON.stringify(extraction, null, 2)}\n`, "utf8");
  assert.throws(
    () => verifyPrimaryHarnessEnvelope(changedModel.receipt, freeze.path),
    /operator-claimed-passing-model != MAI-Code-1\.1-Flash/,
  );
});
