# ClosureProbe Profile v0.2

Status: adversarially hardened release candidate. The normative keywords MUST,
MUST NOT, SHOULD, and MAY are requirements of this profile, not additions to
MCP or any upstream API standard.

## 1. Scope

This profile applies to a supplied, normalized trace of finite enumeration or
search operations for which a pinned producer profile can validate:

1. the exact root request;
2. the evidence unit—root response, traversal bundle, or page segment;
3. execution and observed cardinality;
4. query-relative coverage and continuation;
5. declared scope; and
6. the negative proposition, if one is asserted.

It tests whether an observed downstream stage asserts absence more strongly
than the evidence at that stage licenses. It does not determine whether the
producer's data matches reality.

## 2. Core invariant

Without new **receiver-revalidated** evidence, a downstream stage MUST NOT
upgrade an unlicensed negative into a licensed negative.

Transport may preserve or weaken evidence. It MUST NOT silently turn partial,
continued, segment-only, denied, failed, mismatched, unbound, or invalid
observation into a supported assertion of absence.

## 3. Three independent bindings

### 3.1 Exact request

Every observation MUST carry the canonical digest of the exact root request.
`closureprobe-canonical-json-v1` recursively sorts object keys, preserves array
order, rejects non-JSON values, serializes as UTF-8 JSON, and hashes with
SHA-256. This establishes canonical identity, not semantic equivalence between
different requests.

### 3.2 Traversal

Every observation MUST distinguish the root request from the currently observed
segment and MUST classify the evidence unit as one of:

| Status | Meaning |
| --- | --- |
| `single_page_complete` | an initial/root response closes the supported query |
| `aggregate_complete` | a validated chain begins at the exact root and closes at the final traversal signal |
| `continued` | the captured root traversal still has a continuation |
| `segment_only` | the response is for a continuation request without validated prior pages |
| `unknown` | query-level traversal identity cannot be established |

A locally final `segment_only` response MUST NOT be treated as root-query
closure. An aggregate MUST preserve the root request, validate every page link,
and derive cardinality across all pages.

### 3.3 Proposition

A trace MUST declare one negative proposition with explicit `subject`,
`predicate`, and `scope`. A stage that asserts `none` MUST carry a
`closureprobe-proposition-v1` digest of that exact proposition. A missing or
mismatched binding is an unlicensed negative even when the local observation
would otherwise be licensed.

The proposition mapping is supplied by the trace author. Hashing detects
mutation; it does not prove that a natural-language claim was normalized
correctly.

Optional `rawDigest` and `artifactDigest` fields are capture metadata. Without
the corresponding bytes they do not authorize a stronger observation or claim.

## 4. Independent evidence axes

| Axis | Values |
| --- | --- |
| execution | `success`, `denied`, `failed`, `unknown` |
| cardinality | `zero`, `nonzero`, `unavailable` |
| coverage | `complete`, `partial`, `unknown` |
| continuation | `exhausted`, `present`, `unknown` |
| traversal | `single_page_complete`, `aggregate_complete`, `continued`, `segment_only`, `unknown` |
| scope binding | `exact`, `narrower`, `mismatch`, `unbound` |
| validation | `profile_validated`, `declared_only`, `invalid`, `unavailable` |

These axes MUST remain independent. Protocol completion, HTTP success, page
length, and source-profile validation MUST NOT substitute for one another.

## 5. Negative-license rule

A negative candidate is licensed only when every predicate is true:

```text
execution      = success
cardinality    = zero
coverage       = complete
continuation   = exhausted
traversal      = single_page_complete OR aggregate_complete
query digest   = traversal root digest
scopeBinding   = exact
queryBinding   = exact
validation     = profile_validated
```

Any other combination is not licensed. A nonzero observation is a positive
branch and is not evaluated as a negative candidate.

`licensed` means only that the exact producer-declared, profile-validated query
returned zero over the validated evidence unit and scope. It MUST NOT be
represented as global, permanent, or metaphysical nonexistence.

## 6. Receiver-revalidated evidence

A stage MAY introduce raw evidence. To authorize a stronger downstream state,
the receiver MUST:

1. recompute the supplied request and response digests;
2. load the exact installed profile ID and version;
3. reconstruct the observation from the supplied raw request and response; and
4. compare the reconstruction canonically with the stage observation.

A boolean self-attestation or serialized assessment alone MUST NOT suppress a
dangerous-mutation or unsupported-upgrade finding. Revalidation proves only
consistency with the pinned profile and supplied bytes; it does not authenticate
their source.

## 7. Trace findings

A conforming analyzer MUST report independently:

1. `guard_signal_loss` when an explicit blocker becomes unknown;
2. `dangerous_mutation` when an unfavorable guard becomes favorable without
   receiver-revalidated evidence;
3. `unsupported_upgrade` when negative-license state strengthens without such
   evidence;
4. `query_binding_mismatch` when a stage is bound to another root request;
5. `claim_binding_missing` or `claim_binding_mismatch` for a naked or shifted
   `none`;
6. `unverified_evidence_introduction` when reconstruction fails; and
7. `unlicensed_negative` when the stage's exact query, proposition, and local
   evidence do not jointly license its `none` claim.

The analyzer MUST identify the earliest observed stage or boundary. A missing
stage is an observation limitation, never an implicit pass.

## 8. Source-profile discipline

Source profiles MUST state their supported operation and evidence units.
Unrecognized, missing, malformed, or ambiguous source signals MUST fail closed.

Profile v0.2 specifically distinguishes Drive `pageToken`, DynamoDB
`ExclusiveStartKey`, Relay `after`, and Graph `@odata.nextLink` segments from a
complete root traversal. Relay support is forward-only. Microsoft Graph delta
support requires the entire supplied root-to-`@odata.deltaLink` round.
Elasticsearch support requires an exact total over a nonempty, fully successful
shard set and rejects timeout or early-termination conditions.

## 9. MCP boundary

MCP `resultType: "complete"` denotes protocol-result finality and MUST NOT be
interpreted as query-relative search coverage or exhaustion. Closure evidence
may be carried in structured content or text, but a conformance result concerns
what survived each supplied observable boundary, not merely what existed on the
wire.

## 10. Conformance claim

A published result MUST identify ClosureProbe, corpus, and source-profile
versions; target and target version; exact commands; case IDs; observable and
hidden boundaries; repetition policy where applicable; and raw artifact hashes.

Passing this profile does not establish general MCP conformance, source truth,
legal compliance, safety, or fitness for a consequential decision.
