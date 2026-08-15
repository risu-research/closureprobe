# Interoperability Protocol

ClosureProbe's MCP server emits controlled empty-result observations so a target
client can be tested without making a truth claim about a live source.

## Minimum differential run

Invoke `closureprobe_probe` with the same request and grounding across:

| Scenario | Guard that must survive |
| --- | --- |
| `complete-zero` | exact, complete, exhausted anchored root zero |
| `partial-zero` | `coverage=partial` |
| `continued-zero` | continuation present and traversal continued |
| `segment-zero` | locally final page is only a segment |
| `denied-zero` | `execution=denied` |
| `failed-zero` | `execution=failed` |
| `scope-mismatch-zero` | request scope mismatch |

Repeat each scenario with `dual`, `structured-only`, and `text-only` carriers.
`structured-only` is an adversarial diagnostic fixture, not a recommendation to
omit compatible text.

Use one controlled grounding throughout the run:

```json
{
  "sourceContext": {
    "producer": "closureprobe-controlled-probe",
    "instance": { "server": "target-run-id" },
    "authority": { "principal": "test-operator" }
  },
  "propositionScope": { "tenant": "fixture" }
}
```

## Root capture

Every normalized trace must include the probe request, scenario response,
grounding, exact controlled profile version, and canonical digests as
`rootEvidence`. The first observable stage must reconstruct from that evidence.
Do not begin a trace with a copied observation that merely says
`profile_validated`.

## Observable stages

Record only boundaries the operator can inspect:

1. exact request, grounding, and versioned target identity;
2. MCP wire result;
3. client-retained or transformed result;
4. model-visible projection, if observable; and
5. explicit model or agent claim, if observable.

Normalize records into `schemas/closure-trace.schema.json`:

```bash
closureprobe trace target-trace.json --json target-analysis.json
```

Exit `0` means no finding was detected in the supplied observable trace. Exit
`2` means at least one finding was detected. Neither says anything about an
omitted or hidden boundary.

## Evidence upgrades

If a downstream stage obtains new source evidence, include the supplied
request, response, grounding, canonical digests, and exact profile ID/version in
`evidenceIntroduction`. ClosureProbe reconstructs the observation. A stage
cannot validate its own upgrade by declaration.

## Publication rule

A public result must name the target and version, date, ClosureProbe/corpus/
profile versions, grounding method, carrier, repetitions, observable and hidden
boundaries, exact commands, canonical and byte-level hashes where available,
and every manual normalization. Do not generalize a single happy path to
“compatible,” “safe,” or “complete.”
