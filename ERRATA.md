# Errata

## rc3 controlled MCP probe: invalid text-only/outputSchema combination

Affected tag: `v0.1.0-rc3`  
Recorded: 2026-08-15  
Scope: controlled MCP probe carrier fixture only

The rc3 `closureprobe_probe` tool always declares `outputSchema`, while its
`text-only` option omits `structuredContent`. Under the tested official MCP
server/client SDK 2.0.0 path, output validation replaces the intended fixture
with a tool error:

```text
Output validation error: Tool closureprobe_probe has an output schema but no
structured content was provided
```

This behavior is consistent with MCP 2026-07-28: when a tool declares an output
schema, the server must provide conforming structured results.

The frozen tag is not rewritten. The semantic corpus, source profiles, oracle,
trace analysis, and dual/structured-only probe payloads are unaffected. The rc3
integration test established the presence of a text content block but did not
assert that it contained the intended fixture or that `isError` was false.

External Boundary Study 01 contains a reproducible preflight record and uses a
preregistered valid text-only study adapter without `outputSchema`. That adapter
is a study instrument and does not retroactively alter rc3.

