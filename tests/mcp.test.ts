import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

test("an independent official MCP client observes all three carriers", async (context) => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [`${projectRoot}dist/src/mcp-server.js`],
    cwd: projectRoot,
    stderr: "pipe",
  });
  const client = new Client({ name: "closureprobe-independent-test", version: "0.1.0" });
  context.after(async () => {
    await client.close();
  });

  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(({ name }) => name), ["closureprobe_probe"]);

  const dual = await client.callTool({
    name: "closureprobe_probe",
    arguments: { scenario: "continued-zero", carrier: "dual", request: { q: "needle" } },
  });
  assert.equal(dual.content.length, 1);
  const dualStructured = dual.structuredContent as
    | { assessment: { negativeLicense: string } }
    | undefined;
  assert.equal(dualStructured?.assessment.negativeLicense, "not_licensed");

  const structured = await client.callTool({
    name: "closureprobe_probe",
    arguments: { scenario: "partial-zero", carrier: "structured-only", request: { q: "needle" } },
  });
  assert.deepEqual(structured.content, []);
  const structuredPayload = structured.structuredContent as
    | { observation: { coverage: string } }
    | undefined;
  assert.equal(structuredPayload?.observation.coverage, "partial");

  const text = await client.callTool({
    name: "closureprobe_probe",
    arguments: { scenario: "complete-zero", carrier: "text-only", request: { q: "needle" } },
  });
  assert.equal(text.structuredContent, undefined);
  assert.equal(text.content[0]?.type, "text");
});
