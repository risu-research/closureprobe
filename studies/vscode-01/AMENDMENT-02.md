# Preregistration Amendment 02: Blinding and Boundary Localization

Recorded: 2026-08-15

Superseded in part before external execution by `AMENDMENT-03.md`, which removes
the remaining model-visible opaque condition and response-correlation tokens.

Timing: after hostile design review, before a public time anchor, commissioning,
or any external VS Code/Copilot outcome.

## Threat found

The first preregistration exposed semantic scenario names in prompts and tool
arguments. More seriously, the model-visible rc3 payload included the oracle's
derived `assessment.negativeLicense`. A model could therefore choose a claim
from labels rather than from the negative-evidence guards. That would weaken C
into a label-following test.

The initial P implementation also compared both client and model payloads to
wire. It measured cumulative preservation but could not distinguish a loss in
wire→client from a loss in client→model when the client passed its already-lossy
payload through unchanged.

## Amendment

Before external execution, the study was changed as follows:

1. Every server advertises the identical internal tool name
   `closureprobe_probe` and identical neutral arguments.
2. Server configuration keys, condition IDs, and response-correlation tokens
   are opaque hashes derived from fixed seed material.
3. Each process fixes scenario and representation path outside the tool call.
4. The model-visible `scenario` value is replaced with the opaque condition ID.
5. The model-visible oracle `assessment`, including `negativeLicense`, is
   removed. The rc3 oracle remains analysis-only.
6. All generated prompts are byte-equivalent after replacing their opaque
   correlation token.
7. P is split into `P_client` (wire→client), `P_model` (client→model), and the
   nonlocalizing cumulative wire→model comparison.
8. Primary execution uses a seeded seven-block schedule. Every scenario block
   contains all three paths; carrier position rotates across blocks.
9. Replication is comparison-level: triggered path contrasts repeat the full
   matched block rather than only one favorable or unfavorable cell.
10. The specimen is described as a named client-observable tuple. Any hosted
    backend identity not exposed by the client is explicitly unversioned.

## Preserved components

The rc3 tag, runtime, profile, source request, grounding, seven observations,
oracle, 21-cell factorial design, commissioning exclusion, invalid-run rule,
privacy rule, and product-wide-claim prohibition are unchanged.

## Remaining representation-path confound

Tool-name lexical differences are removed. Text-only still necessarily differs
by absence of `outputSchema`, and every condition remains a separate server
process. Results therefore support representation-path contrasts, not isolated
causal carrier effects.

## New executable controls

The harness tests fail if:

- a prompt contains any semantic scenario, carrier, or cell label;
- tool names or arguments differ across primary conditions;
- a model-visible stimulus exposes the semantic scenario or oracle assessment;
- the 21-run order loses its paired three-path block structure;
- carrier positions become materially imbalanced over time; or
- P fails to distinguish an upstream loss from a downstream pass-through.
