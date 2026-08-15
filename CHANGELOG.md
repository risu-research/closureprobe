# Changelog

## 0.1.0-rc3 — 2026-08-15

Final planned internal semantic-hardening release.

- makes receiver-reconstructed `rootEvidence` mandatory for every trace;
- adds machine-readable producer instance, authority, and proposition-scope
  grounding with independent canonical bindings;
- upgrades proposition binding to include source context;
- propagates explicit `evidenceAnchored` state across trace stages;
- detects unanchored roots, grounding drift, and source-profile substitution;
- narrows Elasticsearch to explicitly grounded local-cluster searches and
  rejects cross-cluster results;
- rejects empty, relative, non-HTTPS, and cross-origin Microsoft Graph traversal
  links; and
- expands frozen evidence to 50 adversarial and control cases.

## 0.1.0-rc2 — 2026-08-14

Adversarial hardening release. This candidate intentionally changes the rc1
trace and observation contracts.

- distinguishes complete root traversals from final continuation segments;
- validates aggregate pagination chains and cardinality for Drive, DynamoDB,
  and Microsoft Graph delta;
- narrows Relay support to parsed forward root connections;
- adds Elasticsearch exact-total, shard, timeout, and early-termination guards;
- binds `none` to an explicit negative proposition;
- replaces self-declared evidence upgrades with receiver reconstruction from raw
  request/response artifacts;
- adds malformed-source fail-closed handling; and
- expands frozen evidence to 45 adversarial and control cases.

## 0.1.0-rc1 — 2026-08-14

Pre-adversarial-review snapshot with the initial six profiles, deterministic
oracle, trace localization, CLI, evidence reports, and controlled MCP probe.
