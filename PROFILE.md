# ClosureProbe Profile v0.3

Status: trust-root-hardened release candidate. The normative keywords MUST,
MUST NOT, SHOULD, and MAY are requirements of this profile, not additions to
MCP or any upstream API standard.

## 1. Scope

This profile applies to a supplied, normalized trace of finite enumeration or
search operations for which a pinned producer profile can reconstruct:

1. the exact request and response or traversal evidence;
2. the declared producer instance, authority context, and proposition scope;
3. execution, cardinality, coverage, continuation, and traversal status; and
4. the negative proposition, if one is asserted.

It tests whether an observed downstream stage asserts absence more strongly
than its anchored evidence licenses. It does not determine whether producer data
matches reality.

## 2. Core invariant

An evidence chain MUST begin with receiver-reconstructed root evidence. Without
new receiver-reconstructed evidence, a downstream stage MUST NOT strengthen an
unlicensed negative, change the source profile, or move the observation to
another source context or proposition scope.

Transport may preserve or weaken evidence. It MUST NOT silently turn partial,
continued, segment-only, denied, failed, mismatched, unbound, unanchored, or
invalid observation into an admissible assertion of absence.

## 3. Receiver-anchored root

Every trace MUST contain `rootEvidence` and at least one stage. The receiver
MUST:

1. select the installed profile by exact ID and version;
2. compare the evidence request with the trace root request;
3. compare the evidence grounding with the trace source context and proposition
   scope;
4. recompute canonical JSON request and response digests;
5. reconstruct the first observation with the installed profile; and
6. require canonical equality with the first stage observation.

Failure of any step yields `unanchored_root_evidence`. A locally green
`profile_validated` string cannot substitute for this reconstruction, and a
`none` claim on an unanchored stage is unlicensed.

## 4. Four independent bindings

### 4.1 Exact request

Every observation carries the canonical digest of the exact root request.
`closureprobe-canonical-json-v1` recursively sorts object keys, preserves array
order, rejects non-JSON values, serializes as UTF-8 JSON, and hashes with
SHA-256. It establishes canonical JSON identity, not byte-stream identity or
semantic equivalence between different requests.

### 4.2 Declared source grounding

A grounding object contains:

- `sourceContext.producer`;
- a nonempty machine-readable `sourceContext.instance`;
- a nonempty machine-readable `sourceContext.authority`; and
- a nonempty `propositionScope` exactly equal to the trace proposition's scope.

`closureprobe-grounding-v1` hashes source context and scope independently.
Every stage MUST match both digests. This prevents context or scope substitution
inside the supplied chain. It does not prove that the declared identity was
authenticated by the producer or that its real authorization universe was
described correctly.

### 4.3 Traversal

Every observation distinguishes the root request from the observed segment:

| Status | Meaning |
| --- | --- |
| `single_page_complete` | an initial/root response closes the supported query |
| `aggregate_complete` | a validated chain begins at the exact root and reaches the producer's final signal |
| `continued` | the captured root traversal still has a continuation |
| `segment_only` | a continuation response lacks validated prior pages |
| `unknown` | query-level traversal identity cannot be established |

A locally final segment MUST NOT establish root-query closure. An aggregate
MUST preserve the root request, validate every link, and derive cardinality
across every supplied page.

### 4.4 Context-bound proposition

A trace declares one negative proposition with explicit `subject`, `predicate`,
and `scope`. A stage asserting `none` MUST carry a
`closureprobe-proposition-v2` digest of the exact proposition and source context.
Missing or mismatched binding is unlicensed even if the local observation would
otherwise be licensed.

## 5. Independent evidence axes

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
length, context identity, and source-profile validation cannot substitute for
one another.

## 6. Producer-local negative license

An observation is locally licensed only when every predicate is true:

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

Local license alone does not authorize a trace claim. A trace-level `none` also
requires matching request, grounding and proposition bindings plus
`evidenceAnchored=true`.

## 7. Anchor propagation

The first stage is anchored only by successful `rootEvidence` reconstruction.
A later stage is anchored when either:

1. it introduces supplied evidence that the receiver reconstructs for the same
   root request, source context, and proposition scope; or
2. the immediately preceding stage was anchored and the transition introduces
   no request mismatch, grounding mismatch, unverified profile substitution, or
   favorable guard mutation.

Guard loss may preserve ancestry but weakens local license. A favorable mutation
without reconstructed evidence breaks ancestry. Optional `rawDigest` and
`artifactDigest` fields are capture metadata and never authorize a stronger
state without corresponding supplied request/response material that the
receiver can reconstruct.

## 8. Required trace findings

A conforming analyzer reports independently:

1. `unanchored_root_evidence`;
2. `grounding_binding_mismatch`;
3. `profile_binding_change` without reconstructed evidence;
4. `guard_signal_loss`;
5. `dangerous_mutation`;
6. `unsupported_upgrade`;
7. `query_binding_mismatch`;
8. `claim_binding_missing` or `claim_binding_mismatch`;
9. `unverified_evidence_introduction`; and
10. `unlicensed_negative`.

The analyzer MUST identify the earliest observed stage or boundary. A hidden or
omitted stage is an observation limitation, never an implicit pass.

## 9. Source-profile discipline

Unrecognized, missing, malformed, or ambiguous source signals MUST fail closed.
Profiles MUST declare their grounding producer and supported evidence units.

v0.3 distinguishes Drive `pageToken`, DynamoDB `ExclusiveStartKey`, Relay
`after`, and Graph `@odata.nextLink` segments from complete root traversals.
Relay is forward-only. Microsoft Graph requires a complete supplied round and
safe absolute traversal URLs. Elasticsearch is local-cluster only and rejects
`_clusters`, remote index targets, timeout, failed shards, lower-bound totals,
zero resolved shards, and early termination.

## 10. Canonical evidence, artifacts, and authenticity

Request and response digests in evidence objects identify canonical JSON, not
raw HTTP bytes. Whitespace and object-key order are intentionally normalized.
An operator MAY separately retain byte-level artifact hashes, authenticated
logs, signatures, timestamps, or transport records. ClosureProbe does not
manufacture those authenticity properties.

## 11. MCP boundary

MCP protocol-result finality MUST NOT be interpreted as query-relative coverage
or exhaustion. Closure evidence may be carried in structured content or text,
but a conformance result concerns what survived each supplied observable
boundary, not merely what existed on the wire.

## 12. Conformance claim

A published result MUST identify ClosureProbe, corpus, and profile versions;
target and target version; exact commands; case IDs; source-grounding method;
observable and hidden boundaries; repetition policy; and canonical and any
byte-level artifact hashes.

Passing does not establish general MCP conformance, authenticated source truth,
legal compliance, safety, or fitness for a consequential decision.
