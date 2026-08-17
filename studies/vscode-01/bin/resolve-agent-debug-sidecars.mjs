#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const referenceFields = [
  {
    attribute: "systemPromptFile",
    role: "system-prompt",
    pattern: /^system_prompt_[0-9]+\.json$/,
  },
  {
    attribute: "toolsFile",
    role: "tool-definitions",
    pattern: /^tools_[0-9]+\.json$/,
  },
];

function requirePlainMatchingFilename(value, field) {
  if (
    typeof value !== "string" ||
    basename(value) !== value ||
    value === "." ||
    value === ".." ||
    !field.pattern.test(value)
  ) {
    throw new Error(
      `llm_request attrs.${field.attribute} is not a supported plain sidecar filename`,
    );
  }
  return value;
}

export function readAgentDebugRecords(path) {
  return readFileSync(resolve(path), "utf8")
    .split(/\r?\n/)
    .flatMap((line, index) => {
      if (line.trim().length === 0) return [];
      try {
        return [{ lineNumber: index + 1, record: JSON.parse(line) }];
      } catch (error) {
        throw new Error(
          `Agent Debug main.jsonl line ${index + 1} is not JSON: ${error.message}`,
        );
      }
    });
}

export function resolveAgentDebugRequestSidecars(path) {
  const requests = [];
  const required = new Map();

  for (const { lineNumber, record } of readAgentDebugRecords(path)) {
    if (
      record === null ||
      typeof record !== "object" ||
      Array.isArray(record) ||
      record.type !== "llm_request"
    ) continue;

    if (record.attrs === null || typeof record.attrs !== "object" || Array.isArray(record.attrs)) {
      throw new Error(`llm_request at line ${lineNumber} has no attrs object`);
    }

    const references = [];
    for (const field of referenceFields) {
      if (!Object.hasOwn(record.attrs, field.attribute)) continue;
      const sourceFile = requirePlainMatchingFilename(record.attrs[field.attribute], field);
      references.push({
        attribute: field.attribute,
        role: field.role,
        sourceFile,
      });
      const key = `${field.role}:${sourceFile}`;
      const prior = required.get(key);
      if (prior === undefined) {
        required.set(key, {
          role: field.role,
          sourceFile,
          requestLineNumbers: [lineNumber],
        });
      } else {
        prior.requestLineNumbers.push(lineNumber);
      }
    }
    requests.push({ lineNumber, references });
  }

  return {
    format: "closureprobe-agent-debug-request-sidecars-v1",
    selectionRule:
      "all type=llm_request records in main.jsonl; only attrs.systemPromptFile and attrs.toolsFile plain numbered JSON references",
    requestCount: requests.length,
    requests,
    requiredSidecars: [...required.values()],
  };
}

const invokedPath = process.argv[1] === undefined
  ? undefined
  : pathToFileURL(resolve(process.argv[1])).href;

if (invokedPath === import.meta.url) {
  const mainPath = process.argv[2];
  if (mainPath === undefined) {
    process.stderr.write("Usage: resolve-agent-debug-sidecars.mjs MAIN_JSONL\n");
    process.exit(64);
  }
  try {
    process.stdout.write(
      `${JSON.stringify(resolveAgentDebugRequestSidecars(mainPath), null, 2)}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
