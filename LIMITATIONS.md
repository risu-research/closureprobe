# Limitations

ClosureProbe v0.2:

- analyzes a supplied normalized trace; it does not automatically instrument or
  intercept arbitrary APIs, MCP clients, prompts, models, or hidden transforms;
- cannot turn an unobserved boundary into evidence of preservation;
- validates consistency with producer semantics, not that a source is truthful,
  current, authorized, globally exhaustive, or correctly configured;
- hashes canonical artifacts for identity and mutation detection, not source
  authenticity, chronology, or non-repudiation;
- relies on the trace author's mapping from a real claim to explicit subject,
  predicate, and scope; the proposition digest cannot validate that mapping;
- does not infer semantic equivalence between different API or natural-language
  queries;
- treats closure as exact-request and exact-scope relative: a caller's visible
  corpus may be narrower than the world;
- supports only the producer variants stated in the pinned descriptors;
- supports Relay forward root connections, not backward or mixed pagination;
- treats a Microsoft Graph `deltaLink` as the end of one supplied delta round,
  not proof of permanent absence;
- revalidates introduced evidence against installed profile code and supplied
  bytes, but does not authenticate those bytes against the live producer;
- does not certify legal compliance, sanctions clearance, eligibility,
  vulnerability absence, medical correctness, or any consequential outcome;
- does not replace cryptographic query-verification or authenticated logs; and
- uses no LLM judge in its normative conformance result.

Black-box model-visible experiments are empirical observations. They must name
the target version, model, repetitions, capture method, and visibility limits.
