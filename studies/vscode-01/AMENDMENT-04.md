# Preregistration Amendment 04: Sealed Agent Debug Artifact

Recorded: 2026-08-15

Timing: after public preregistration v3 Gate A1/A2 and excluded commissioning,
before any primary execution.

## Why a v4 preregistration is required

Preregistration v3 required each external run to bind one MCP wire transcript
to one exported Agent Debug/OTLP artifact. The frozen extraction and selection
contracts treated that exported artifact as the source for the observable
client tool event, model-visible request, and explicit final response.

Excluded commissioning demonstrated that this measurement contract cannot
observe the preregistered C endpoint as written.

In the commissioned VS Code/Copilot specimen:

1. the ordinary exported Agent Debug/OTLP artifact did not expose the exact
   final two-key study claim required by the C endpoint;
2. the session-local Agent Debug `main.jsonl` did expose the client tool result,
   the subsequent model-visible request containing that tool result, and the
   explicit final agent response;
3. the frozen inspector could already parse the JSONL representation and
   identify controlled `probe_payload` and exact `study_claim` candidates
   without selecting by their semantic values; and
4. the live `main.jsonl` file was observed to remain mutable after the relevant
   chat had completed, so later reads of the workspaceStorage copy are not a
   stable evidence source.

The defect is therefore in the preregistered measurement-artifact contract, not
in the semantic stimulus, scenario design, carrier implementation, oracle, or
claim rule.

Preregistration v3 expressly permits a new pre-execution version when
commissioning demonstrates that the measurement machinery cannot operate as
frozen. No primary prompt was opened before this finding.

## Narrow v4 change

Version 4 replaces the OTLP-specific run artifact contract with one sealed
Agent Debug artifact contract.

For every commissioning and primary run:

1. the run still produces exactly one corresponding stdio wire transcript;
2. after the explicit final response is present and before any further
   interaction in that chat, the session-local Agent Debug `main.jsonl` for
   that chat is identified by its session directory;
3. SHA-256 of the live source file is recorded immediately before copying;
4. the file is copied byte-for-byte into the private study capture directory;
5. SHA-256 of the sealed copy is recorded;
6. SHA-256 of the live source file is recorded again immediately after copying;
7. the seal is valid only when source-before, sealed-copy, and source-after
   SHA-256 values are identical;
8. if those three values differ, the artifact is not treated as a stable
   snapshot and the run follows the v4 invalid-run policy rather than selecting
   evidence from a later version of the live file; sealing failure or later
   seal-verification failure is an instrumentation invalidity and does not
   change the fixed maximum-attempt policy;
9. the sealed copy, never the later mutable workspaceStorage source file, is
   the evidence artifact used by the inspector, selectors, and normalizer;
10. public evidence records its sealed-copy hash and the smallest
    privacy-reviewed role evidence needed to establish the selected boundaries;
    and
11. the raw sealed Agent Debug artifact remains private unless separately
    privacy-reviewed for publication.

Any session-local Agent Debug sidecar used to establish a preregistered
contamination control, including the model-visible tool surface, is separately
copied and validated with the same source-before, sealed-copy, source-after
three-hash rule. Its sealed hash is bound as auxiliary contamination evidence.
Such a sidecar is never an eligible substitute for `main.jsonl` when selecting
the client payload, model payload, or final claim.

The public selection contract names the sealed receipt and its SHA-256. The
receipt is the single evidence root: the eligible `main.jsonl` filename, its
sealed SHA-256, and any auxiliary contamination artifacts are derived from and
verified against that receipt rather than redundantly supplied as independent
selection claims. An artifact is not described as OTLP merely because the
existing parser originated as an OTLP/debug inspector.

## Extraction rule remains result-independent

Commissioning may freeze selectors from event structure and boundary role only.

The intended roles are:

- client payload: the controlled ClosureProbe payload in the client-observable
  tool-result event;
- model payload: the controlled ClosureProbe payload in the subsequent
  model-visible LLM request tool-response input; and
- claim: the exact two-key study JSON in the explicit final agent-response
  event.

Selectors MUST NOT depend on:

- whether a guard field is favorable;
- whether the claim is `none` or `unknown`;
- the semantic scenario;
- the opaque condition ID;
- the representation-path label; or
- choosing a candidate merely because another candidate would produce
  `P3_unobservable`.

Concrete array or JSONL line indexes observed during commissioning are not
stable selectors and are not frozen as such.

## Preserved experimental design

Version 4 does not change:

- ClosureProbe rc3 or its semantic oracle;
- the seven semantic scenarios;
- the three representation paths;
- the 21 primary cells;
- the opaque condition mapping;
- request or grounding arguments;
- the MCP tool name, description, or input stimulus;
- the 24 generated prompt files or their bytes;
- the binary `none` / `unknown` claim contract;
- the C licensing rule;
- the P endpoint definitions;
- the seeded primary run order;
- the invalid-run policy;
- the comparison-level escalation rules; or
- the prohibition on product-wide claims.

The three v3 commissioning executions are retained only as pre-v4 measurement
diagnostics. They are not reused as v4 commissioning observations. After a new
public v4 Gate A1/A2, all three excluded commissioning cells are executed again
under the sealed-artifact contract before Gate B.

## Historical preservation

The immutable v3 preregistration release, its post-publication anchor, and all
private commissioning diagnostics remain unchanged as historical evidence.

Version 4 receives a new source commit, annotated preregistration tag, immutable
Gate A release, and separate post-publication anchor before commissioning is
repeated.

No primary execution may begin until:

1. v4 Gate A1 and A2 are public;
2. all three v4 commissioning runs are complete;
3. the result-independent extraction rule and exact specimen tuple are frozen;
   and
4. v4 Gate B1/B2 are public.

## Interpretation

The need for this amendment is itself a commissioning finding:

the preregistered export artifact did not expose every boundary required by the
study, while a different client-local debug artifact did.

This amendment repairs observability only. It does not use commissioning
semantic outcomes to alter the experimental question or scoring rules.
