# Claim Boundary

## Supported claim

ClosureProbe is an executable conformance system that determines whether the
query-relative evidence available at each observed toolchain stage licenses an
assertion of absence, and localizes the earliest observed boundary where guard
signals are lost or a negative claim becomes unsupported.

## What is new in this artifact

The artifact combines, in one bounded executable system:

- conservative source-specific extraction of coverage and exhaustion signals;
- exact-request binding;
- a deterministic negative-license oracle;
- differential traces across source, adapter, MCP, client, model projection, and
  claim stages; and
- first-loss and first-unlicensed-claim localization.

The repository does not claim to invent query completeness, closed-world
reasoning, abstention, provenance, authenticated denial of existence, or the
general problem of semantic laundering.

## Falsifiable result

For a named trace and its pinned artifacts, ClosureProbe either derives the
expected observation and findings or it does not. All headline counts MUST be
regenerated from the frozen corpus by the published CLI.
