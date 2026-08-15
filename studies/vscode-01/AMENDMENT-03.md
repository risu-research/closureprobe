# Preregistration Amendment 03: Projection Purity, P3, and Publication Order

Recorded: 2026-08-15

Timing: after internal preregistration v2 review, before any public time anchor,
commissioning run, or external VS Code/Copilot outcome.

## Threats found

1. The v2 projection replaced semantic `scenario` with an opaque condition ID
   while retaining rc3 `evidencePointers: ["/scenario"]`. The result was a
   study-local projection but could be mistaken for an untouched rc3 response.
2. Unique response-correlation tokens made prompts differ despite external
   session artifacts already binding each response to its run.
3. An unobservable client or model stage was normalized into a synthetic
   conservative observation. The trace analyzer could then localize a mutation
   across a stage that was never observed.
4. Gate A required a completed record containing a release timestamp before the
   release that creates that timestamp was published.
5. The v2 inspector recognized only objects retaining the study wrapper. A
   severe but observable transformation could therefore fall into P3 instead
   of P2 merely because `format` or `observation` was removed.
6. The model could select `error` or `some`, turning a binary negative-claim
   endpoint into an avoidable scoring escape hatch.
7. The fixed prompt omitted the query-complete traversal rule, so
   `segment-zero` could satisfy its prose while remaining unlicensed in rc3.
8. Schema repair could reinsert a favorable missing binding before C scoring.
9. Markdown-fenced JSON could be extracted despite the exact-JSON contract.
10. The outcome of a second invalid attempt was not fixed in advance.

## Final pre-execution changes

1. The model-visible projection contains only `format`, `request`, `grounding`,
   and the reconstructed `observation`. It contains no semantic or opaque
   condition ID.
2. The analysis-side `rootEvidence.response` retains the semantic scenario.
   rc3 reconstructs the observation from that response. `evidencePointers`
   resolve against this private source response, not the projected wrapper.
3. All 21 primary and three commissioning prompt files are byte-for-byte
   identical. The exact response has only `study` and `claim`; there is no run
   token.
4. A single fixed MCP server key and configuration is used. The operator changes
   only an ignored local environment file while the server is stopped. The
   opaque value is captured by the tap and forbidden from the model request.
5. Unobservable stages are omitted from the normalized trace. No placeholder
   observation is created. `P_model` is P3 when its client baseline is hidden,
   while `P_cumulative` may compare observable wire and model endpoints.
6. First change, guard loss, and unsupported strengthening are emitted only for
   preregistered observable local boundaries. Findings across a hidden client
   stage are cumulative and explicitly nonlocalizing.
7. The model-selectable claim is binary: `none` or `unknown`. Failure to return
   exact binary JSON becomes analysis-side `response_error` and is not C-scored.
8. Gate A is split into publication of the immutable preregistration release and
   a subsequent public metadata record. The completed record is not required to
   exist inside the release whose publication time it records.
9. The inspector adds privacy-safe generic JSON candidates containing only
   pointer, type, and digest. The normalizer can therefore classify an observed
   empty object, scalar, prose string, or observation-only projection as P2
   without printing unrelated debug values.
10. The fixed prompt states the complete rc3 closure decision rule, including
    query-complete traversal, root-query digest equality, and the fact that a
    locally exhausted `segment_only` traversal is insufficient.
11. Model-visible normalization repairs and loss/change of the returned format,
    request, or grounding are path-recorded and fail closed for a `none` claim.
    The analysis-side study root may not substitute for a binding the model did
    not receive. Normalization may make evidence representable but never more
    licensable.
12. Final claims are accepted only as native or whole-string JSON. Fenced JSON,
    extra prose, `some`, and model-produced `error` become `response_error`.
13. A second invalid attempt creates `invalid_exhausted`; no third attempt is
    allowed, the matrix continues, and affected contrasts remain incomplete.

## Preserved components

The ClosureProbe rc3 tag and semantic oracle, seven scenarios, three
representation paths, 21-cell matrix, source request and grounding, primary
contrast, seeded block order, commissioning exclusion, escalation thresholds,
privacy rules, and prohibition on product-wide claims are unchanged.

## Finality rule

This is the final pre-execution design candidate. A v4 is allowed only if
commissioning proves that the measurement machinery cannot operate as frozen,
not for additional theoretical refinement. Such a change requires a new Gate A
and repetition of all commissioning.
