# Preregistration Amendment 01: Valid Text Carrier

Recorded: 2026-08-15

Timing: after harness construction, before any external VS Code/Copilot run or
outcome was observed.

Implementation status: the preflight finding remains unchanged. The initial
three-name adapter described below was superseded by the blinded,
single-tool-name adapter in `AMENDMENT-02.md`, then by the fixed single-server
configuration in `AMENDMENT-03.md`, still before any external run.

## Preflight finding

The rc3 MCP tool declares an `outputSchema` for every call while also exposing a
`text-only` carrier option. The official MCP server SDK requires a result with a
declared output schema to provide matching `structuredContent`. It therefore
replaces the intended text-only fixture with an error result:

```text
Output validation error: Tool closureprobe_probe has an output schema but no
structured content was provided
```

The original rc3 integration test checked that a text content block existed but
did not assert that it contained the intended controlled payload. The raw study
tap exposed the mismatch before external data collection.

The finding is independently replayable with the official MCP client package:

```bash
node studies/vscode-01/bin/preflight-rc3-carriers.mjs --check
```

Its minimal machine-readable record is
`evidence/public/preflight-rc3-carrier-validation.json`. It shows the intended
payload for `dual` and `structured-only`, and an `isError: true` replacement for
`text-only`. This is a ClosureProbe rc3 server/SDK preflight finding, not a VS
Code client finding.

## Amendment

The rc3 tag and source are not changed. The initial external-study correction
used a local adapter importing the frozen rc3 payload and oracle implementation.
It registered three independent single-tool server processes:

- `closureprobe_probe_dual`, with `outputSchema`;
- `closureprobe_probe_structured_only`, with `outputSchema`; and
- `closureprobe_probe_text_only`, without `outputSchema`.

Each tool accepts the same scenario, request, and grounding. Its carrier field
is fixed by JSON Schema. Separate processes prevent cross-cell transcript
coupling and make server restarts observable. The stdio tap verifies the adapter
artifact hash and the verifier reconstructs the expected result through the
frozen rc3 runtime.

## Consequence

Carrier is necessarily coupled to tool identity, and text-only is necessarily
coupled to absence of an output schema. The study can measure end-to-end
representation behavior, but it must not attribute a difference exclusively to
the result carrier. This limitation is reported in every comparison.

No primary endpoint, scenario, request, grounding, escalation threshold, or
publication rule changed.
