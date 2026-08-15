# Security Policy

ClosureProbe processes untrusted JSON artifacts. Reports escape all rendered
values and never execute artifact content. Source profiles are executable code
and MUST be reviewed before installation.

Canonical JSON digests detect mutation under the named canonicalization rule;
they do not authenticate producer identity, transport, capture time, or raw HTTP
bytes. Use authenticated logs or signatures when those properties matter.

Do not place credentials, access tokens, private records, or proprietary model
prompts in public evidence bundles. Prefer bounded synthetic fixtures or
redacted, hash-bound artifacts.

Security reports may be submitted through the repository's private vulnerability
reporting channel when enabled.
