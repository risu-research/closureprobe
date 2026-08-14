# ClosureProbe Profile v0.1

Status: Release candidate. The normative keywords MUST, MUST NOT, SHOULD, and
MAY are to be interpreted as requirements of this profile, not as additions to
the Model Context Protocol or any upstream API standard.

## 1. Scope

This profile applies only to finite enumeration or search operations for which
a producer-specific profile can identify evidence about:

1. the exact request being assessed;
2. execution status;
3. observed result cardinality;
4. query-relative coverage;
5. continuation or exhaustion; and
6. validation of the extracted signals.

It tests **negative-evidence integrity**: whether a downstream stage asserts a
negative proposition more strongly than the evidence available at that stage
licenses.

It does not decide whether the producer's data matches reality.

## 2. Core invariant

Without new independently validated evidence, a downstream stage MUST NOT
upgrade an unlicensed negative into a licensed negative.

Transport may preserve or weaken closure evidence. It MUST NOT silently turn
partial, continued, denied, failed, mismatched, unbound, or invalid observation
into a supported assertion of absence.

## 3. Exact-query binding

Every observation MUST be bound to a canonical request digest. A digest proves
byte-level identity under the named canonicalization algorithm only. It does not
prove semantic equivalence between different requests.

ClosureProbe v0.1 uses `closureprobe-canonical-json-v1`, which recursively sorts
object keys, preserves array order, rejects non-JSON values, and hashes the UTF-8
serialization with SHA-256.

## 4. Independent axes

An implementation MUST preserve these axes independently:

| Axis | Values |
| --- | --- |
| execution | `success`, `denied`, `failed`, `unknown` |
| cardinality | `zero`, `nonzero`, `unavailable` |
| coverage | `complete`, `partial`, `unknown` |
| continuation | `exhausted`, `present`, `unknown` |
| scope binding | `exact`, `narrower`, `mismatch`, `unbound` |
| validation | `profile_validated`, `declared_only`, `invalid`, `unavailable` |

These axes MUST NOT be collapsed into a single generic success or completeness
field.

## 5. Negative-license rule

A negative proposition is licensed only when all of the following are true:

```text
execution     = success
cardinality   = zero
coverage      = complete
continuation  = exhausted
scopeBinding  = exact
validation    = profile_validated
```

Every other combination is unlicensed for a negative proposition. Nonzero
results are positive observations and are outside the negative branch.

`licensed` is limited to the producer-declared and profile-validated query
scope. It MUST NOT be represented as proof that the proposition is false in the
world.

## 6. Trace conformance

A trace is an ordered list of stages. A stage records its observation, any
explicit claim, the digest of its raw representation when available, and whether
new independently validated evidence was introduced.

A conforming analyzer MUST report separately:

1. **guard-signal loss**: a value that prevented a negative license becomes
   less informative downstream;
2. **dangerous mutation**: a guard value becomes a value favorable to a
   negative license without new evidence;
3. **query-binding mismatch**: an observation digest does not match the trace's
   canonical request digest;
4. **unlicensed negative**: a stage asserts `none` while its local observation
   does not license that claim; and
5. **unsupported upgrade**: a downstream stage becomes negative-licensed while
   the immediately preceding stage was not, without new validated evidence.

The analyzer MUST identify the earliest stage and boundary for each finding.

## 7. Source profiles

Source profiles are conservative. An unrecognized, missing, or ambiguous source
signal MUST yield `unknown`, never `complete` or `exhausted` by default.

Profiles MUST state the exact response and request conditions they support.
Unsupported variants MUST fail closed.

## 8. MCP boundary

MCP `resultType: "complete"` means the protocol request completed and MUST NOT
be interpreted as query-relative coverage or search exhaustion.

Closure data MAY be carried in structured content, text content, or a profile
extension. ClosureProbe records those carriers independently and tests the
client's model-facing projection rather than assuming wire receipt equals model
visibility.

## 9. Receiver authority

Serialized assessments are evidence inputs, not validation authority. A receiver
that relies on an imported trace or report SHOULD reconstruct the observation
from the supplied raw artifact and pinned source profile whenever possible.

## 10. Conformance claim

A conformance claim MUST identify:

- ClosureProbe version;
- corpus version or case identifiers;
- source-profile versions;
- target and target version;
- observable boundaries;
- unobservable boundaries;
- exact commands; and
- raw evidence hashes.

Passing this profile does not establish general MCP conformance, source truth,
legal compliance, safety, or fitness for a particular decision.
