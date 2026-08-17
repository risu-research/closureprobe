# ClosureProbe

**Did your agent turn UNKNOWN into NONE?**

ClosureProbe is an executable falsification and conformance system for
**Negative Evidence Integrity** in agentic toolchains. It tests whether an
empty page, incomplete traversal, denied search, failed shard, narrowed source
context, or lost guard signal is silently upgraded into the claim that nothing
exists.

The technical object is deliberately narrow: a query-relative assertion of
absence. The consequential question is larger: **when has an observed system
earned the right to stop searching and assert none?**

## The false-zero firewall

A `none` claim in a trace is admissible only when one receiver-checkable chain
holds:

1. the trace begins with supplied request/response evidence that the receiver
   reconstructs through the exact installed source profile;
2. the exact root request, declared source instance, authority context, and
   proposition scope are canonically bound;
3. the evidence unit is a complete root response or a validated root-to-final
   traversalâ€”not merely a final continuation page;
4. execution succeeded, cardinality is zero, coverage is complete,
   continuation is exhausted, scope is exact, and every required producer
   signal validates; and
5. the claim is bound to the same source context and exact subject, predicate,
   and scope.

The anchor may flow through a weakening transformation. It cannot survive a
scope/context change, source-profile substitution, or favorable evidence
mutation unless the receiver reconstructs new supplied evidence.

## What rc3 changes

rc2 prevented a sender from self-authorizing a downstream evidence upgrade.
rc3 closes the earlier trust gap: a trace can no longer begin with a naked
`profile_validated` observation.

- `rootEvidence` is mandatory and receiver-reconstructed.
- Every stage exposes `evidenceAnchored` in the analysis.
- `sourceContext` identifies the declared producer, instance, and authority.
- The observation binds that context and the proposition scope independently.
- Proposition binding v2 binds `none` to both its proposition and source context.
- Unverified root evidence, grounding drift, and profile substitution have
  distinct findings.
- Elasticsearch v0.3 is deliberately local-cluster only; cross-cluster results
  are rejected rather than inferred complete from shard counts.
- Microsoft Graph traversal links must be nonempty, absolute HTTPS, and
  same-origin with the root URL.

These are consistency and reconstruction guarantees over supplied evidence.
They do not authenticate the producer or prove that a declared authority scope
matches the world.

## Quick start

```bash
npm install
npm run quality
node dist/src/cli.js corpus verify corpus/v0.3/cases.json
node dist/src/cli.js assess \
  --profile google-drive-files-list \
  --request examples/drive/request.json \
  --response examples/drive/continued-zero-response.json \
  --grounding examples/drive/grounding.json
```

Run the controlled MCP probe:

```bash
node dist/src/mcp-server.js
```

The frozen rc3 probe has a bounded known issue in `text-only` mode when combined
with its declared `outputSchema`. See [ERRATA.md](ERRATA.md); the corpus and
oracle are unaffected.

The Drive example remains unlicensed because its current page contains a
`nextPageToken`. A validated multi-page bundle counts every page, so an earlier
hit cannot disappear behind an empty final page.

## Frozen adversarial evidence

The rc3 corpus contains **50 deterministic cases**: 37 source-profile
observations and 13 cross-boundary traces. New attacks cover a forged root
anchor, source-scope drift, profile substitution, skipped cross-cluster search,
and malformed Graph traversal links. Positive controls include preservation and
a legitimate receiver-reconstructed evidence upgrade.

| Profile | Evidence boundary enforced |
| --- | --- |
| Google Drive `files.list` | root vs `pageToken`; exact token-linked aggregate; `incompleteSearch` |
| DynamoDB `Query` | root vs `ExclusiveStartKey`; exact key-linked aggregate |
| Elasticsearch search | grounded local cluster; exact total; complete nonempty shard set; no early termination |
| GraphQL Relay | parsed forward root query; `first`/`after`; `hasNextPage`; GraphQL errors |
| Microsoft Graph delta | complete root-to-`deltaLink` bundle; exact `nextLink` chain; safe URL shape |
| Generic enumeration | explicit controlled contract, including traversal status |

## Project structure

```text
PROFILE.md             normative bounded profile
POSITIONING.md         distinction from adjacent research and protocol testing
schemas/               observations, grounding, traces, profiles, and corpus
profiles/              pinned producer-semantics descriptors
corpus/v0.3/           frozen adversarial and control cases
src/                   library, CLI, reports, source profiles, and MCP probe
tests/                 deterministic and independent-client tests
examples/              runnable assessment grounding and trace
evidence/              reproducible corpus results
studies/               preregistered external boundary measurements
```

## External boundary study

External Boundary Study 01 reached its preregistered stopping rule before
primary execution. In both permitted attempts for the first Version 6
commissioning cell, the receipt-bound request audit observed unexpected
`session_store_sql` activity while the instrumented MCP wire contained zero
verified intended `closureprobe_probe` calls. The cell is
`invalid_exhausted`, and the study terminates as **instrumentation-limited**
without scoring a semantic outcome or creating Version 7.

See [the terminal report](studies/vscode-01/TERMINAL-REPORT.md) and the
[privacy-safe terminal record](studies/vscode-01/evidence/public/v6-terminal-record.json).

## Claim boundary

ClosureProbe does not prove that a source is truthful, current, authenticated,
globally exhaustive, or legally sufficient. It checks whether a **supplied
observable trace** preserves a receiver-reconstructed, exact-query, declared-
context negative-evidence chain.

Read [PROFILE.md](PROFILE.md), [CLAIMS.md](CLAIMS.md), and
[LIMITATIONS.md](LIMITATIONS.md) before citing a result. See
[POSITIONING.md](POSITIONING.md) for the research wedge and
[INTEROPERABILITY.md](INTEROPERABILITY.md) for real-client experiments, and
[ERRATA.md](ERRATA.md) for frozen-release corrections.

## Release lineage

- `v0.1.0-rc1`: initial pre-adversarial-review snapshot;
- `v0.1.0-rc2`: page/traversal separation, proposition binding, and downstream
  receiver reconstruction; and
- `v0.1.0-rc3`: receiver-anchored root, declared source-context grounding,
  anchored-state propagation, and producer soundness narrowing.

## License

Apache-2.0. Copyright 2026 Moon Lee.
