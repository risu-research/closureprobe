#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));

export function attemptEvidencePath(phase, cellId, attempt, matrix, commissioning) {
  if (phase !== "commissioning" && phase !== "primary") {
    throw new Error("phase must be commissioning or primary");
  }
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 2) {
    throw new Error("attempt must be 1 or 2");
  }
  const cells = phase === "primary" ? matrix?.cells : commissioning?.cells;
  if (!Array.isArray(cells) || !cells.some(({ id }) => id === cellId)) {
    throw new Error(`cell ${cellId} does not belong to ${phase}`);
  }
  if (!/^[A-Z0-9_-]+$/.test(cellId)) {
    throw new Error("cellId cannot be represented as a safe evidence path");
  }
  return `captures/agent-debug-private/${phase}/${cellId}/attempt-${attempt}`;
}

const invokedPath = process.argv[1] === undefined
  ? undefined
  : pathToFileURL(resolve(process.argv[1])).href;

if (invokedPath === import.meta.url) {
  const [phase, cellId, attemptText] = process.argv.slice(2);
  if (phase === undefined || cellId === undefined || attemptText === undefined) {
    process.stderr.write(
      "Usage: attempt-evidence-path.mjs (commissioning|primary) CELL_ID (1|2)\n",
    );
    process.exit(64);
  }
  try {
    const matrix = JSON.parse(readFileSync(resolve(studyRoot, "matrix.json"), "utf8"));
    const commissioning = JSON.parse(
      readFileSync(resolve(studyRoot, "commissioning.json"), "utf8"),
    );
    process.stdout.write(
      `${attemptEvidencePath(phase, cellId, Number(attemptText), matrix, commissioning)}\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}
