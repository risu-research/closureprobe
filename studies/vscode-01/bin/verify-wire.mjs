#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assessClosure,
  canonicalizeJson,
  sha256Digest,
} from "../../../dist/src/index.js";
import { createStudyStimulus } from "./study-stimulus.mjs";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const conditions = JSON.parse(readFileSync(resolve(studyRoot, "conditions.json"), "utf8"));
const conditionIndex = new Map(
  conditions.conditions.map((condition) => [condition.conditionId, condition]),
);
const directions = ["client_to_server", "server_to_client", "server_stderr"];

function transcriptRecords(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Transcript line ${index + 1} is not JSON: ${error.message}`);
      }
    });
}

function decodeChunk(record) {
  const bytes = Buffer.from(record.bytesBase64, "base64");
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (bytes.byteLength !== record.byteLength) {
    throw new Error(`Chunk ${record.sequence} byte length mismatch`);
  }
  if (digest !== record.sha256) {
    throw new Error(`Chunk ${record.sequence} digest mismatch`);
  }
  return bytes;
}

function jsonLines(bytes, direction) {
  const text = bytes.toString("utf8");
  const lines = text.split("\n");
  const tail = lines.pop();
  if (tail !== "") throw new Error(`${direction} stream ends with an incomplete JSON-RPC frame`);
  return lines.filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${direction} frame ${index + 1} is not JSON: ${error.message}`);
    }
  });
}

function stimulusFor(result, carrier) {
  if (carrier === "dual") {
    if (result.structuredContent === undefined || result.content?.length !== 1) {
      throw new Error("dual result did not retain both carriers");
    }
    const textStimulus = JSON.parse(result.content[0].text);
    if (canonicalizeJson(textStimulus) !== canonicalizeJson(result.structuredContent)) {
      throw new Error("dual result carriers disagree");
    }
    return result.structuredContent;
  }
  if (carrier === "structured-only") {
    if (result.structuredContent === undefined || result.content?.length !== 0) {
      throw new Error("structured-only result has an unexpected carrier shape");
    }
    return result.structuredContent;
  }
  if (carrier === "text-only") {
    if (result.structuredContent !== undefined || result.content?.length !== 1) {
      throw new Error("text-only result has an unexpected carrier shape");
    }
    return JSON.parse(result.content[0].text);
  }
  throw new Error(`Unknown carrier ${carrier}`);
}

export function verifyWireTranscript(path) {
  const absolute = resolve(path);
  const bytes = readFileSync(absolute);
  const records = transcriptRecords(absolute);
  for (const [index, record] of records.entries()) {
    if (record.sequence !== index) throw new Error(`Transcript sequence breaks at record ${index}`);
  }
  const starts = records.filter(({ kind }) => kind === "session_start");
  if (starts.length !== 1) throw new Error("Transcript must contain exactly one session_start");
  const condition = conditionIndex.get(starts[0].studyCondition);
  if (condition === undefined) throw new Error("Transcript has an unknown blinded study condition");

  const streams = Object.fromEntries(directions.map((direction) => [direction, []]));
  for (const record of records) {
    if (record.kind !== "chunk") continue;
    if (!directions.includes(record.direction)) {
      throw new Error(`Unknown chunk direction ${record.direction}`);
    }
    streams[record.direction].push(decodeChunk(record));
  }

  const clientFrames = jsonLines(Buffer.concat(streams.client_to_server), "client_to_server");
  const serverFrames = jsonLines(Buffer.concat(streams.server_to_client), "server_to_client");
  const responses = new Map(
    serverFrames
      .filter((frame) => Object.hasOwn(frame, "id"))
      .map((frame) => [canonicalizeJson(frame.id), frame]),
  );
  const calls = [];

  for (const requestFrame of clientFrames.filter((frame) => frame.method === "tools/call")) {
    const responseFrame = responses.get(canonicalizeJson(requestFrame.id));
    if (responseFrame === undefined) {
      throw new Error(`No response for tools/call id ${canonicalizeJson(requestFrame.id)}`);
    }
    if (responseFrame.error !== undefined) {
      throw new Error(`tools/call ${canonicalizeJson(requestFrame.id)} returned an error`);
    }
    if (requestFrame.params?.name !== "closureprobe_probe") {
      throw new Error(`Unexpected tool ${requestFrame.params?.name}; expected closureprobe_probe`);
    }
    const args = requestFrame.params.arguments;
    if (canonicalizeJson(args) !== canonicalizeJson(condition.arguments)) {
      throw new Error("Tool arguments differ from the frozen neutral arguments");
    }
    const stimulus = stimulusFor(responseFrame.result, condition.carrier);
    const expected = createStudyStimulus(
      condition,
      condition.arguments.request,
      condition.arguments.grounding,
    );
    if (canonicalizeJson(stimulus) !== canonicalizeJson(expected)) {
      throw new Error(`${condition.conditionId} result differs from the frozen blinded stimulus`);
    }
    const serializedStimulus = canonicalizeJson(stimulus);
    const forbiddenLabels = [
      ...new Set(conditions.conditions.flatMap(({ conditionId, scenario, carrier }) => [
        conditionId,
        scenario,
        carrier,
      ])),
      "negativeLicense",
      "assessment",
    ];
    if (
      Object.hasOwn(stimulus, "scenario") ||
      forbiddenLabels.some((label) => serializedStimulus.includes(label))
    ) {
      throw new Error("Model-visible stimulus leaks a semantic condition or oracle label");
    }
    const assessment = assessClosure(expected.observation);
    calls.push({
      jsonRpcId: requestFrame.id,
      phase: condition.phase,
      cellId: condition.cellId,
      conditionId: condition.conditionId,
      scenario: condition.scenario,
      carrier: condition.carrier,
      argumentsDigest: sha256Digest(args),
      resultDigest: sha256Digest(responseFrame.result),
      payloadDigest: sha256Digest(stimulus),
      observationDigest: sha256Digest(stimulus.observation),
      negativeLicense: assessment.negativeLicense,
    });
  }

  if (calls.length !== 1) {
    throw new Error(
      `Expected exactly one closureprobe_probe tools/call, observed ${calls.length}`,
    );
  }

  return {
    format: "closureprobe-wire-verification-v3",
    transcript: absolute,
    transcriptSha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    studyCondition: condition.conditionId,
    manifest: starts[0].studyManifest ?? null,
    byteStreams: Object.fromEntries(directions.map((direction) => [
      direction,
      {
        chunks: streams[direction].length,
        bytes: streams[direction].reduce((total, chunk) => total + chunk.byteLength, 0),
        sha256: `sha256:${createHash("sha256").update(Buffer.concat(streams[direction])).digest("hex")}`,
      },
    ])),
    frameCounts: {
      clientToServer: clientFrames.length,
      serverToClient: serverFrames.length,
    },
    calls,
  };
}

const invokedPath = process.argv[1] === undefined ? undefined : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  const transcript = process.argv[2];
  if (transcript === undefined) {
    process.stderr.write("Usage: verify-wire.mjs TRANSCRIPT [--out FILE]\n");
    process.exit(64);
  }
  const result = verifyWireTranscript(transcript);
  const outIndex = process.argv.indexOf("--out");
  const out = outIndex === -1 ? undefined : process.argv[outIndex + 1];
  if (out === undefined) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    writeFileSync(resolve(out), `${JSON.stringify(result, null, 2)}\n`, "utf8");
    process.stdout.write(`Wire transcript verified (${result.calls.length} calls) -> ${out}\n`);
  }
}
