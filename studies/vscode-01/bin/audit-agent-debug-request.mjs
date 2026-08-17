#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { canonicalizeJson } from "../../../dist/src/index.js";
import { readAgentDebugRecords } from "./resolve-agent-debug-sidecars.mjs";
import { verifyAgentDebugSeal } from "./verify-agent-debug-seal.mjs";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const study = JSON.parse(readFileSync(resolve(studyRoot, "study.json"), "utf8"));
const conditions = JSON.parse(readFileSync(resolve(studyRoot, "conditions.json"), "utf8"));
const commissioning = JSON.parse(
  readFileSync(resolve(studyRoot, "commissioning.json"), "utf8"),
);
const frozenPrompt = readFileSync(resolve(studyRoot, "prompts/01.txt"), "utf8");

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digestText(text) {
  return digestBytes(Buffer.from(text, "utf8"));
}

function requireObject(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
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

function readSealedSidecar(receiptPath, verification, role, sourceFile) {
  const expectedRole = `request-sidecar:${role}:${sourceFile}`;
  const artifact = verification.artifacts.find((candidate) => candidate.role === expectedRole);
  if (artifact === undefined) {
    throw new Error(`Receipt does not bind required ${role} sidecar ${sourceFile}`);
  }
  const path = resolve(dirname(receiptPath), artifact.sealedFile);
  return {
    artifact,
    bytes: readFileSync(path),
  };
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function systemPromptContent(bytes, label) {
  const document = requireObject(parseJson(bytes, label), label);
  return requireString(document.content, `${label}.content`);
}

function toolDefinitions(bytes, label) {
  const document = parseJson(bytes, label);
  let definitions = document;
  if (document !== null && typeof document === "object" && !Array.isArray(document)) {
    if (typeof document.content === "string") {
      try {
        definitions = JSON.parse(document.content);
      } catch {
        throw new Error(`${label}.content is not valid JSON`);
      }
    } else if (Array.isArray(document.tools)) {
      definitions = document.tools;
    }
  }
  if (!Array.isArray(definitions)) {
    throw new Error(`${label} does not contain a tool-definition array`);
  }
  return definitions.map((definition, index) =>
    requireObject(definition, `${label} tool ${index + 1}`)
  );
}

function jsonShape(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.map(jsonShape);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, jsonShape(value[key])]),
    );
  }
  return typeof value;
}

function parsedInputMessages(value, lineNumber) {
  const text = requireString(value, `llm_request line ${lineNumber} attrs.inputMessages`);
  try {
    return { text, value: JSON.parse(text) };
  } catch {
    throw new Error(`llm_request line ${lineNumber} attrs.inputMessages is not valid JSON`);
  }
}

function requestReferences(record, lineNumber) {
  const attrs = requireObject(record.attrs, `llm_request line ${lineNumber}.attrs`);
  return {
    attrs,
    systemPromptFile: requireString(
      attrs.systemPromptFile,
      `llm_request line ${lineNumber} attrs.systemPromptFile`,
    ),
    toolsFile: requireString(
      attrs.toolsFile,
      `llm_request line ${lineNumber} attrs.toolsFile`,
    ),
  };
}

function forbiddenCategories(text) {
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tokenCount = (labels) => labels.reduce((total, label) => {
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9_-])${escape(label)}([^A-Za-z0-9_-]|$)`,
      "g",
    );
    return total + [...text.matchAll(pattern)].length;
  }, 0);
  const groups = [
    ["semantic_scenario_label", tokenCount(study.design.scenarios)],
    ["carrier_label", tokenCount(study.design.carriers)],
    [
      "opaque_condition_id",
      tokenCount(conditions.conditions.map(({ conditionId }) => conditionId)),
    ],
    [
      "oracle_assessment",
      [...text.matchAll(/negativeLicense|["']assessment["']\s*:/g)].length,
    ],
  ];
  return groups.flatMap(([code, count]) => {
    return count === 0 ? [] : [{ code, count }];
  });
}

export function auditAgentDebugRequest(receiptPath, options = {}) {
  const absoluteReceipt = resolve(receiptPath);
  const verification = verifyAgentDebugSeal(absoluteReceipt);
  if (verification.format !== "closureprobe-agent-debug-seal-verification-v2") {
    throw new Error("Version 5 request audit requires a v2 seal receipt");
  }

  let commissioningCell = null;
  if (options.commissioningCellId !== undefined) {
    commissioningCell = commissioning.cells.find(
      ({ id }) => id === options.commissioningCellId,
    );
    if (commissioningCell === undefined) {
      throw new Error("--commissioning-cell is not a frozen commissioning cell");
    }
  }

  const mainPath = resolve(dirname(absoluteReceipt), verification.mainArtifact.sealedFile);
  const records = readAgentDebugRecords(mainPath);
  const requests = records.filter(({ record }) => record?.type === "llm_request");
  const toolCalls = records.filter(({ record }) => record?.type === "tool_call");
  const agentResponses = records.filter(({ record }) => record?.type === "agent_response");
  const subagents = records.filter(({ record }) =>
    record?.type === "subagent" ||
    record?.name === "child_session_ref" &&
      /(?:runSubagent|searchSubagent)-/.test(record?.attrs?.file ?? "")
  );

  if (requests.length !== 2) {
    throw new Error(`Expected exactly two main model requests, observed ${requests.length}`);
  }
  if (toolCalls.length !== 1) {
    throw new Error(`Expected exactly one main tool call, observed ${toolCalls.length}`);
  }
  if (agentResponses.length !== 2) {
    throw new Error(`Expected exactly two main agent responses, observed ${agentResponses.length}`);
  }
  if (subagents.length !== 0) {
    throw new Error("Subagent activity is not permitted");
  }

  const isolation = study.design.harnessIsolation;
  const acceptedToolCallNames = new Set([
    "closureprobe_probe",
    isolation.modelFacingToolName,
  ]);
  if (!acceptedToolCallNames.has(toolCalls[0].record.name)) {
    throw new Error(`Unexpected main tool call: ${toolCalls[0].record.name}`);
  }
  let toolArguments;
  try {
    toolArguments = JSON.parse(toolCalls[0].record.attrs?.args);
  } catch {
    throw new Error("The main tool call does not expose valid JSON arguments");
  }
  const expectedArguments = { request: study.request, grounding: study.grounding };
  if (canonicalizeJson(toolArguments) !== canonicalizeJson(expectedArguments)) {
    throw new Error("The main tool call arguments differ from the frozen request");
  }

  const requestEvidence = [];
  const toolSidecars = new Map();
  const promptSidecars = new Map();
  for (const { lineNumber, record } of requests) {
    const { attrs, systemPromptFile, toolsFile } = requestReferences(record, lineNumber);
    if (attrs.model !== isolation.model) {
      throw new Error(
        `llm_request line ${lineNumber} model ${attrs.model} != ${isolation.model}`,
      );
    }
    const systemSidecar = readSealedSidecar(
      absoluteReceipt,
      verification,
      "system-prompt",
      systemPromptFile,
    );
    const toolsSidecar = readSealedSidecar(
      absoluteReceipt,
      verification,
      "tool-definitions",
      toolsFile,
    );
    const promptContent = systemPromptContent(systemSidecar.bytes, systemPromptFile);
    const definitions = toolDefinitions(toolsSidecar.bytes, toolsFile);
    const names = definitions.map(({ name }, index) =>
      requireString(name, `${toolsFile} tool ${index + 1}.name`)
    );
    if (
      definitions.length !== 1 ||
      names[0] !== isolation.modelFacingToolName
    ) {
      throw new Error(
        `${toolsFile} must expose only ${isolation.modelFacingToolName}`,
      );
    }
    const inputMessages = parsedInputMessages(attrs.inputMessages, lineNumber);
    requestEvidence.push({
      lineNumber,
      model: attrs.model,
      systemPromptFile,
      toolsFile,
      systemPromptContentSha256: digestText(promptContent),
      inputMessagesSha256: digestText(inputMessages.text),
      inputMessagesStructureSha256: digestText(
        canonicalizeJson(jsonShape(inputMessages.value)),
      ),
      userRequestSha256: digestText(
        requireString(attrs.userRequest, `llm_request line ${lineNumber} attrs.userRequest`),
      ),
    });
    promptSidecars.set(systemPromptFile, {
      sourceFile: systemPromptFile,
      sha256: systemSidecar.artifact.sha256,
      contentSha256: digestText(promptContent),
      content: promptContent,
    });
    toolSidecars.set(toolsFile, {
      sourceFile: toolsFile,
      sha256: toolsSidecar.artifact.sha256,
      toolCount: definitions.length,
      toolNames: names,
      toolNamesSha256: digestText(canonicalizeJson(names)),
      content: toolsSidecar.bytes.toString("utf8"),
    });
  }

  if (requestEvidence[0].userRequestSha256 !== digestText(frozenPrompt)) {
    throw new Error("The first model request userRequest differs from the frozen prompt bytes");
  }
  if (new Set(requestEvidence.map(({ userRequestSha256 }) => userRequestSha256)).size !== 1) {
    throw new Error("The frozen userRequest changed between model requests");
  }
  if (
    new Set(requestEvidence.map(({ systemPromptContentSha256 }) =>
      systemPromptContentSha256
    )).size !== 1
  ) {
    throw new Error("The referenced system prompt changed between model requests");
  }

  const contaminationText = [
    ...requests.flatMap(({ record }) => [
      record.attrs.userRequest,
      record.attrs.inputMessages,
    ]),
    ...[...promptSidecars.values()].map(({ content }) => content),
    ...[...toolSidecars.values()].map(({ content }) => content),
  ].join("\n");
  const prohibitedContent = forbiddenCategories(contaminationText);
  if (prohibitedContent.length > 0) {
    throw new Error(
      `Selected request evidence contains prohibited categories: ${prohibitedContent.map(({ code }) => code).join(", ")}`,
    );
  }

  return {
    format: "closureprobe-agent-debug-request-audit-v5",
    studyId: study.studyId,
    ...(commissioningCell === null ? {} : {
      phase: "commissioning",
      cellId: commissioningCell.id,
      carrier: commissioningCell.carrier,
    }),
    valid: true,
    sealReceiptSha256: verification.receiptSha256,
    model: isolation.model,
    modelRequestCount: requests.length,
    agentResponseCount: agentResponses.length,
    toolCallCount: toolCalls.length,
    subagentCount: subagents.length,
    toolCallName: toolCalls[0].record.name,
    firstRequest: requestEvidence[0],
    requests: requestEvidence,
    systemPromptSidecars: [...promptSidecars.values()].map(({ content: _content, ...item }) => item),
    toolDefinitionSidecars: [...toolSidecars.values()].map(({ content: _content, ...item }) => item),
    prohibitedContentCategories: prohibitedContent,
    harnessEnvelopeRule: {
      exactAcrossCommissioning: [
        "model",
        "firstRequest.systemPromptContentSha256",
        "firstRequest.inputMessagesSha256",
        "firstRequest.inputMessagesStructureSha256",
        "firstRequest.userRequestSha256",
        "toolDefinitionSidecars[].toolNamesSha256",
      ],
      arbitrarySystemInstructionsWhitelisted: false,
      manualContentReviewStillRequired: true,
    },
  };
}

const invokedPath = process.argv[1] === undefined
  ? undefined
  : pathToFileURL(resolve(process.argv[1])).href;

if (invokedPath === import.meta.url) {
  const receiptPath = process.argv[2];
  if (receiptPath === undefined) {
    process.stderr.write(
      "Usage: audit-agent-debug-request.mjs SEAL_RECEIPT_JSON [--commissioning-cell ID] [--out FILE]\n",
    );
    process.exit(64);
  }
  try {
    const cellIndex = process.argv.indexOf("--commissioning-cell");
    const result = auditAgentDebugRequest(receiptPath, {
      commissioningCellId: cellIndex === -1 ? undefined : process.argv[cellIndex + 1],
    });
    const content = `${JSON.stringify(result, null, 2)}\n`;
    const outIndex = process.argv.indexOf("--out");
    if (outIndex === -1) {
      process.stdout.write(content);
    } else {
      const out = process.argv[outIndex + 1];
      if (out === undefined) throw new Error("Missing value after --out");
      writeFileSync(resolve(out), content, "utf8");
      process.stdout.write(`Agent Debug request isolation verified -> ${out}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
