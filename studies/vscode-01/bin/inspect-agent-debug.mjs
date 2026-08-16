#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { inspectOtlp } from "./inspect-otlp.mjs";

export function inspectAgentDebug(path, options = {}) {
  const inspection = inspectOtlp(path, options);

  return {
    ...inspection,
    format: "closureprobe-agent-debug-inspection-v4",
    parserCompatibility: "closureprobe-otlp-inspection-v3",
    note:
      "The v4 Agent Debug inspector uses the frozen v3 JSON/JSONL candidate parser while naming the evidence artifact by its actual client-local role rather than assuming OTLP export provenance.",
  };
}

const invokedPath =
  process.argv[1] === undefined
    ? undefined
    : pathToFileURL(resolve(process.argv[1])).href;

if (invokedPath === import.meta.url) {
  const path = process.argv[2];

  if (path === undefined) {
    process.stderr.write(
      "Usage: inspect-agent-debug.mjs AGENT_DEBUG_JSON_OR_JSONL\n",
    );
    process.exit(64);
  }

  process.stdout.write(
    `${JSON.stringify(inspectAgentDebug(path), null, 2)}\n`,
  );
}
