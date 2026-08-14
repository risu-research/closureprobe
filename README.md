# ClosureProbe

**Did your agent turn UNKNOWN into NONE?**

ClosureProbe is an executable conformance system for **Negative Evidence
Integrity** in agentic toolchains. It tests whether incomplete, continued,
denied, failed, or scope-mismatched empty results become an unsupported claim
that nothing exists while crossing API, adapter, MCP, client, and model-facing
boundaries.

The narrow technical object is an empty enumeration or search result. The larger
system question is whether an autonomous system has earned the right to stop
searching, assert absence, and act on that assertion.

## Core rule

A negative claim is licensed only when the exact query completed successfully,
returned zero results, completely covered its declared scope, exhausted all
continuations, and passed the pinned source profile.

Everything else remains unknown or otherwise non-negative.

## What it produces

- source-profile observations;
- deterministic negative-license decisions;
- guard-signal loss and dangerous-mutation findings;
- first unlicensed-negative boundary localization;
- JSON and self-contained HTML evidence reports; and
- an MCP probe server for controlled differential results.

## Quick start

```bash
npm install
npm run quality
node dist/src/cli.js corpus verify corpus/v0.1/cases.json
node dist/src/cli.js assess \
  --profile google-drive-files-list \
  --request examples/drive/request.json \
  --response examples/drive/continued-zero-response.json
```

Run the MCP probe server:

```bash
node dist/src/mcp-server.js
```

The continued Drive example returns `negativeLicense: "not_licensed"` even
though the current page is empty, because `nextPageToken` proves the traversal
is not exhausted.

## Frozen evidence

The release-candidate corpus contains 40 deterministic cases: 32
source-profile observations and 8 cross-boundary traces. It includes positive
controls and legitimate evidence upgrades, not only expected failures. Run
`npm run evidence` to regenerate both the machine-readable result and the
self-contained HTML report.

Six pinned profiles exercise genuinely different producer semantics:

| Profile | Closure-sensitive signal |
| --- | --- |
| Google Drive `files.list` | `incompleteSearch`, `nextPageToken`, fields projection |
| DynamoDB `Query` | `LastEvaluatedKey` |
| Elasticsearch search | timeout, shard success, exact total relation |
| GraphQL Relay connection | errors, `hasNextPage` |
| Microsoft Graph delta | `@odata.nextLink`, `@odata.deltaLink` |
| Generic enumeration | explicit controlled contract |

See [INTEROPERABILITY.md](INTEROPERABILITY.md) for testing real MCP clients and
[IMPACT.md](IMPACT.md) for the consequential-decision framing, and
[ROADMAP.md](ROADMAP.md) for the later enforcement boundary.

## Project structure

```text
PROFILE.md             normative bounded profile
schemas/               language-neutral contracts
profiles/              pinned source-profile descriptors
corpus/v0.1/           frozen differential cases
src/                   library, CLI, reports, and MCP probe
tests/                 deterministic implementation tests
examples/              runnable assessments and trace
evidence/              regenerated corpus results
```

## Relationship to other RISU work

ClosureProbe is not an omnibus integration of earlier projects. It contributes a
new primitive: query-relative closure integrity. Its profile and oracle are
designed to become inputs to a later runtime `ClosureGate`, where unsupported
negative premises can block, retry, escalate, or preserve recourse instead of
silently authorizing an action.

See [PROFILE.md](PROFILE.md), [CLAIMS.md](CLAIMS.md), and
[LIMITATIONS.md](LIMITATIONS.md) before citing results.

## License

Apache-2.0. Copyright 2026 Moon Lee.
