# Limitations

ClosureProbe v0.3:

- analyzes a supplied normalized trace; it does not automatically intercept
  arbitrary APIs, MCP clients, prompts, models, or hidden transforms;
- cannot turn an unobserved boundary into evidence of preservation;
- reconstructs supplied canonical JSON evidence but does not authenticate its
  producer, capture time, transport, or chain of custody;
- binds a declared producer instance, authority context, and proposition scope,
  but does not prove that those declarations match the producer's real access
  controls or the world;
- relies on the trace author's mapping from a real claim into subject,
  predicate, and scope;
- does not infer semantic equivalence between different API or natural-language
  queries;
- treats closure as exact-request and exact-declared-scope relative;
- supports only producer variants stated in pinned descriptors;
- supports Relay forward root connections, not backward or mixed pagination;
- supports Elasticsearch local-cluster exact-total searches, not cross-cluster
  search;
- treats a Microsoft Graph `deltaLink` as the end of one supplied delta round,
  not proof of permanent absence;
- does not certify legal compliance, sanctions clearance, eligibility,
  vulnerability absence, medical correctness, or any consequential outcome;
- does not replace signatures, authenticated logs, cryptographic query proofs,
  or byte-level evidence retention; and
- uses no LLM judge in its normative conformance result.

Black-box experiments must name the target version, model, repetitions, capture
method, normalization decisions, and visibility limits.
