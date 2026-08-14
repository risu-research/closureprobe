# Why Negative Evidence Integrity Matters

An empty result is often treated as if it were a fact about the world. In an
agentic system it can instead be a fact about one failed, truncated,
unauthorized, projected, or unfinished operation. The dangerous transition is
not merely a bad answer. It is an **authorization bug**: the system uses an
unearned negative premise to justify stopping or acting.

Examples include a records search that silently omitted repositories, a
benefits or administrative workflow that could not access part of a file, a
sanctions screen with a continued page, a vulnerability scan with failed
targets, or a literature search with a narrowed corpus. ClosureProbe does not
decide those domains' substantive or legal standards. It tests the narrower
technical precondition they share: whether the exact query's negative evidence
survived the computation that relied on it.

That is why v0.1 has both halves:

- producer-specific profiles establish what completion means at the source;
- cross-boundary traces establish whether adapters, protocols, clients, and
  model projections preserved or strengthened that evidence.

A generic `success=true`, a 200 response, or protocol completion cannot replace
either half. The result is small enough to test deterministically but large
enough to sit at a consequential decision boundary.

The immediate public artifact is measurement and localization. The leverage is
that the same receiver-revalidated assessment can later feed a runtime gate:
continue, retry, preserve unknown, request authority, escalate, or block an
absence-dependent action. See [ROADMAP.md](ROADMAP.md).
