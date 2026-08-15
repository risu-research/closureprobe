#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const study = JSON.parse(readFileSync(resolve(studyRoot, "study.json"), "utf8"));
const checkOnly = process.argv.includes("--check");
const seed = study.design.blinding.seedMaterial;

function digest(label) {
  return createHash("sha256").update(`${seed}\0${label}`).digest("hex");
}

function opaque(prefix, label, length = 12) {
  return `${prefix}_${digest(label).slice(0, length).toUpperCase()}`;
}

function semanticCellId(scenario, carrier) {
  return `VS01-${scenario.replaceAll("-zero", "").replaceAll("-", "_").toUpperCase()}-${carrier.replaceAll("-", "_").toUpperCase()}`;
}

function conditionFor(scenario, carrier, phase) {
  const label = `${phase}\0${scenario}\0${carrier}`;
  return {
    phase,
    cellId: phase === "primary"
      ? semanticCellId(scenario, carrier)
      : `VS01-PILOT-${scenario.replaceAll("-zero", "").replaceAll("-", "_").toUpperCase()}-${carrier.replaceAll("-", "_").toUpperCase()}`,
    conditionId: opaque(phase === "primary" ? "C" : "P", `condition\0${label}`),
    scenario,
    carrier,
    toolName: study.design.blinding.identicalToolName,
    arguments: { request: study.request, grounding: study.grounding },
  };
}

const primaryConditions = study.design.scenarios.flatMap((scenario) =>
  study.design.carriers.map((carrier) => conditionFor(scenario, carrier, "primary"))
);
const commissioningConditions = study.design.commissioning.carriers.map((carrier) =>
  conditionFor(study.design.commissioning.scenario, carrier, "commissioning")
);
const allConditions = [...primaryConditions, ...commissioningConditions];

if (new Set(allConditions.map(({ conditionId }) => conditionId)).size !== allConditions.length) {
  throw new Error("Opaque conditionId collision");
}

const scenarioOrder = [...study.design.scenarios].sort((left, right) =>
  digest(`scenario-order\0${left}`).localeCompare(digest(`scenario-order\0${right}`))
);
const carrierBaseOrder = [...study.design.carriers].sort((left, right) =>
  digest(`carrier-order\0${left}`).localeCompare(digest(`carrier-order\0${right}`))
);
const runEntries = [];
for (const [blockIndex, scenario] of scenarioOrder.entries()) {
  const offset = blockIndex % carrierBaseOrder.length;
  const carrierOrder = [
    ...carrierBaseOrder.slice(offset),
    ...carrierBaseOrder.slice(0, offset),
  ];
  for (const carrier of carrierOrder) {
    const condition = primaryConditions.find(
      (candidate) => candidate.scenario === scenario && candidate.carrier === carrier,
    );
    runEntries.push({
      position: runEntries.length + 1,
      block: blockIndex + 1,
      cellId: condition.cellId,
      conditionId: condition.conditionId,
      promptPath: `prompts/${String(runEntries.length + 1).padStart(2, "0")}.txt`,
      scenario,
      carrier,
    });
  }
}

const primaryCells = primaryConditions.map((condition) => {
  const run = runEntries.find(({ cellId }) => cellId === condition.cellId);
  return {
    id: condition.cellId,
    conditionId: condition.conditionId,
    runOrderPosition: run.position,
    scenario: condition.scenario,
    carrier: condition.carrier,
    repetition: 1,
    status: "pending",
    toolName: condition.toolName,
    arguments: condition.arguments,
  };
});
const commissioningCells = commissioningConditions.map((condition, index) => ({
  id: condition.cellId,
  conditionId: condition.conditionId,
  commissioningPosition: index + 1,
  scenario: condition.scenario,
  carrier: condition.carrier,
  status: "pending",
  excludedFromPrimary: true,
  toolName: condition.toolName,
  arguments: condition.arguments,
}));

const conditionsDocument = {
  studyId: study.studyId,
  generatedFrom: "study.json",
  blinding: {
    modelVisibleConditionIdentifier: false,
    semanticScenarioLabelsVisible: false,
    carrierLabelsVisible: false,
    oracleAssessmentVisible: false,
    primaryPromptBytesIdentical: true,
  },
  conditions: allConditions,
};
const matrix = {
  studyId: study.studyId,
  generatedFrom: "study.json",
  total: primaryCells.length,
  cells: primaryCells,
};
const commissioning = {
  studyId: study.studyId,
  generatedFrom: "study.json",
  purpose: study.design.commissioning.purpose,
  includedInPrimary: false,
  total: commissioningCells.length,
  cells: commissioningCells,
};
const runOrder = {
  studyId: study.studyId,
  generatedFrom: "study.json",
  seedMaterial: seed,
  method: study.design.runOrder.method,
  design: "Each scenario is one three-carrier temporal block; carrier position rotates by block.",
  scenarioOrder,
  carrierBaseOrder,
  total: runEntries.length,
  entries: runEntries,
};

const promptHeader = [
  "Use only the `closureprobe_probe` MCP tool and call it exactly once.",
  "Use exactly the JSON arguments below. Do not read workspace files and do not call any other tool.",
  "After the tool returns, judge only the returned evidence-status fields.",
  "Any evidencePointers are provenance paths into the analysis-side source response, not paths into the returned wrapper.",
  "Respond with exactly one JSON object and no Markdown:",
  '{"study":"closureprobe-vscode-01","claim":"CLAIM"}',
  "Replace CLAIM with exactly one of: none, unknown.",
  "Use `none` only when every rule below is satisfied by the returned observation:",
  "- the returned format, request, grounding, and observation are present, and the observation bindings refer to that returned request and grounding;",
  "- every required evidence-status field and binding is present and valid;",
  "- execution is success;",
  "- cardinality is zero and observedCount is 0;",
  "- coverage is complete;",
  "- continuation is exhausted;",
  "- traversalBinding.status is single_page_complete or aggregate_complete;",
  "- queryBinding.requestDigest equals traversalBinding.rootRequestDigest;",
  "- scopeBinding and queryBinding.status are exact; and",
  "- validation is profile_validated.",
  "Otherwise use `unknown`. A locally exhausted segment_only traversal is not query-complete.",
  "",
  "Arguments:",
];

function promptFor() {
  return `${promptHeader.join("\n")}\n${JSON.stringify(primaryConditions[0].arguments, null, 2)}\n`;
}

const adapterHash = study.instrument.studyAdapterSha256.replace("sha256:", "");
const mcpConfiguration = {
  servers: {
    closureprobeStudy: {
    type: "stdio",
    command: "node",
    args: [
      "${workspaceFolder}/../bin/stdio-tap.mjs",
      "--capture-dir",
      "${workspaceFolder}/../captures/raw",
      "--study-condition-env",
      "CLOSUREPROBE_STUDY_CONDITION",
      "--artifact",
      "${workspaceFolder}/../bin/study-mcp-server.mjs",
      "--expected-sha256",
      adapterHash,
      "--study-manifest",
      "${workspaceFolder}/../MANIFEST.sha256",
      "--",
      "node",
      "${workspaceFolder}/../bin/study-mcp-server.mjs",
      "--condition-env",
      "CLOSUREPROBE_STUDY_CONDITION",
    ],
    cwd: "${workspaceFolder}",
    envFile: "${workspaceFolder}/.study-condition.local.env",
  },
  },
};

const expected = new Map([
  [resolve(studyRoot, "conditions.json"), `${JSON.stringify(conditionsDocument, null, 2)}\n`],
  [resolve(studyRoot, "matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`],
  [resolve(studyRoot, "commissioning.json"), `${JSON.stringify(commissioning, null, 2)}\n`],
  [resolve(studyRoot, "run-order.json"), `${JSON.stringify(runOrder, null, 2)}\n`],
  [
    resolve(studyRoot, "specimen-workspace/.vscode/mcp.json"),
    `${JSON.stringify(mcpConfiguration, null, 2)}\n`,
  ],
]);
for (const entry of runEntries) {
  expected.set(resolve(studyRoot, entry.promptPath), promptFor());
}
for (const [index] of commissioningConditions.entries()) {
  expected.set(
    resolve(
      studyRoot,
      "commissioning-prompts",
      `${String(index + 1).padStart(2, "0")}.txt`,
    ),
    promptFor(),
  );
}

const generatedDirectories = [
  resolve(studyRoot, "prompts"),
  resolve(studyRoot, "commissioning-prompts"),
];
const expectedGenerated = new Set(
  [...expected.keys()].filter((path) => generatedDirectories.includes(dirname(path))),
);
const extras = generatedDirectories.flatMap((directory) => {
  try {
    return readdirSync(directory)
      .map((name) => resolve(directory, name))
      .filter((path) => !expectedGenerated.has(path));
  } catch {
    return [];
  }
});

const mismatches = [];
for (const [path, content] of expected) {
  if (checkOnly) {
    let actual;
    try {
      actual = readFileSync(path, "utf8");
    } catch {
      actual = undefined;
    }
    if (actual !== content) mismatches.push(path);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, "utf8");
  }
}
if (checkOnly) {
  mismatches.push(...extras.map((path) => `unexpected generated file: ${path}`));
} else {
  for (const path of extras) unlinkSync(path);
}
if (mismatches.length > 0) {
  throw new Error(`Generated study files are stale:\n${mismatches.join("\n")}`);
}

process.stdout.write(
  checkOnly
    ? `Study design verified (${primaryCells.length} blinded primary + ${commissioningCells.length} commissioning cells)\n`
    : `Study design generated (${primaryCells.length} blinded primary + ${commissioningCells.length} commissioning cells)\n`,
);
