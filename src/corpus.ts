import { readFileSync } from "node:fs";

import { assessClosure } from "./oracle.js";
import { assessWithProfile } from "./profiles.js";
import { analyzeTrace } from "./trace.js";
import type {
  CaseResult,
  CorpusResult,
  FrozenCorpus,
  JsonValue,
} from "./types.js";
import { validateCorpus } from "./validation.js";

export const TOOL_VERSION = "0.1.0-rc3";

function sorted(values: readonly string[]): string[] {
  return [...values].sort();
}

function equalJson(left: JsonValue, right: JsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function readCorpus(path: string): FrozenCorpus {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return validateCorpus(parsed);
}

export function runCorpus(corpus: FrozenCorpus): CorpusResult {
  const results: CaseResult[] = corpus.cases.map((testCase) => {
    if (testCase.kind === "observation") {
      const observation = assessWithProfile(
        testCase.profileId,
        testCase.request,
        testCase.response,
        testCase.grounding,
      );
      const assessment = assessClosure(observation);
      const expected = {
        branch: testCase.expected.branch,
        negativeLicense: testCase.expected.negativeLicense,
        blockers: sorted(testCase.expected.blockers),
      } satisfies JsonValue;
      const actual = {
        branch: assessment.branch,
        negativeLicense: assessment.negativeLicense,
        blockers: sorted(assessment.blockers),
      } satisfies JsonValue;
      const passed = equalJson(expected, actual);
      return {
        id: testCase.id,
        kind: testCase.kind,
        title: testCase.title,
        passed,
        expected,
        actual,
        diagnostics: passed ? [] : ["Derived assessment did not match the frozen oracle"],
      };
    }

    const analysis = analyzeTrace(testCase.trace);
    const expected = sorted(testCase.expectedFindingCodes) satisfies JsonValue;
    const actual = sorted(analysis.findings.map((item) => item.code)) satisfies JsonValue;
    const passed = equalJson(expected, actual);
    return {
      id: testCase.id,
      kind: testCase.kind,
      title: testCase.title,
      passed,
      expected,
      actual,
      diagnostics: passed ? [] : ["Trace findings did not match the frozen oracle"],
    };
  });

  const passed = results.filter((result) => result.passed).length;
  return {
    tool: "closureprobe",
    toolVersion: TOOL_VERSION,
    corpusVersion: corpus.corpusVersion,
    profileVersion: corpus.profileVersion,
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
