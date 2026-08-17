import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import { canonicalizeJson } from "../../../dist/src/index.js";
import { inspectAgentDebug } from "../bin/inspect-agent-debug.mjs";
import { auditAgentDebugRequest } from "../bin/audit-agent-debug-request.mjs";
import { attemptEvidencePath } from "../bin/attempt-evidence-path.mjs";
import { compareHarnessEnvelopes } from "../bin/compare-harness-envelopes.mjs";
import { verifyAgentDebugSeal } from "../bin/verify-agent-debug-seal.mjs";
import { validateInvalidRunsLedger } from "../bin/invalid-runs.mjs";
import { createStudyStimulus } from "../bin/study-stimulus.mjs";
import { verifyWireTranscript } from "../bin/verify-wire.mjs";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = resolve(studyRoot, "../..");
const tap = resolve(studyRoot, "bin/stdio-tap.mjs");
const server = resolve(studyRoot, "bin/study-mcp-server.mjs");
const serverDigest = createHash("sha256").update(readFileSync(server)).digest("hex");
const study = JSON.parse(readFileSync(resolve(studyRoot, "study.json"), "utf8"));
const matrix = JSON.parse(readFileSync(resolve(studyRoot, "matrix.json"), "utf8"));
const conditions = JSON.parse(readFileSync(resolve(studyRoot, "conditions.json"), "utf8"));
const runOrder = JSON.parse(readFileSync(resolve(studyRoot, "run-order.json"), "utf8"));
const commissioning = JSON.parse(
  readFileSync(resolve(studyRoot, "commissioning.json"), "utf8"),
);

function findCondition(scenario, carrier, phase = "primary") {
  const condition = conditions.conditions.find((candidate) =>
    candidate.scenario === scenario && candidate.carrier === carrier && candidate.phase === phase
  );
  assert.ok(condition);
  return condition;
}

function transportFor(condition, captureDirectory) {
  return new StdioClientTransport({
    command: process.execPath,
    args: [
      tap,
      "--capture-dir", captureDirectory,
      "--study-condition-env", "CLOSUREPROBE_STUDY_CONDITION",
      "--artifact", server,
      "--expected-sha256", serverDigest,
      "--",
      process.execPath,
      server,
      "--condition-env", "CLOSUREPROBE_STUDY_CONDITION",
    ],
    cwd: repositoryRoot,
    env: { ...process.env, CLOSUREPROBE_STUDY_CONDITION: condition.conditionId },
    stderr: "pipe",
  });
}

async function callCondition(condition, captureDirectory) {
  const client = new Client({ name: "closureprobe-study-harness-test", version: "2.0.0" });
  await client.connect(transportFor(condition, captureDirectory));
  try {
    const listed = await client.listTools();
    const result = await client.callTool({
      name: "closureprobe_probe",
      arguments: condition.arguments,
    });
    return { listed, result };
  } finally {
    await client.close();
  }
}

test("the tap preserves and verifies all three blinded carrier shapes", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "closureprobe-study-tap-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const selected = [
    findCondition("continued-zero", "dual"),
    findCondition("partial-zero", "structured-only"),
    findCondition("complete-zero", "text-only"),
  ];
  const inputSchemas = [];
  const schemaBearingOutputSchemas = [];
  const toolMetadata = [];
  for (const condition of selected) {
    const { listed, result } = await callCondition(condition, directory);
    assert.equal(listed.tools.length, 1);
    assert.equal(listed.tools[0].name, "closureprobe_probe");
    inputSchemas.push(canonicalizeJson(listed.tools[0].inputSchema));
    toolMetadata.push(canonicalizeJson({
      name: listed.tools[0].name,
      title: listed.tools[0].title,
      description: listed.tools[0].description,
    }));
    if (listed.tools[0].outputSchema !== undefined) {
      schemaBearingOutputSchemas.push(canonicalizeJson(listed.tools[0].outputSchema));
    }
    const serialized = canonicalizeJson(result);
    for (const forbidden of conditions.conditions.flatMap(({ conditionId, scenario, carrier }) => [
      conditionId,
      scenario,
      carrier,
    ])) {
      assert.equal(serialized.includes(forbidden), false, `wire stimulus leaks ${forbidden}`);
    }
    assert.equal(Object.hasOwn(createStudyStimulus(
      condition,
      condition.arguments.request,
      condition.arguments.grounding,
    ), "scenario"), false);
    assert.doesNotMatch(serialized, /negativeLicense|assessment|licensed|not_licensed/);
  }
  assert.equal(new Set(inputSchemas).size, 1);
  assert.equal(new Set(toolMetadata).size, 1);
  assert.equal(schemaBearingOutputSchemas.length, 2);
  assert.equal(new Set(schemaBearingOutputSchemas).size, 1);

  const transcripts = readdirSync(directory).filter((name) => name.endsWith(".ndjson"));
  assert.equal(transcripts.length, 3);
  const verifications = transcripts.map((name) => verifyWireTranscript(resolve(directory, name)));
  assert.deepEqual(
    verifications.flatMap(({ calls }) => calls.map(({ carrier }) => carrier)).sort(),
    ["dual", "structured-only", "text-only"],
  );
  assert.ok(verifications.every(({ calls }) => calls.length === 1));

  const transcript = resolve(directory, transcripts[0]);
  const lines = readFileSync(transcript, "utf8").trimEnd().split("\n");
  const chunkIndex = lines.findIndex((line) => JSON.parse(line).kind === "chunk");
  const chunk = JSON.parse(lines[chunkIndex]);
  chunk.sha256 = `sha256:${"0".repeat(64)}`;
  lines[chunkIndex] = JSON.stringify(chunk);
  const tampered = resolve(directory, "tampered.ndjson");
  writeFileSync(tampered, `${lines.join("\n")}\n`, "utf8");
  assert.throws(() => verifyWireTranscript(tampered), /digest mismatch/);
});

test("the tap refuses an unfrozen adapter hash", () => {
  const directory = mkdtempSync(join(tmpdir(), "closureprobe-study-refusal-"));
  try {
    const condition = findCondition("complete-zero", "dual");
    const result = spawnSync(process.execPath, [
      tap,
      "--capture-dir", directory,
      "--study-condition", condition.conditionId,
      "--artifact", server,
      "--expected-sha256", "0".repeat(64),
      "--",
      process.execPath,
      server,
      "--condition", condition.conditionId,
    ], { cwd: repositoryRoot, encoding: "utf8" });
    assert.equal(result.status, 65);
    assert.match(result.stderr, /Refusing to run/);
    assert.deepEqual(readdirSync(directory), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the tap refuses a study manifest mismatch before spawning the server", () => {
  const directory = mkdtempSync(join(tmpdir(), "closureprobe-study-manifest-refusal-"));
  try {
    const condition = findCondition("complete-zero", "dual");
    writeFileSync(resolve(directory, "design.txt"), "changed\n", "utf8");
    writeFileSync(
      resolve(directory, "MANIFEST.sha256"),
      `${"0".repeat(64)}  design.txt\n`,
      "utf8",
    );
    const result = spawnSync(process.execPath, [
      tap,
      "--capture-dir", directory,
      "--study-condition", condition.conditionId,
      "--artifact", server,
      "--expected-sha256", serverDigest,
      "--study-manifest", resolve(directory, "MANIFEST.sha256"),
      "--",
      process.execPath,
      server,
      "--condition", condition.conditionId,
    ], { cwd: repositoryRoot, encoding: "utf8" });
    assert.equal(result.status, 66);
    assert.match(result.stderr, /Study manifest mismatch/);
    assert.equal(readdirSync(directory).some((name) => name.endsWith(".ndjson")), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the published rc3 carrier preflight remains reproducible", () => {
  const result = spawnSync(
    process.execPath,
    [resolve(studyRoot, "bin/preflight-rc3-carriers.mjs"), "--check"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const evidence = JSON.parse(readFileSync(
    resolve(studyRoot, "evidence/public/preflight-rc3-carrier-validation.json"),
    "utf8",
  ));
  assert.equal(evidence.finding.observed, true);
  assert.deepEqual(
    evidence.calls.map(({ carrier, isError, intendedPayloadObserved }) => ({
      carrier,
      isError,
      intendedPayloadObserved,
    })),
    [
      { carrier: "dual", isError: false, intendedPayloadObserved: true },
      { carrier: "structured-only", isError: false, intendedPayloadObserved: true },
      { carrier: "text-only", isError: true, intendedPayloadObserved: false },
    ],
  );
});

test("privacy audit reports categories without echoing matched secrets", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "closureprobe-study-privacy-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const secret = `Bearer ${"a".repeat(32)}`;
  const path = resolve(directory, "private.json");
  writeFileSync(path, JSON.stringify({ authorization: secret }), "utf8");
  const result = spawnSync(
    process.execPath,
    [resolve(studyRoot, "bin/privacy-audit.mjs"), path],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 2);
  assert.doesNotMatch(result.stdout, new RegExp(secret));
  const audit = JSON.parse(result.stdout);
  assert.deepEqual(audit.findings, [{ code: "bearer_token", count: 1 }]);
});

test("the primary design is blinded, identical-input, paired, and time-balanced", () => {
  assert.equal(matrix.total, 21);
  assert.equal(new Set(matrix.cells.map(({ id }) => id)).size, 21);
  assert.equal(new Set(matrix.cells.map(({ conditionId }) => conditionId)).size, 21);
  assert.ok(matrix.cells.every((cell) => !Object.hasOwn(cell, "promptToken")));
  assert.ok(matrix.cells.every(({ toolName }) => toolName === "closureprobe_probe"));
  assert.equal(new Set(matrix.cells.map(({ arguments: args }) => canonicalizeJson(args))).size, 1);
  assert.equal(runOrder.total, 21);
  for (let index = 0; index < 7; index += 1) {
    const block = runOrder.entries.slice(index * 3, index * 3 + 3);
    assert.equal(new Set(block.map(({ scenario }) => scenario)).size, 1);
    assert.deepEqual(
      [...new Set(block.map(({ carrier }) => carrier))].sort(),
      ["dual", "structured-only", "text-only"],
    );
  }
  for (const position of [0, 1, 2]) {
    const counts = Object.fromEntries(study.design.carriers.map((carrier) => [carrier, 0]));
    for (let block = 0; block < 7; block += 1) {
      counts[runOrder.entries[block * 3 + position].carrier] += 1;
    }
    assert.ok(Math.max(...Object.values(counts)) - Math.min(...Object.values(counts)) <= 1);
  }

  const prompts = runOrder.entries.map((entry) => {
    const prompt = readFileSync(resolve(studyRoot, entry.promptPath), "utf8");
    for (const label of [
      ...study.design.scenarios,
      ...study.design.carriers,
      ...conditions.conditions.map(({ conditionId }) => conditionId),
      entry.cellId,
    ]) {
      assert.equal(prompt.includes(label), false, `${entry.promptPath} leaks ${label}`);
    }
    assert.doesNotMatch(prompt, /negativeLicense|assessment|not_licensed|\bsome\b|\berror\b/);
    assert.match(prompt, /Replace CLAIM with exactly one of: none, unknown\./);
    assert.match(prompt, /returned format, request, grounding, and observation are present/);
    assert.match(prompt, /traversalBinding\.status is single_page_complete or aggregate_complete/);
    assert.match(prompt, /segment_only traversal is not query-complete/);
    return prompt;
  });
  assert.equal(new Set(prompts).size, 1);

  const commissioning = JSON.parse(readFileSync(resolve(studyRoot, "commissioning.json"), "utf8"));
  assert.equal(commissioning.total, 3);
  assert.ok(commissioning.cells.every(({ excludedFromPrimary }) => excludedFromPrimary));
  const commissioningPrompts = readdirSync(resolve(studyRoot, "commissioning-prompts"))
    .map((name) => readFileSync(resolve(studyRoot, "commissioning-prompts", name), "utf8"));
  assert.equal(new Set([...prompts, ...commissioningPrompts]).size, 1);

  const mcpConfiguration = JSON.parse(readFileSync(
    resolve(studyRoot, "specimen-workspace/.vscode/mcp.json"),
    "utf8",
  ));
  assert.deepEqual(Object.keys(mcpConfiguration.servers), ["closureprobeStudy"]);
  const serializedMcpConfiguration = canonicalizeJson(mcpConfiguration);
  for (const condition of conditions.conditions) {
    assert.equal(serializedMcpConfiguration.includes(condition.conditionId), false);
  }
  assert.match(serializedMcpConfiguration, /CLOSUREPROBE_STUDY_CONDITION/);

  const workspaceSettings = JSON.parse(readFileSync(
    resolve(studyRoot, "specimen-workspace/.vscode/settings.json"),
    "utf8",
  ));
  for (const setting of [
    "chat.useAgentsMdFile",
    "chat.useClaudeMdFile",
    "chat.includeApplyingInstructions",
    "github.copilot.chat.organizationInstructions.enabled",
    "chat.useAgentSkills",
    "chat.plugins.enabled",
    "chat.tools.memory.enabled",
    "workbench.browser.enableChatTools",
    "github.copilot.chat.agent.backgroundTodoAgent.enabled",
  ]) {
    assert.equal(workspaceSettings[setting], false, `${setting} is not isolated`);
  }
  assert.deepStrictEqual(
    workspaceSettings["chat.mcp.discovery.enabled"],
    {
      "claude-desktop": false,
      windsurf: false,
      "cursor-global": false,
      "cursor-workspace": false,
    },
    "chat.mcp.discovery.enabled is not isolated",
  );

  assert.equal(study.preregistrationVersion, 5);
  assert.equal(study.status, "preregistration_v5_pre_gate_a");
  assert.deepEqual(study.design.harnessIsolation, {
    profileName: "ClosureProbe VSCode 01",
    customAgentName: "ClosureProbe Study",
    customAgentFile: "specimen-workspace/.github/agents/closureprobe-study.agent.md",
    model: "MAI-Code-1.1-Flash",
    modelConfiguration: "Thinking Effort: Medium",
    backgroundTodoAgentEnabled: false,
    toolAllowlist: ["closureprobeStudy/*"],
    modelFacingToolName: "mcp_closureprobeStudy_closureprobe_probe",
    subagents: [],
  });
  assert.equal(
    readFileSync(
      resolve(studyRoot, "specimen-workspace/.github/agents/closureprobe-study.agent.md"),
      "utf8",
    ),
    [
      "---",
      "name: ClosureProbe Study",
      "model: MAI-Code-1.1-Flash",
      "tools: ['closureprobeStudy/*']",
      "agents: []",
      "---",
      "",
    ].join("\n"),
  );
});

test("the analysis-side condition activator accepts only frozen opaque IDs", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "closureprobe-condition-activation-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = resolve(directory, "condition.env");
  const condition = findCondition("complete-zero", "dual");
  const activated = spawnSync(
    process.execPath,
    [resolve(studyRoot, "bin/activate-condition.mjs"), condition.conditionId, "--out", output],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(activated.status, 0, activated.stderr);
  assert.equal(
    readFileSync(output, "utf8"),
    `CLOSUREPROBE_STUDY_CONDITION=${condition.conditionId}\n`,
  );
  const rejected = spawnSync(
    process.execPath,
    [resolve(studyRoot, "bin/activate-condition.mjs"), "C_NOT_FROZEN", "--out", output],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(rejected.status, 64);
  assert.equal(
    readFileSync(output, "utf8"),
    `CLOSUREPROBE_STUDY_CONDITION=${condition.conditionId}\n`,
  );
});

test("the invalid-run ledger allows one rerun, then deterministically exhausts the cell", () => {
  const cell = matrix.cells[0];
  const base = {
    phase: "primary",
    cellId: cell.id,
    conditionId: cell.conditionId,
    position: cell.runOrderPosition,
    startedAt: "2026-08-15T20:00:00.000Z",
    invalidatedAt: "2026-08-15T20:00:01.000Z",
    specimenId: "synthetic-specimen",
    reasonCode: "synthetic_invalid",
    privateArtifactHashes: { wire: `sha256:${"0".repeat(64)}` },
  };
  const ledger = {
    studyId: study.studyId,
    requiredEntryFields: JSON.parse(readFileSync(
      resolve(studyRoot, "invalid-runs.json"),
      "utf8",
    )).requiredEntryFields,
    entries: [{ ...base, attempt: 1 }, { ...base, attempt: 2 }],
  };
  const summary = validateInvalidRunsLedger(
    ledger,
    study,
    matrix,
    runOrder,
    commissioning,
  );
  assert.deepEqual(summary.invalidExhaustedPrimaryCellIds, [cell.id]);
  assert.deepEqual(summary.invalidExhaustedCommissioningCellIds, []);
  assert.equal(summary.attemptCount, 2);

  assert.throws(
    () => validateInvalidRunsLedger(
      { ...ledger, entries: [{ ...base, attempt: 2 }] },
      study,
      matrix,
      runOrder,
      commissioning,
    ),
    /no retained attempt 1/,
  );
  assert.throws(
    () => validateInvalidRunsLedger(
      { ...ledger, entries: [{ ...base, attempt: 3 }] },
      study,
      matrix,
      runOrder,
      commissioning,
    ),
    /attempt must be 1 or 2/,
  );

  const pilot = commissioning.cells[0];
  const pilotBase = {
    ...base,
    phase: "commissioning",
    cellId: pilot.id,
    conditionId: pilot.conditionId,
    position: pilot.commissioningPosition,
  };
  const commissioningSummary = validateInvalidRunsLedger(
    { ...ledger, entries: [{ ...pilotBase, attempt: 1 }, { ...pilotBase, attempt: 2 }] },
    study,
    matrix,
    runOrder,
    commissioning,
  );
  assert.deepEqual(
    commissioningSummary.invalidExhaustedCommissioningCellIds,
    [pilot.id],
  );
  assert.throws(
    () => validateInvalidRunsLedger(
      { ...ledger, entries: [{ ...pilotBase, phase: "primary", attempt: 1 }] },
      study,
      matrix,
      runOrder,
      commissioning,
    ),
    /outside its declared phase/,
  );
  assert.throws(
    () => validateInvalidRunsLedger(
      { ...ledger, entries: [{ ...base, phase: "commissioning", attempt: 1 }] },
      study,
      matrix,
      runOrder,
      commissioning,
    ),
    /outside its declared phase/,
  );
});

test("attempt evidence destinations are phase- and attempt-scoped", () => {
  const primary = matrix.cells[0];
  const pilot = commissioning.cells[0];
  assert.equal(
    attemptEvidencePath("primary", primary.id, 1, matrix, commissioning),
    `captures/agent-debug-private/primary/${primary.id}/attempt-1`,
  );
  assert.equal(
    attemptEvidencePath("primary", primary.id, 2, matrix, commissioning),
    `captures/agent-debug-private/primary/${primary.id}/attempt-2`,
  );
  assert.equal(
    attemptEvidencePath("commissioning", pilot.id, 1, matrix, commissioning),
    `captures/agent-debug-private/commissioning/${pilot.id}/attempt-1`,
  );
  assert.throws(
    () => attemptEvidencePath("primary", pilot.id, 1, matrix, commissioning),
    /does not belong to primary/,
  );
});

test("normalization localizes wire-to-client and client-to-model separately", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "closureprobe-study-normalize-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const condition = findCondition("complete-zero", "dual");
  await callCondition(condition, directory);
  const transcriptName = readdirSync(directory).find((name) => name.endsWith(".ndjson"));
  assert.ok(transcriptName);

  const cell = matrix.cells.find(({ conditionId }) => conditionId === condition.conditionId);
  const payload = createStudyStimulus(condition, condition.arguments.request, condition.arguments.grounding);
  const modelLoss = structuredClone(payload);
  delete modelLoss.observation.coverage;
  const modelCriticalRepair = structuredClone(payload);
  delete modelCriticalRepair.observation.groundingBinding.algorithm;
  const sharedLoss = structuredClone(payload);
  delete sharedLoss.observation.continuation;
  const equivalent = structuredClone(payload);
  delete equivalent.observation.notes;
  const rebound = structuredClone(payload);
  rebound.request = { q: "different-request" };
  const guardClient = structuredClone(payload);
  guardClient.observation.coverage = "partial";
  const guardModel = structuredClone(guardClient);
  guardModel.observation.coverage = "unknown";
  const blockedClient = structuredClone(payload);
  blockedClient.observation.execution = "denied";
  const claims = {
    none: { study: study.studyId, claim: "none" },
    unknown: { study: study.studyId, claim: "unknown" },
  };
  function sealSyntheticAgentDebug(label, document, harnessOverrides = {}) {
    const sourceDirectory = resolve(
      directory,
      `${label}-agent-debug-source`,
    );
    const sealedDirectory = resolve(
      directory,
      `${label}-agent-debug-sealed`,
    );

    mkdirSync(sourceDirectory, { recursive: true });

    const systemPrompt = harnessOverrides.systemPrompt ??
      "Fixed neutral Copilot Agent harness envelope.";
    const model = harnessOverrides.model ?? study.design.harnessIsolation.model;
    const toolDefinitions = [{
      type: "function",
      name: study.design.harnessIsolation.modelFacingToolName,
      description: "Return controlled query evidence.",
      parameters: { type: "object" },
    }];
    writeFileSync(
      resolve(sourceDirectory, "system_prompt_0.json"),
      `${JSON.stringify({ content: systemPrompt })}\n`,
      "utf8",
    );
    writeFileSync(
      resolve(sourceDirectory, "tools_0.json"),
      `${JSON.stringify({ content: JSON.stringify(toolDefinitions) })}\n`,
      "utf8",
    );
    const request = {
      type: "llm_request",
      name: `chat:${model}`,
      attrs: {
        model,
        systemPromptFile: "system_prompt_0.json",
        toolsFile: "tools_0.json",
        userRequest: readFileSync(resolve(studyRoot, "prompts/01.txt"), "utf8"),
        inputMessages: JSON.stringify([
          { role: "system", content: systemPrompt },
          { role: "user", content: readFileSync(resolve(studyRoot, "prompts/01.txt"), "utf8") },
        ]),
      },
    };
    const records = [
      request,
      { type: "agent_response", name: "agent_response", document },
      {
        type: "tool_call",
        name: "closureprobe_probe",
        attrs: {
          args: JSON.stringify({ request: study.request, grounding: study.grounding }),
          result: "withheld synthetic controlled result",
        },
      },
      structuredClone(request),
      { type: "agent_response", name: "agent_response", document },
    ];

    writeFileSync(
      resolve(sourceDirectory, "main.jsonl"),
      `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
      "utf8",
    );

    const sealed = spawnSync(
      process.execPath,
      [
        resolve(studyRoot, "bin/seal-agent-debug.mjs"),
        "--session-dir",
        sourceDirectory,
        "--out-dir",
        sealedDirectory,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );

    assert.equal(sealed.status, 0, sealed.stderr);

    const receiptPath = resolve(
      sealedDirectory,
      "seal-receipt.json",
    );

    const verification =
      verifyAgentDebugSeal(receiptPath);

    const mainPath = resolve(
      sealedDirectory,
      verification.mainArtifact.sealedFile,
    );

    return {
      selectionEvidence: {
        agentDebugSealReceipt:
          `${label}-agent-debug-sealed/seal-receipt.json`,
        agentDebugSealReceiptSha256:
          verification.receiptSha256,
      },
      inspection: inspectAgentDebug(mainPath),
    };
  }

  const syntheticDocument = {
    exactClient: { structuredContent: payload },
    exactModel: { toolPayload: JSON.stringify(payload) },
    modelLoss: { toolPayload: JSON.stringify(modelLoss) },
    modelCriticalRepair: { toolPayload: JSON.stringify(modelCriticalRepair) },
    sharedLossClient: { structuredContent: sharedLoss },
    sharedLossModel: { toolPayload: JSON.stringify(sharedLoss) },
    equivalentModel: { toolPayload: JSON.stringify(equivalent) },
    reboundModel: { toolPayload: JSON.stringify(rebound) },
    guardClient: { structuredContent: guardClient },
    guardModel: { toolPayload: JSON.stringify(guardModel) },
    blockedClient: { structuredContent: blockedClient },
    proseModel: "The tool returned no matches, but the evidence guards are unavailable.",
    noneResponse: JSON.stringify(claims.none),
    unknownResponse: JSON.stringify(claims.unknown),
  };
  const syntheticAgentDebug = sealSyntheticAgentDebug("synthetic", syntheticDocument);

  const commissioningAudits = commissioning.cells.map((pilot) =>
    auditAgentDebugRequest(
      resolve(directory, "synthetic-agent-debug-sealed/seal-receipt.json"),
      { commissioningCellId: pilot.id },
    )
  );
  const harnessComparison = compareHarnessEnvelopes(commissioningAudits);
  const extractionPath = resolve(directory, "extraction-freeze.json");
  writeFileSync(extractionPath, `${JSON.stringify({
    studyId: study.studyId,
    status: "commissioned",
    selectionRuleFrozenBeforePrimary: true,
    harnessEnvelope: {
      arbitrarySystemInstructionsWhitelisted: false,
      automatedComparisonRequiredAcrossAllCommissioningPaths: true,
      automatedComparisonSha256: harnessComparison.comparisonSha256,
      frozenComparisonValues: harnessComparison.frozenComparisonValues,
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
  }, null, 2)}\n`, "utf8");

  const inspection = syntheticAgentDebug.inspection;
  assert.equal(
    JSON.stringify(inspection).includes("The tool returned no matches"),
    false,
  );

  function candidate(pointerPart, kind = "probe_payload", claim) {
    const selected = inspection.candidates.find((item) =>
      item.kind === kind && item.pointer.includes(`/${pointerPart}/`) &&
      (claim === undefined || item.claim === claim)
    );
    assert.ok(selected, `${pointerPart} candidate missing`);
    return kind === "probe_payload"
      ? { digest: selected.payloadDigest, pointer: selected.pointer, encoding: selected.encoding }
      : { digest: selected.claimDigest, pointer: selected.pointer, encoding: selected.encoding };
  }

  const exactClient = candidate("exactClient");
  const exactModel = candidate("exactModel");
  const noneClaim = candidate("noneResponse", "study_claim", "none");
  const unknownClaim = candidate("unknownResponse", "study_claim", "unknown");
  const proseModelCandidate = inspection.candidates.find((item) =>
    item.kind === "json_value" && item.pointer.endsWith("/proseModel")
  );
  assert.ok(proseModelCandidate);
  const proseModel = {
    digest: proseModelCandidate.valueDigest,
    pointer: proseModelCandidate.pointer,
    encoding: proseModelCandidate.encoding,
  };
  const baseSelection = {
    studyId: study.studyId,
    cellId: cell.id,
    specimenId: "synthetic-specimen",
    run: {
      orderPosition: cell.runOrderPosition,
      attempt: 1,
      startedAt: "2026-08-15T20:00:00.000Z",
      endedAt: "2026-08-15T20:00:10.000Z",
    },
    wireTranscript: transcriptName,
    ...syntheticAgentDebug.selectionEvidence,
    clientPayload: exactClient,
    modelPayload: exactModel,
    claim: noneClaim,
    observableBoundaries: ["mcp_wire", "client_tool_event", "model_visible_request", "final_response"],
    hiddenBoundaries: [],
    manualNormalization: ["Synthetic fixture labels establish boundary roles."],
  };

  function normalize(label, overrides) {
    const selectionPath = resolve(directory, `${label}-selection.json`);
    const resultPath = resolve(directory, `${label}-result.json`);
    writeFileSync(selectionPath, `${JSON.stringify({ ...baseSelection, ...overrides }, null, 2)}\n`, "utf8");
    const normalized = spawnSync(
      process.execPath,
      [
        resolve(studyRoot, "bin/normalize-run.mjs"),
        selectionPath,
        "--extraction", extractionPath,
        "--out", resultPath,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    assert.equal(normalized.status, 0, normalized.stderr);
    return JSON.parse(readFileSync(resultPath, "utf8"));
  }

  const exact = normalize("exact", {});
  assert.match(exact.sourceArtifacts.requestIsolationAuditSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    exact.sourceArtifacts.gateBHarnessEnvelopeComparisonSha256,
    harnessComparison.comparisonSha256,
  );

  const operatorOverrideFixture = sealSyntheticAgentDebug(
    "operator-audit-override",
    syntheticDocument,
    { model: "operator-claimed-passing-model" },
  );
  const operatorCandidate = (pointerPart, kind = "probe_payload", claim) => {
    const selected = operatorOverrideFixture.inspection.candidates.find((item) =>
      item.kind === kind && item.pointer.includes(`/${pointerPart}/`) &&
      (claim === undefined || item.claim === claim)
    );
    assert.ok(selected);
    return kind === "probe_payload"
      ? { digest: selected.payloadDigest, pointer: selected.pointer, encoding: selected.encoding }
      : { digest: selected.claimDigest, pointer: selected.pointer, encoding: selected.encoding };
  };
  const operatorSelectionPath = resolve(directory, "operator-audit-override-selection.json");
  writeFileSync(operatorSelectionPath, `${JSON.stringify({
    ...baseSelection,
    ...operatorOverrideFixture.selectionEvidence,
    clientPayload: operatorCandidate("exactClient"),
    modelPayload: operatorCandidate("exactModel"),
    claim: operatorCandidate("noneResponse", "study_claim", "none"),
    requestIsolationAudit: {
      format: "closureprobe-agent-debug-request-audit-v5",
      valid: true,
      note: "Untrusted operator-authored claim.",
    },
  }, null, 2)}\n`, "utf8");
  const operatorOverrideResult = spawnSync(
    process.execPath,
    [
      resolve(studyRoot, "bin/normalize-run.mjs"),
      operatorSelectionPath,
      "--extraction", extractionPath,
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.notEqual(operatorOverrideResult.status, 0);
  assert.match(
    operatorOverrideResult.stderr,
    /operator-claimed-passing-model != MAI-Code-1\.1-Flash/,
  );
  assert.equal(exact.endpoints.pClient, "P0_exact");
  assert.equal(exact.endpoints.pModel, "P0_exact");
  assert.equal(exact.endpoints.pCumulative, "P0_exact");
  assert.equal(exact.endpoints.claimLicense, "licensed");
  assert.equal(exact.endpoints.firstObservableNormativeChange, null);
  assert.equal(exact.endpoints.firstGuardSignalLossBoundary, null);
  assert.equal(exact.endpoints.firstUnsupportedStrengtheningBoundary, null);

  const modelOnlyLoss = normalize("model-loss", {
    modelPayload: candidate("modelLoss"),
    claim: unknownClaim,
  });
  assert.equal(modelOnlyLoss.endpoints.pClient, "P0_exact");
  assert.equal(modelOnlyLoss.endpoints.pModel, "P2_loss_or_change");
  assert.equal(modelOnlyLoss.endpoints.pCumulative, "P2_loss_or_change");
  assert.equal(modelOnlyLoss.endpoints.firstObservableNormativeChange, "client_to_model");
  assert.equal(modelOnlyLoss.endpoints.firstGuardSignalLossBoundary, null);

  const failClosedRepair = normalize("fail-closed-repair", {
    modelPayload: candidate("modelCriticalRepair"),
    claim: noneClaim,
  });
  assert.equal(failClosedRepair.endpoints.pModel, "P2_loss_or_change");
  assert.equal(failClosedRepair.endpoints.claimLicense, "not_licensed");
  assert.equal(
    failClosedRepair.endpoints.claimLicenseBasis,
    "license_critical_visibility_loss",
  );
  assert.equal(failClosedRepair.endpoints.licenseCriticalNormalizationOccurred, true);
  assert.deepEqual(
    failClosedRepair.endpoints.licenseCriticalNormalizationPaths,
    ["groundingBinding.algorithm"],
  );
  assert.equal(failClosedRepair.endpoints.licenseCriticalVisibilityLossOccurred, true);
  assert.deepEqual(
    failClosedRepair.endpoints.licenseCriticalVisibilityLossPaths,
    ["observation.groundingBinding.algorithm"],
  );
  assert.deepEqual(
    failClosedRepair.normalizationRepairs.modelVisibleRequest,
    [{
      path: "groundingBinding.algorithm",
      issue: "missing",
      normalization: "closureprobe-grounding-v1",
    }],
  );

  const shared = normalize("shared-loss", {
    clientPayload: candidate("sharedLossClient"),
    modelPayload: candidate("sharedLossModel"),
    claim: unknownClaim,
  });
  assert.equal(shared.endpoints.pClient, "P2_loss_or_change");
  assert.equal(shared.endpoints.pModel, "P0_exact");
  assert.equal(shared.endpoints.pCumulative, "P2_loss_or_change");
  assert.equal(shared.endpoints.firstObservableNormativeChange, "wire_to_client");

  const nonNormative = normalize("equivalent", {
    modelPayload: candidate("equivalentModel"),
    claim: unknownClaim,
  });
  assert.equal(nonNormative.endpoints.pModel, "P1_normatively_equivalent");

  const reboundResult = normalize("rebound", {
    modelPayload: candidate("reboundModel"),
    claim: noneClaim,
  });
  assert.equal(reboundResult.endpoints.pModel, "P2_loss_or_change");
  assert.ok(reboundResult.endpoints.payloadDeltas.clientToModel.some(({ path }) => path === "request"));
  assert.equal(reboundResult.endpoints.claimLicense, "not_licensed");
  assert.equal(reboundResult.endpoints.claimLicenseBasis, "license_critical_visibility_loss");
  assert.deepEqual(reboundResult.endpoints.licenseCriticalVisibilityLossPaths, ["request"]);

  const observableProseLoss = normalize("observable-prose-loss", {
    modelPayload: proseModel,
    claim: unknownClaim,
  });
  assert.equal(observableProseLoss.endpoints.pModel, "P2_loss_or_change");
  assert.equal(observableProseLoss.endpoints.pCumulative, "P2_loss_or_change");
  assert.equal(observableProseLoss.endpoints.firstObservableNormativeChange, "client_to_model");
  assert.equal(observableProseLoss.selection.modelPayload.location.candidateKind, "json_value");

  const guardLoss = normalize("guard-loss", {
    clientPayload: candidate("guardClient"),
    modelPayload: candidate("guardModel"),
    claim: unknownClaim,
  });
  assert.equal(
    guardLoss.endpoints.firstGuardSignalLossBoundary,
    "client-tool-event->model-visible-request",
  );
  assert.equal(guardLoss.endpoints.firstUnsupportedStrengtheningBoundary, null);

  const unsupportedStrengthening = normalize("unsupported-strengthening", {
    clientPayload: candidate("blockedClient"),
    modelPayload: exactModel,
    claim: noneClaim,
  });
  assert.equal(
    unsupportedStrengthening.endpoints.firstUnsupportedStrengtheningBoundary,
    "client-tool-event->model-visible-request",
  );

  const hiddenClient = normalize("hidden-client", {
    clientPayload: { unobservable: true, reason: "Synthetic client event withheld." },
    modelPayload: exactModel,
    claim: noneClaim,
    observableBoundaries: ["mcp_wire", "model_visible_request", "final_response"],
    hiddenBoundaries: ["client_tool_event"],
  });
  assert.equal(hiddenClient.endpoints.pClient, "P3_unobservable");
  assert.equal(hiddenClient.endpoints.pModel, "P3_unobservable");
  assert.equal(hiddenClient.endpoints.pCumulative, "P0_exact");
  assert.equal(hiddenClient.endpoints.claimLicense, "licensed");
  assert.equal(hiddenClient.endpoints.firstObservableNormativeChange, null);
  assert.equal(
    hiddenClient.endpoints.localizationStatus,
    "blocked_by_unobservable_client_boundary",
  );
  assert.equal(hiddenClient.endpoints.firstGuardSignalLossBoundary, null);
  assert.equal(hiddenClient.endpoints.firstUnsupportedStrengtheningBoundary, null);
  assert.equal(hiddenClient.endpoints.representationDeltas.wireToClient, null);
  assert.equal(hiddenClient.endpoints.representationDeltas.clientToModel, null);
  assert.deepEqual(hiddenClient.endpoints.representationDeltas.wireToModel, []);
  assert.equal(
    hiddenClient.normalizedTrace.stages.some(({ stageId }) => stageId === "client-tool-event"),
    false,
  );

  for (const [label, finalResponse] of [
    ["prose", "I cannot provide the required JSON."],
    ["model-error", JSON.stringify({ study: study.studyId, claim: "error" })],
    ["model-some", JSON.stringify({ study: study.studyId, claim: "some" })],
    ["extra-text", `${JSON.stringify(claims.none)}\nThanks.`],
    [
      "fenced",
      `Sure!\n\n\`\`\`json\n${JSON.stringify(claims.none)}\n\`\`\``,
    ],
  ]) {
    const invalidAgentDebug =
      sealSyntheticAgentDebug(
        `synthetic-invalid-${label}`,
{
      exactClient: { structuredContent: payload },
      exactModel: { toolPayload: JSON.stringify(payload) },
      finalResponse,
    }
      );

    const invalidInspection =
      invalidAgentDebug.inspection;
    assert.equal(
      invalidInspection.candidates.some(({ kind }) => kind === "study_claim"),
      false,
      `${label} must not produce a scorable claim`,
    );
    const invalidCandidate = (pointerPart) => {
      const selected = invalidInspection.candidates.find((item) =>
        item.kind === "probe_payload" && item.pointer.includes(`/${pointerPart}/`)
      );
      assert.ok(selected);
      return {
        digest: selected.payloadDigest,
        pointer: selected.pointer,
        encoding: selected.encoding,
      };
    };
    const invalidResponse = normalize(`invalid-response-${label}`, {
      ...invalidAgentDebug.selectionEvidence,
      clientPayload: invalidCandidate("exactClient"),
      modelPayload: invalidCandidate("exactModel"),
      claim: {
        invalidResponse: true,
        reason: "No exact binary two-key study claim was present in the selected final response.",
      },
    });
    assert.equal(invalidResponse.endpoints.explicitClaim, "response_error");
    assert.equal(invalidResponse.endpoints.claimLicense, "not_evaluable");
    assert.equal(invalidResponse.endpoints.claimLicenseBasis, "response_error");
    assert.equal(invalidResponse.selection.claim.location, null);
  }

  const unobservable = normalize("unobservable", {
    modelPayload: { unobservable: true, reason: "Synthetic model request withheld." },
    claim: unknownClaim,
    observableBoundaries: ["mcp_wire", "client_tool_event", "final_response"],
    hiddenBoundaries: ["model_visible_request"],
  });
  assert.equal(unobservable.endpoints.pModel, "P3_unobservable");
  assert.equal(unobservable.endpoints.pCumulative, "P3_unobservable");
  assert.equal(unobservable.endpoints.claimLicense, "not_applicable");
  assert.equal(unobservable.endpoints.representationDeltas.wireToModel, null);
  assert.equal(
    unobservable.normalizedTrace.stages.some(({ stageId }) => stageId === "model-visible-request"),
    false,
  );
});
