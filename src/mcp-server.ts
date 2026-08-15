#!/usr/bin/env node

import { McpServer, fromJsonSchema } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { assessClosure } from "./oracle.js";
import { createProbePayload, type ProbeCarrier, type ProbeScenario } from "./probe.js";
import { TOOL_VERSION } from "./corpus.js";
import type { ClosureAssessment, ClosureObservation, JsonValue, SourceGrounding } from "./types.js";

interface ProbeInput {
  scenario: ProbeScenario;
  carrier: ProbeCarrier;
  request: JsonValue;
  grounding: SourceGrounding;
}

interface ProbeOutput {
  scenario: ProbeScenario;
  request: JsonValue;
  grounding: SourceGrounding;
  observation: ClosureObservation;
  assessment: ClosureAssessment;
}

const inputSchema = fromJsonSchema<ProbeInput>({
  type: "object",
  additionalProperties: false,
  required: ["scenario", "carrier", "request", "grounding"],
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
        "segment-zero",
      ],
    },
    carrier: { type: "string", enum: ["dual", "structured-only", "text-only"] },
    request: true,
    grounding: {
      type: "object",
      additionalProperties: false,
      required: ["sourceContext", "propositionScope"],
      properties: {
        sourceContext: {
          type: "object",
          additionalProperties: false,
          required: ["producer", "instance", "authority"],
          properties: {
            producer: { type: "string", minLength: 1 },
            instance: { type: "object", minProperties: 1 },
            authority: { type: "object", minProperties: 1 },
          },
        },
        propositionScope: { type: "object", minProperties: 1 },
      },
    },
  },
});

const outputSchema = fromJsonSchema<ProbeOutput>({
  type: "object",
  additionalProperties: false,
  required: ["scenario", "request", "grounding", "observation", "assessment"],
  properties: {
    scenario: { type: "string" },
    request: true,
    grounding: { type: "object" },
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
    async ({ scenario, carrier, request, grounding }) => {
      const payload = createProbePayload(scenario, request, grounding);
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
