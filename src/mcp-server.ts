#!/usr/bin/env node

import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { assessClosure } from "./oracle.js";
import { createProbePayload, type ProbeCarrier, type ProbeScenario } from "./probe.js";
import { TOOL_VERSION } from "./corpus.js";
import type { ClosureAssessment, ClosureObservation, JsonValue } from "./types.js";

interface ProbeInput {
  scenario: ProbeScenario;
  carrier: ProbeCarrier;
  request: JsonValue;
}

interface ProbeOutput {
  scenario: ProbeScenario;
  request: JsonValue;
  observation: ClosureObservation;
  assessment: ClosureAssessment;
}

const inputSchema = fromJsonSchema<ProbeInput>({
  type: "object",
  additionalProperties: false,
  required: ["scenario", "carrier", "request"],
  properties: {
    scenario: {
      type: "string",
      enum: [
        "complete-zero",
        "partial-zero",
        "continued-zero",
        "denied-zero",
        "failed-zero",
        "scope-mismatch-zero",
      ],
    },
    carrier: { type: "string", enum: ["dual", "structured-only", "text-only"] },
    request: true,
  },
});

const outputSchema = fromJsonSchema<ProbeOutput>({
  type: "object",
  additionalProperties: false,
  required: ["scenario", "request", "observation", "assessment"],
  properties: {
    scenario: { type: "string" },
    request: true,
    observation: { type: "object" },
    assessment: { type: "object" },
  },
});

function buildServer(): McpServer {
  const server = new McpServer(
    { name: "closureprobe", version: TOOL_VERSION },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "closureprobe_probe",
    {
      title: "Emit a controlled closure result",
      description:
        "Returns a deterministic empty-result fixture whose closure guards vary by scenario and carrier.",
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ scenario, carrier, request }) => {
      const payload = createProbePayload(scenario, request);
      const structuredContent = {
        ...payload,
        assessment: assessClosure(payload.observation),
      };
      const text = JSON.stringify(structuredContent);
      return {
        content: carrier === "structured-only" ? [] : [{ type: "text" as const, text }],
        ...(carrier === "text-only" ? {} : { structuredContent }),
      };
    },
  );

  return server;
}

await serveStdio(buildServer);
