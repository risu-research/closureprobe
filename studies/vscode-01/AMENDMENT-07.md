# Preregistration Amendment 07: Version 5 Harness Isolation and Attempt-Bound Acquisition

Recorded: 2026-08-16

Timing: after one invalid Version 4 commissioning attempt, before any primary
execution and before a Version 5 public Gate A.

## Commissioning finding

One Version 4 commissioning attempt occurred for
`VS01-PILOT-COMPLETE-DUAL`. It is retained as invalid, excluded from all study
contrasts, and not scored. No primary execution occurred.

The wire measurement passed: it contained exactly one
`closureprobe_probe` call with the frozen arguments, condition
`P_90E7056A96AE`, the expected dual carriers, and the frozen stimulus. The
wire transcript SHA-256 is recorded without publishing private raw debug in
`evidence/public/v4-invalid-commissioning-attempt.json`.

The sealed Agent Debug evidence exposed two instrumentation/isolation defects:

1. `manage_todo_list` ran as GitHub Copilot Chat BackgroundTodoAgent
   housekeeping before the main model request. The installed client's
   experiment assignment is overridden by the explicit workspace setting
   `github.copilot.chat.agent.backgroundTodoAgent.enabled=false`.
2. Fixed reminder/context material was model-visible. It was localized to
   client-generated Copilot Agent prompt assembly, not operator-authored study
   content or a backend-only insertion. No exposed setting removed that whole
   assembly.

The attempt also exposed two acquisition/bookkeeping gaps. The selected model
request referenced a generated tool-definition sidecar that Version 4 did not
seal, and Version 4 supplied neither a commissioning-aware invalid-run mapping
nor an unused attempt-2 evidence destination.

Raw Version 4 Agent Debug contents remain private because the privacy audit
detected home paths. The public record contains only the supplied non-sensitive
hashes and classifications. The original private bundle is not moved,
overwritten, published raw, or reused as Version 5 commissioning evidence.

## Version 5 isolation correction

Version 5 adds a workspace-scoped, frontmatter-only custom agent named
`ClosureProbe Study`. It fixes:

- model `MAI-Code-1.1-Flash`;
- tools to `closureprobeStudy/*`; and
- subagents to `[]`.

It contains no body instructions. Every execution also requires the named
`ClosureProbe VSCode 01` profile, visible `Thinking Effort: Medium`, and the
explicit BackgroundTodoAgent false setting. Existing instruction, skill,
plugin, memory, browser, session-sync, and MCP-discovery isolation controls
remain in force.

The model-request tool-definition evidence must contain exactly the one
model-facing ClosureProbe MCP tool. Main Agent Debug evidence must contain one
study tool call with the frozen arguments, two ordinary tool-loop model
requests/responses, and no subagent or housekeeping tool call.

## Narrow harness-envelope rule

Unavoidable fixed Copilot Agent prompt assembly is classified as the
**harness envelope**. This is not a general exception for system instructions.
It is permitted only when manual inspection establishes that it is
client-generated, neutral, condition-independent, representation-path-
independent, and contains none of the following:

- scenario, carrier, opaque condition, or condition-map content;
- oracle assessment or analysis-side source response;
- active-condition environment values;
- memory-derived user content or unrelated workspace/user instructions; or
- any non-predeclared executable tool capability.

The first model request's full referenced system prompt, input-message bytes
and structure, user-request bytes, model, and tool-name surface must compare
exactly across all three Version 5 commissioning paths. Automated equality is
necessary but not sufficient: the fixed content still receives manual review.
Cell-varying, unrecognized, or manually disallowed content invalidates the
attempt.

Gate B records the actual privacy-safe comparison values together with the
aggregate comparison digest. For every primary attempt, `normalize-run.mjs`
recomputes this request audit from the verified seal receipt and requires an
exact match to that completed Gate-B freeze. It does not trust an
operator-supplied audit result. Thus the same isolation and harness invariants
that commission the study are executable preconditions for a normalized
primary result.

## Version 5 acquisition correction

`main.jsonl` remains the primary Agent Debug evidence root. For every attempt,
the sealer deterministically reads every `type=llm_request` record and resolves
only its plain numbered `attrs.systemPromptFile` and `attrs.toolsFile`
references. Every such referenced sidecar is sealed with the same
source-before/sealed-copy/source-after invariant and bound by the Version 5
receipt. No claim value, guard value, scenario, condition, carrier, or outcome
participates in sidecar selection.

Referenced system-prompt and tool-definition sidecars are auxiliary
harness-isolation evidence. They cannot replace `main.jsonl` for client
payload, model payload, or final-claim selection. A missing referenced sidecar,
an unstable copy, receipt drift, or later digest mismatch invalidates the
attempt.

## Version 5 invalid-attempt correction

Every prospective invalid-run entry now names `phase` as `commissioning` or
`primary` and uses the phase-generic field `position`. Commissioning position
resolves only through `commissioning.json`; primary position resolves only
through `matrix.json` and `run-order.json`.

Private Agent Debug destinations are phase-, cell-, and attempt-scoped:

```text
captures/agent-debug-private/<phase>/<cell-id>/attempt-1/
captures/agent-debug-private/<phase>/<cell-id>/attempt-2/
```

The validator rejects cross-phase cells, mapping disagreement, attempts other
than 1 or 2, duplicate attempts, and attempt 2 without retained attempt 1. Two
invalid attempts still produce `invalid_exhausted`; no third attempt is
permitted, and the matrix continues where already preregistered.

## Preserved design

Version 5 changes only isolation, acquisition, provenance, and invalid-attempt
bookkeeping. It does not change ClosureProbe rc3, the seven scenarios, three
representation paths, 21 primary cells, opaque condition mappings, run order,
controlled request, grounding, source semantics, MCP tool, frozen arguments,
projection, stdio tap, prompt bytes, none/unknown contract, C licensing rule,
P endpoints, comparison rules, or escalation rules.

The invalid attempt's visible final claim is not scored and played no role in
this amendment.

## New gates

Version 5 requires a new public Gate A1/A2 before any Version 5 commissioning.
After that gate, all three commissioning paths are repeated from fresh chats
under the Version 5 controls. No Version 3 or Version 4 commissioning evidence
is reused. Gate B remains required before any primary prompt is opened.
