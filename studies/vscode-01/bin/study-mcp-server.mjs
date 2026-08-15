#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { canonicalizeJson } from "../../../dist/src/canonical.js";
import { TOOL_VERSION } from "../../../dist/src/corpus.js";
import { createStudyStimulus } from "./study-stimulus.mjs";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const study = JSON.parse(readFileSync(resolve(studyRoot, "study.json"), "utf8"));
const conditions = JSON.parse(readFileSync(resolve(studyRoot, "conditions.json"), "utf8"));
const conditionIndex = process.argv.indexOf("--condition");
const conditionEnvironmentIndex = process.argv.indexOf("--condition-env");
const conditionEnvironmentName = conditionEnvironmentIndex === -1
  ? undefined
  : process.argv[conditionEnvironmentIndex + 1];
const conditionId = conditionIndex === -1
  ? conditionEnvironmentName === undefined
    ? undefined
    : process.env[conditionEnvironmentName]
  : process.argv[conditionIndex + 1];
const condition = conditions.conditions.find((candidate) => candidate.conditionId === conditionId);
if (condition === undefined) {
  process.stderr.write(
    "Usage: study-mcp-server.mjs (--condition OPAQUE_ID | --condition-env ENV_NAME)\n",
  );
  process.exit(64);
}

const studyInputSchema = fromJsonSchema({
  type: "object",
  additionalProperties: false,
  required: ["request", "grounding"],
  properties: {
    request: { const: study.request },
    grounding: { const: study.grounding },
  },
});

const outputSchema = fromJsonSchema({
  type: "object",
  additionalProperties: false,
  required: ["format", "request", "grounding", "observation"],
  properties: {
    format: { type: "string", enum: ["closureprobe-evidence-status-v1"] },
    request: true,
    grounding: { type: "object" },
    observation: { type: "object" },
  },
});

const server = new McpServer(
  { name: "closureprobe-study", version: TOOL_VERSION },
  { capabilities: { tools: {} } },
);

server.registerTool(
  "closureprobe_probe",
  {
    title: "Return controlled query evidence",
    description:
      "Returns one controlled query result with machine-readable evidence-status fields. Judge only the returned result.",
    inputSchema: studyInputSchema,
    ...(condition.carrier === "text-only" ? {} : { outputSchema }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  },
  async ({ request, grounding }) => {
    if (
      canonicalizeJson(request) !== canonicalizeJson(study.request) ||
      canonicalizeJson(grounding) !== canonicalizeJson(study.grounding)
    ) {
      throw new Error("Study arguments differ from the frozen neutral request");
    }
    const stimulus = createStudyStimulus(condition, request, grounding);
    const text = JSON.stringify(stimulus);
    return {
      content: condition.carrier === "structured-only" ? [] : [{ type: "text", text }],
      ...(condition.carrier === "text-only" ? {} : { structuredContent: stimulus }),
    };
  },
);

await serveStdio(() => server, {
  onerror(error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
  },
});
