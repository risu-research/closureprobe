# ClosureProbe External Boundary Study 01

Status: **terminal — instrumentation-limited after Version 6 commissioning cell 1 exhausted both permitted attempts; no primary execution**

This study treats one named, client-observable VS Code/Copilot/model
configuration as a specimen. It measures whether ClosureProbe negative-evidence
fields survive two separately observable boundaries and whether the final claim
exceeds the license visible in the model request.

It is not a general benchmark of VS Code, GitHub Copilot, or any model family.
The hosted backend is not assumed to be independently version-addressable.

## Why this is not a demo

A byte-preserving stdio tap records the actual JSON-RPC stream. An immediately
sealed session-local Agent Debug `main.jsonl` snapshot supplies candidate client
events, model requests, and responses. A verified `seal-receipt.json` is the
single Agent Debug evidence root; the analysis derives the sealed primary
artifact from that receipt and binds exact hashes and selectors into a
normalized rc3 trace. Version 5 also resolves and seals every numbered
`systemPromptFile` and `toolsFile` referenced by a model-request record. Those
sidecars are auxiliary isolation evidence and never replace `main.jsonl`.

Loss of the wrapper itself does not disappear into â€œunobservableâ€: the local
inspector can bind an arbitrary selected JSON value by pointer/type/digest while
withholding its contents from ordinary inspector output. Observable prose or an
empty object is therefore P2; P3 is reserved for a boundary that cannot be
inspected.

The experiment reports four independent endpoints:

- `P_client`: wire â†’ client event;
- `P_model`: client event â†’ model-visible request;
- `P_cumulative`: wire â†’ model-visible request; and
- `C`: explicit claim versus the model-visible negative license.

It also reports first observable normative change, first guard-signal loss, and
first unsupported strengthening as distinct diagnostics; those labels are not
interchangeable.

No hidden boundary is classified as preserved or lost.
Unobservable stages are omitted rather than replaced with synthetic evidence;
cumulative endpoint differences that cross one remain explicitly unlocalized.

`C` measures conformance under the study's explicit fixed instruction. It is
not an estimate of spontaneous model behavior in ordinary, unprompted use.
The model can answer only `none` or `unknown`; formatting failures are
analysis-side `response_error`. Any analysis repair of a missing or invalid
model-visible normative fieldâ€”or loss/change of the returned format, request,
or groundingâ€”is recorded and forces `none` to fail closed.

## Anti-leakage design

The initial design exposed semantic scenario names and the rc3 oracle assessment
to the model. `AMENDMENT-02.md` removed both. Final pre-execution review then
found that opaque condition/run tokens were unnecessary and that synthetic P3
stages could create false localization; `AMENDMENT-03.md` removes both.

All 21 primary conditions expose the same server key, tool name, description,
arguments, and byte-for-byte identical prompt. The model-visible projection has
no scenario, condition, carrier, run token, oracle, or source response. Only the
reconstructed evidence-status fields vary within a representation path; across
paths, the preregistered carrier and output-schema representation deliberately
varies.

The semantic source response remains analysis-side. Its frozen rc3
reconstruction produces the observation, and `evidencePointers` resolve against
that source response rather than the projected wrapper.

Pre-primary v3 commissioning exposed an instrumentation defect in the
prescribed debug-export contract: that artifact did not expose the final
response required for C, while the session-local debug log did. A live
session-local log was also observed to change after an earlier snapshot.
`AMENDMENT-04.md` therefore changes only the acquisition and provenance
contract. The v3 commissioning executions remain excluded and are not reused
as v4 commissioning evidence.

One subsequent Version 4 commissioning attempt had a correct wire but invalid
harness isolation: suppressible BackgroundTodoAgent housekeeping added
`manage_todo_list`, and unrelated fixed Copilot Agent context was model-visible.
The attempt is excluded and unscored. Version 4 also lacked an automatically
sealed request-sidecar contract and an executable commissioning attempt-2 path.
`AMENDMENT-07.md` creates Version 5 solely to repair those measurement,
isolation, provenance, and bookkeeping defects.

Version 5 explicitly disables BackgroundTodoAgent and uses the tracked,
frontmatter-only `ClosureProbe Study` agent with model
`MAI-Code-1.1-Flash`, visible `Thinking Effort: Medium`, only
`closureprobeStudy/*`, and no subagents. Fixed client-generated Agent prompt
assembly is a narrow harness envelope, not a general system-instruction
whitelist: its hashes must match across all commissioning paths and its content
must still pass manual contamination review.

Those privacy-safe hashes and structure digests are frozen explicitly at Gate
B. Primary normalization recomputes the request audit from the receipt-bound
sealed evidence and fails unless the attempt matches that exact completed
harness freeze; no operator-authored audit file is trusted.

After public Version 5 Gate A1/A2, the first real Version 5 commissioning
attempt was sealed but invalid: Agent Debug request isolation observed
`session_store_sql`, and the raw transcript contained zero verified intended
calls. The claim is unscored. `AMENDMENT-08.md` creates the final Version 6
instrumentation revision, adding only explicit local-index disablement and
exact-one-call wire verification. All three commissioning paths restart from
attempt 1; no Version 5 commissioning evidence is reused.

## Terminal result

Version 6 Gate A1 and A2 were public before execution. The first required
commissioning cell, `VS01-PILOT-COMPLETE-DUAL`, exhausted both permitted
attempts. In each attempt the receipt-bound request-isolation audit observed
unexpected `session_store_sql` activity and the instrumented MCP wire contained
zero verified `closureprobe_probe` calls. Both attempts are invalid, excluded,
and unscored.

Under the preregistered final-instrumentation stopping rule in
`AMENDMENT-08.md`, the study therefore terminates as **instrumentation-limited**
before Gate B and before any primary execution. Commissioning positions 2 and 3
and the 21-cell primary matrix were not opened. This is a measurement limitation
for the named specimen, not evidence that ClosureProbe semantics were preserved
or lost. See `TERMINAL-REPORT.md` and
`evidence/public/v6-terminal-record.json`.

## Frozen design

- ClosureProbe tag: `v0.1.0-rc3`
- ClosureProbe commit: `12fae2c0cb0909a43f487323fb00e7372b1f3377`
- profile: `0.3.0`
- matrix: seven scenarios Ã— three representation paths = 21 cells
- commissioning: three excluded `complete-zero` runs
- order: seven paired scenario blocks with rotated carrier position
- escalation: comparison-level paired replication, not isolated cell repeats

Read these in order:

1. `PREREGISTRATION.md`
2. `AMENDMENT-01.md`
3. `AMENDMENT-02.md`
4. `AMENDMENT-03.md`
5. `AMENDMENT-04.md`
6. `AMENDMENT-05.md`
7. `AMENDMENT-06.md`
8. `AMENDMENT-07.md`
9. `AMENDMENT-08.md`
10. `PUBLICATION.md`
11. `RUNBOOK.md`
12. `SOURCES.md`
13. `TERMINAL-REPORT.md`

`RESULTS.md` is generated and currently claims no primary result.

## Local verification

From the repository root:

```bash
npm ci
npm run build
node studies/vscode-01/bin/check-prerequisites.mjs
node studies/vscode-01/bin/generate-matrix.mjs --check
node studies/vscode-01/bin/preflight-rc3-carriers.mjs --check
node studies/vscode-01/bin/results-ledger.mjs --check
node studies/vscode-01/bin/study-manifest.mjs --check
node --test studies/vscode-01/tests/*.test.mjs
```

The primary matrix must not begin until both public anchors required by
`PUBLICATION.md` exist.

## Evidence handling

Raw wire captures and sealed Agent Debug capture contents are ignored by Git.
Public results bind their private source hashes, verified seal-receipt root,
frozen role selectors, privacy-safe request-isolation and harness-comparison
records, minimal privacy-reviewed extracts, named specimen metadata, exact
timestamps, and hidden-boundary statements. Full system
prompts, unrelated context, tokens, account identifiers, and user paths are
not publication requirements.

## Current boundary

A signed-in VS Code/Copilot specimen was used for pre-primary diagnostics, one
invalid Version 4 commissioning attempt, one invalid Version 5 commissioning
attempt, and two permitted Version 6 attempts for the first required
commissioning cell. The two Version 6 attempts are retained as invalid and
excluded: each showed unexpected `session_store_sql` activity in the
receipt-bound request audit and zero verified intended MCP calls on the wire.

That Version 6 cell is `invalid_exhausted`. The study therefore terminates as
instrumentation-limited under the preregistered stopping rule. Gate B was not
reached, commissioning positions 2 and 3 were not opened, and primary
executions observed remain zero. No semantic outcome from an invalid attempt is
scored, and no Version 7 is created.
