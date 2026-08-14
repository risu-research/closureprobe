# Interoperability Protocol

ClosureProbe's MCP server emits controlled empty results so a target client can
be tested without asserting anything about a real data source.

## Minimum differential run

A target run SHOULD invoke `closureprobe_probe` with the same canonical request
across these scenarios:

| Scenario | Guard that MUST survive |
| --- | --- |
| `complete-zero` | exact, complete, exhausted zero |
| `partial-zero` | `coverage=partial` |
| `continued-zero` | `continuation=present` and partial coverage |
| `denied-zero` | `execution=denied` |
| `failed-zero` | `execution=failed` |
| `scope-mismatch-zero` | mismatched query scope |

Each scenario SHOULD be repeated with `dual`, `structured-only`, and
`text-only` carriers. `structured-only` is an adversarial diagnostic fixture;
it is not a recommendation to omit backward-compatible text in production MCP
tools.

## Observable stages

Record only boundaries the operator can actually observe. A strong run records:

1. the exact tool request and versioned target identity;
2. the MCP wire result;
3. the client's retained or transformed result;
4. the model-visible projection, if observable; and
5. any explicit model or agent claim.

Map each stage to `schemas/closure-trace.schema.json`, then run:

```bash
closureprobe trace target-trace.json --json target-analysis.json
```

Exit `0` means no finding was detected in the supplied observable trace. Exit
`2` means at least one finding was detected. It does not turn unobservable
boundaries into passing boundaries.

## Publication rule

An interoperability result MUST identify target name and version, run date,
ClosureProbe and corpus versions, carrier, repetitions, observable and hidden
boundaries, exact commands, raw artifact hashes, and any manual transformations.
Do not publish “compatible” or “safe” from a single happy-path call.
