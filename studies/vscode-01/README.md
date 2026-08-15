# ClosureProbe External Boundary Study 01

Status: **preregistration v3 final candidate; public time anchor and external execution pending**

This study treats one named, client-observable VS Code/Copilot/model
configuration as a specimen. It measures whether ClosureProbe negative-evidence
fields survive two separately observable boundaries and whether the final claim
exceeds the license visible in the model request.

It is not a general benchmark of VS Code, GitHub Copilot, or any model family.
The hosted backend is not assumed to be independently version-addressable.

## Why this is not a demo

A byte-preserving stdio tap records the actual JSON-RPC stream. VS Code's Agent
Debug export supplies candidate client events, model requests, and responses.
The analysis binds exact artifact hashes and selectors into a normalized rc3
trace.

Loss of the wrapper itself does not disappear into “unobservable”: the local
inspector can bind an arbitrary selected JSON value by pointer/type/digest while
withholding its contents from ordinary inspector output. Observable prose or an
empty object is therefore P2; P3 is reserved for a boundary that cannot be
inspected.

The experiment reports four independent endpoints:

- `P_client`: wire → client event;
- `P_model`: client event → model-visible request;
- `P_cumulative`: wire → model-visible request; and
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
model-visible normative field—or loss/change of the returned format, request,
or grounding—is recorded and forces `none` to fail closed.

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

## Frozen design

- ClosureProbe tag: `v0.1.0-rc3`
- ClosureProbe commit: `12fae2c0cb0909a43f487323fb00e7372b1f3377`
- profile: `0.3.0`
- matrix: seven scenarios × three representation paths = 21 cells
- commissioning: three excluded `complete-zero` runs
- order: seven paired scenario blocks with rotated carrier position
- escalation: comparison-level paired replication, not isolated cell repeats

Read these in order:

1. `PREREGISTRATION.md`
2. `AMENDMENT-01.md`
3. `AMENDMENT-02.md`
4. `AMENDMENT-03.md`
5. `PUBLICATION.md`
6. `RUNBOOK.md`
7. `SOURCES.md`

`RESULTS.md` is generated and currently claims no external measurement.

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

Raw wire and OTLP captures are ignored by Git. Public results bind their private
source hashes, frozen role selectors, minimal privacy-reviewed extracts, named
specimen metadata, exact timestamps, and hidden-boundary statements. Full
system prompts, unrelated context, tokens, account identifiers, and user paths
are not publication requirements.

## Current boundary

This environment does not contain a working signed-in VS Code/Copilot specimen.
No external commissioning or primary result is represented in this repository.
