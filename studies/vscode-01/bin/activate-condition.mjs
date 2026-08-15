#!/usr/bin/env node

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const studyRoot = fileURLToPath(new URL("../", import.meta.url));
const conditions = JSON.parse(readFileSync(resolve(studyRoot, "conditions.json"), "utf8"));
const conditionId = process.argv[2];
const outIndex = process.argv.indexOf("--out");
const selectedOutput = outIndex === -1 ? undefined : process.argv[outIndex + 1];
if (!conditions.conditions.some((condition) => condition.conditionId === conditionId)) {
  process.stderr.write("Usage: activate-condition.mjs OPAQUE_CONDITION_ID [--out ENV_FILE]\n");
  process.exit(64);
}

const target = selectedOutput === undefined
  ? resolve(studyRoot, "specimen-workspace/.study-condition.local.env")
  : resolve(selectedOutput);
const temporary = `${target}.tmp`;
writeFileSync(temporary, `CLOSUREPROBE_STUDY_CONDITION=${conditionId}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
renameSync(temporary, target);
process.stdout.write(`Activated opaque condition ${conditionId}. Restart the stopped MCP server.\n`);
