# Contributing

ClosureProbe welcomes narrowly reviewable contributions in three forms:

1. a producer profile backed by authoritative documentation and adversarial
   positive and negative controls;
2. a target trace that identifies every observable and hidden boundary; or
3. an adapter that reconstructs observations from raw, hash-bound artifacts.

Every new source profile MUST fail closed on missing and unsupported signals,
bind the exact request, include a frozen corpus slice, and state what the source
cannot prove. A target result MUST follow the publication rule in
[INTEROPERABILITY.md](INTEROPERABILITY.md). Generated counts or compatibility
claims must never be hand-edited into documentation.

Before submitting a change, run:

```bash
npm run quality
npm run security:audit
```

Do not include live credentials, private records, proprietary prompts, or
unredacted consequential-decision data.
