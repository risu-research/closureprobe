#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

import {
  assessClosure,
  canonicalizeJson,
  createProbePayload,
  sha256Digest,
} from "../../../dist/src/index.js";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = resolve(studyRoot, "../..");
const originalServer = resolve(repositoryRoot, "dist/src/mcp-server.js");
const packageMetadata = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));
const study = JSON.parse(readFileSync(resolve(studyRoot, "study.json"), "utf8"));
const outputPath = resolve(studyRoot, "evidence/public/preflight-rc3-carrier-validation.json");

function textContent(result) {
  return (result.content ?? [])
    .filter(({ type }) => type === "text")
    .map(({ text }) => text)
    .join("\n");
}

function extractIntendedPayload(result, carrier) {
  if (carrier !== "text-only" && result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  const text = textContent(result);
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function callOriginal(carrier) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [originalServer],
    cwd: repositoryRoot,
    stderr: "pipe",
  });
  const client = new Client({ name: "closureprobe-study-preflight", version: "1.0.0" });
  await client.connect(transport);
  try {
    const listed = await client.listTools();
    const tool = listed.tools.find(({ name }) => name === "closureprobe_probe");
    if (tool === undefined) throw new Error("Original rc3 tool was not listed");
    const argumentsObject = {
      scenario: "complete-zero",
      carrier,
      request: study.request,
      grounding: study.grounding,
    };
    const result = await client.callTool({ name: tool.name, arguments: argumentsObject });
    const expectedBase = createProbePayload(
      argumentsObject.scenario,
      argumentsObject.request,
      argumentsObject.grounding,
    );
    const expected = { ...expectedBase, assessment: assessClosure(expectedBase.observation) };
    const observed = extractIntendedPayload(result, carrier);
    return {
      carrier,
      outputSchemaDeclared: tool.outputSchema !== undefined,
      isError: result.isError === true,
      structuredContentPresent: result.structuredContent !== undefined,
      contentTypes: (result.content ?? []).map(({ type }) => type),
      expectedPayloadSha256: sha256Digest(expected),
      resultSha256: sha256Digest(result),
      intendedPayloadObserved:
        observed !== undefined && canonicalizeJson(observed) === canonicalizeJson(expected),
      ...(result.isError === true ? { errorText: textContent(result) } : {}),
    };
  } finally {
    await client.close();
  }
}

const calls = [];
for (const carrier of study.design.carriers) calls.push(await callOriginal(carrier));

const evidence = {
  format: "closureprobe-rc3-carrier-preflight-v1",
  studyId: study.studyId,
  instrument: {
    tag: study.instrument.tag,
    commit: study.instrument.commit,
    packageVersion: packageMetadata.version,
    originalServerSha256: `sha256:${createHash("sha256").update(readFileSync(originalServer)).digest("hex")}`,
    mcpServerSdkVersion: packageMetadata.dependencies["@modelcontextprotocol/server"],
    mcpClientSdkVersion: packageMetadata.devDependencies["@modelcontextprotocol/client"],
  },
  controlledInput: {
    scenario: "complete-zero",
    requestSha256: sha256Digest(study.request),
    groundingSha256: sha256Digest(study.grounding),
  },
  protocolRule: {
    version: "2026-07-28",
    url: "https://modelcontextprotocol.io/specification/2026-07-28/server/tools",
    summary: "A server declaring outputSchema must provide conforming structuredContent.",
  },
  calls,
  finding: {
    code: "rc3_text_only_output_schema_conflict",
    observed: calls.some(
      ({ carrier, isError, intendedPayloadObserved }) =>
        carrier === "text-only" && isError && !intendedPayloadObserved,
    ),
    scope: "ClosureProbe rc3 MCP server preflight; not a VS Code client result.",
  },
};

const content = `${JSON.stringify(evidence, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(outputPath, "utf8") !== content) {
    throw new Error("Preflight evidence is stale or not reproducible");
  }
  process.stdout.write("rc3 carrier preflight evidence verified\n");
} else {
  writeFileSync(outputPath, content, "utf8");
  process.stdout.write(`rc3 carrier preflight evidence written -> ${outputPath}\n`);
}
