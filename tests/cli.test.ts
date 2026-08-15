import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const cli = `${projectRoot}dist/src/cli.js`;

function run(args: readonly string[]) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
}

test("CLI assess emits a schema-valid licensed result", () => {
  const result = run([
    "assess",
    "--profile", "google-drive-files-list",
    "--request", "examples/drive/request.json",
    "--response", "examples/drive/complete-zero-response.json",
    "--grounding", "examples/drive/grounding.json",
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).negativeLicense, "licensed");
});

test("CLI uses exit 2 for detected trace non-conformance while retaining JSON", () => {
  const result = run(["trace", "examples/traces/partial-to-none.json"]);
  assert.equal(result.status, 2, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.conformant, false);
  assert.equal(output.firstGuardSignalLoss.boundary, "wire->model");
  assert.equal(output.firstUnlicensedNegative.stageId, "model");
});
