#!/usr/bin/env node

import { assessClosure } from "./oracle.js";
import { corpusResultHtml, corpusResultJson, traceResultJson } from "./report.js";
import { readCorpus, runCorpus } from "./corpus.js";
import { readJson, writeText } from "./io.js";
import { assessWithProfile, sourceProfiles } from "./profiles.js";
import { analyzeTrace } from "./trace.js";
import { validateAssessment, validateTrace } from "./validation.js";

const HELP = `ClosureProbe — executable negative-evidence integrity conformance

Usage:
  closureprobe assess --profile ID --request FILE --response FILE [--json FILE]
  closureprobe trace FILE [--json FILE]
  closureprobe corpus verify FILE
  closureprobe corpus report FILE --json FILE --html FILE
  closureprobe profiles list
  closureprobe --help

Exit status is non-zero for invalid input, failed corpus cases, or detected
trace non-conformance. JSON remains available on stdout or at --json.`;

interface ParsedOptions {
  positional: string[];
  values: Map<string, string>;
}

function parseOptions(args: readonly string[]): ParsedOptions {
  const positional: string[] = [];
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]!;
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const next = args[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`Option ${value} requires a value`);
    }
    if (values.has(value)) {
      throw new Error(`Option ${value} was supplied more than once`);
    }
    values.set(value, next);
    index += 1;
  }
  return { positional, values };
}

function required(options: ParsedOptions, name: string): string {
  const value = options.values.get(name);
  if (value === undefined) throw new Error(`Missing required option ${name}`);
  return value;
}

function assertOnlyOptions(options: ParsedOptions, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const name of options.values.keys()) {
    if (!allowedSet.has(name)) throw new Error(`Unknown option ${name}`);
  }
}

function emitJson(value: unknown, outputPath?: string): void {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  if (outputPath === undefined) process.stdout.write(serialized);
  else writeText(outputPath, serialized);
}

async function main(args: readonly string[]): Promise<number> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }

  if (args[0] === "profiles" && args[1] === "list") {
    if (args.length !== 2) throw new Error("profiles list accepts no arguments");
    emitJson(
      [...sourceProfiles.values()].map(({ id, version }) => ({ id, version })),
    );
    return 0;
  }

  if (args[0] === "assess") {
    const options = parseOptions(args.slice(1));
    assertOnlyOptions(options, ["--profile", "--request", "--response", "--json"]);
    if (options.positional.length !== 0) {
      throw new Error("assess accepts options only");
    }
    const observation = assessWithProfile(
      required(options, "--profile"),
      readJson(required(options, "--request")),
      readJson(required(options, "--response")),
    );
    const assessment = validateAssessment(assessClosure(observation));
    emitJson(assessment, options.values.get("--json"));
    return 0;
  }

  if (args[0] === "trace") {
    const options = parseOptions(args.slice(1));
    assertOnlyOptions(options, ["--json"]);
    if (options.positional.length !== 1) {
      throw new Error("trace requires exactly one trace JSON file");
    }
    const trace = validateTrace(readJson(options.positional[0]!));
    const analysis = analyzeTrace(trace);
    const output = traceResultJson(analysis);
    const outputPath = options.values.get("--json");
    if (outputPath === undefined) process.stdout.write(output);
    else writeText(outputPath, output);
    return analysis.conformant ? 0 : 2;
  }

  if (args[0] === "corpus" && (args[1] === "verify" || args[1] === "report")) {
    const action = args[1];
    const options = parseOptions(args.slice(2));
    assertOnlyOptions(options, action === "report" ? ["--json", "--html"] : []);
    if (options.positional.length !== 1) {
      throw new Error(`corpus ${action} requires exactly one corpus JSON file`);
    }
    const result = runCorpus(readCorpus(options.positional[0]!));
    if (action === "verify") {
      process.stdout.write(corpusResultJson(result));
    } else {
      writeText(required(options, "--json"), corpusResultJson(result));
      writeText(required(options, "--html"), corpusResultHtml(result));
      process.stdout.write(
        `ClosureProbe ${result.corpusVersion}: ${result.passed}/${result.total} passed\n`,
      );
    }
    return result.failed === 0 ? 0 : 2;
  }

  throw new Error(`Unknown command: ${args.join(" ")}\n\n${HELP}`);
}

main(process.argv.slice(2))
  .then((status) => {
    process.exitCode = status;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`closureprobe: ${message}\n`);
    process.exitCode = 1;
  });
