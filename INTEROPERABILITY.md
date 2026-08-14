# Interoperability Protocol

ClosureProbe's MCP server emits controlled empty-result observations so a target
client can be tested without making a truth claim about a real source.

## Minimum differential run

Invoke `closureprobe_probe` with the same canonical request across:

| Scenario | Guard that must survive |
| --- | --- |
| `complete-zero` | exact, complete, exhausted root zero |
| `partial-zero` | `coverage=partial` |
| `continued-zero` | continuation present and traversal continued |
| `segment-zero` | locally final page is only a segment |
| `denied-zero` | `execution=denied` |
| `failed-zero` | `execution=failed` |
| `scope-mismatch-zero` | request scope mismatch |

Repeat each scenario with `dual`, `structured-only`, and `text-only` carriers.
`structured-only` is an adversarial diagnostic fixture, not a production
recommendation to omit compatible text.

## Observable stages

Record only boundaries the operator can actually inspect:

1. exact request and versioned target identity;
2. MCP wire result;
3. client-retained or transformed result;
4. model-visible projection, if observable; and
5. explicit model or agent claim, if observable.

Normalize those records into `schemas/closure-trace.schema.json`. The trace must
declare the negative proposition that `none` would mean; it must not encode a
bare claim detached from subject, predicate, and scope.

```bash
closureprobe trace target-trace.json --json target-analysis.json
```

Exit `0` means no finding was detected **in the supplied observable trace**.
Exit `2` means at least one finding was detected. Neither status says anything
about an omitted or hidden boundary.

## Evidence upgrades

If a downstream stage legitimately obtains new source evidence, include the raw
request, raw response, their canonical digests, and exact profile ID/version in
`evidenceIntroduction`. ClosureProbe reconstructs the observation itself. Do
not mark evidence as independently validated merely because the producing stage
says so.

## Publication rule

A public result must name the target and version, date, ClosureProbe/corpus/
profile versions, carrier, repetitions, observable and hidden boundaries, exact
commands, raw hashes, and every manual normalization. Do not generalize from a
single happy path to “compatible,” “safe,” or “complete.”
