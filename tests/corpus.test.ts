import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { readCorpus, runCorpus } from "../src/corpus.js";
import { readJson } from "../src/io.js";
import { corpusResultHtml } from "../src/report.js";
import { validateSourceProfileDescriptor } from "../src/validation.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

test("the frozen corpus is schema-valid and fully agrees with the oracle", () => {
  const result = runCorpus(readCorpus(`${projectRoot}corpus/v0.1/cases.json`));
  assert.equal(result.total, 40);
  assert.equal(result.failed, 0);
  assert.equal(result.passed, 40);
});

test("all distributed source-profile descriptors validate", () => {
  const profileRoot = `${projectRoot}profiles`;
  const files = readdirSync(profileRoot).filter((name) => name.endsWith(".json"));
  assert.equal(files.length, 6);
  for (const file of files) {
    assert.doesNotThrow(() =>
      validateSourceProfileDescriptor(readJson(`${profileRoot}/${file}`)),
    );
  }
});

test("the evidence report is self-contained and states its limit", () => {
  const result = runCorpus(readCorpus(`${projectRoot}corpus/v0.1/cases.json`));
  const html = corpusResultHtml(result);
  assert.match(html, /40<\/strong><span>cases/);
  assert.match(html, /does not prove source truth/);
  assert.doesNotMatch(html, /<script|https?:\/\//i);
});
