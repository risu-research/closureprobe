# ClosureProbe

**Did your agent turn UNKNOWN into NONE?**

ClosureProbe is an executable falsification and conformance system for
**Negative Evidence Integrity** in agentic toolchains. It tests whether an
empty page, incomplete traversal, denied search, failed shard, narrowed scope,
or lost guard signal is silently upgraded into the claim that nothing exists.

The technical object is deliberately narrow: a query-relative assertion of
absence. The larger question is consequential: **when has a system earned the
right to stop searching, assert none, and act on that premise?**

## The false-zero firewall

A licensed negative requires one coherent evidence chain:

1. the exact root request is cryptographically bound;
2. the observed evidence unit is either a complete root response or a validated
   root-to-final traversal—not merely a final page;
3. execution succeeded, cardinality is zero, coverage is complete,
   continuation is exhausted, scope is exact, and the pinned profile validates
   every required signal; and
4. any `none` claim is bound to an explicit subject, predicate, and scope.

If a downstream stage strengthens those facts, the receiver must reconstruct
the new observation from supplied raw request/response evidence and the pinned
profile. A sender's assertion that evidence was validated is not authority.

## What the product does

- converts supported source responses or traversal bundles into conservative,
  query-bound observations;
- makes one deterministic negative-license decision;
- distinguishes a page segment from a complete query traversal;
- rejects naked or proposition-shifted `none` claims;
- localizes guard loss, dangerous mutation, request mismatch, forged evidence,
  and the first unlicensed negative across supplied observable stages;
- emits machine-readable and self-contained HTML evidence; and
- runs as an MCP probe server for controlled client experiments.

ClosureProbe does **not** automatically intercept arbitrary clients. Operators
capture the boundaries they can actually observe and normalize them into the
published trace schema. Hidden boundaries stay explicitly unobserved; they do
not become silent passes.

## Quick start

```bash
npm install
npm run quality
node dist/src/cli.js corpus verify corpus/v0.2/cases.json
node dist/src/cli.js assess \
  --profile google-drive-files-list \
  --request examples/drive/request.json \
  --response examples/drive/continued-zero-response.json
```

Run the controlled MCP probe:

```bash
node dist/src/mcp-server.js
```

The continued Drive example is not licensed even though its current page is
empty. A `nextPageToken` proves the root traversal is unfinished. Conversely, a
validated multi-page bundle counts every page, so an earlier hit cannot vanish
behind an empty final page.

## Frozen adversarial evidence

The rc2 corpus contains **45 deterministic cases**: 35 source-profile
observations and 10 cross-boundary traces. It contains both attack cases and
positive controls, including a legitimate receiver-revalidated evidence
upgrade. `npm run evidence` regenerates the JSON and self-contained HTML report.

| Profile | Evidence boundary enforced |
| --- | --- |
| Google Drive `files.list` | root vs `pageToken` segment; exact token-linked aggregate; `incompleteSearch` |
| DynamoDB `Query` | root vs `ExclusiveStartKey` segment; exact key-linked aggregate |
| Elasticsearch search | exact total, nonempty successful shard set, timeout and early-termination guards |
| GraphQL Relay | parsed forward root query, `first`/`after` direction, `hasNextPage`, GraphQL errors |
| Microsoft Graph delta | complete root-to-`deltaLink` bundle; byte-exact `nextLink` chain; aggregate count |
| Generic enumeration | explicit controlled contract, including traversal status |

## Project structure

```text
PROFILE.md             normative bounded profile
schemas/               language-neutral observation, trace, and corpus contracts
profiles/              pinned producer-semantics descriptors
corpus/v0.2/           frozen adversarial and control cases
src/                   library, CLI, reports, source profiles, and MCP probe
tests/                 deterministic implementation and independent-client tests
examples/              runnable assessments and trace
evidence/              reproducible corpus results
```

## Claim boundary

This is not proof that a source is truthful, current, globally exhaustive, or
legally sufficient. It is an executable check that the supplied observable
trace did not claim more absence than its exact, profile-validated evidence
licensed. Read [PROFILE.md](PROFILE.md), [CLAIMS.md](CLAIMS.md), and
[LIMITATIONS.md](LIMITATIONS.md) before citing a result.

[INTEROPERABILITY.md](INTEROPERABILITY.md) defines real-client experiments.
[IMPACT.md](IMPACT.md) explains why false zero is an authorization and
procedural-integrity problem. [ROADMAP.md](ROADMAP.md) leaves the next project to
the evidence rather than pre-committing to a mechanically assembled sequel.

## Release lineage

`v0.1.0-rc1` is preserved as the pre-adversarial-review snapshot. rc2 changes
the contract incompatibly where correctness required it: traversal identity,
proposition-bound claims, receiver-revalidated evidence, and narrower source
profiles.

## License

Apache-2.0. Copyright 2026 Moon Lee.
