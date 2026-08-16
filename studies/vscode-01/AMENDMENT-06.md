# Preregistration Amendment 06: VS Code MCP Discovery Setting Representation Correction

Recorded: 2026-08-16

Timing: after v4 Correction 1 Gate A1/A2, before any v4 commissioning, and
before any primary execution.

## Defect discovered during pre-commissioning launch

An ordinary launch of the named VS Code 1.133.0 specimen reproducibly rewrote
the frozen legacy boolean representation of `chat.mcp.discovery.enabled` from
`false` to an object containing its four discovered-source entries, each set to
`false`.

The study manifest therefore correctly refused to start the MCP server after
each failed pre-commissioning launch. Neither launch produced a raw study
capture, commissioning observation, or primary observation.

This is an observed compatibility behavior of the named specimen. It is not a
claim about VS Code product behavior generally.

## Correction

Correction 2 changes only the representation of
`chat.mcp.discovery.enabled` to the observed byte-stable representation used by
the named specimen. Automatic MCP discovery remains disabled.

The existing harness assertion is updated only to verify this corrected representation.

Correction 2 does not change:

- any semantic scenario;
- any representation path;
- any prompt or opaque condition;
- commissioning or primary run order;
- request or grounding arguments;
- tool identity or semantics;
- the response contract;
- scoring or invalid-run policy;
- extraction design; or
- comparison rules.

The preregistration remains Version 4. Correction 1 remains immutable
historical provenance.

## Public correction anchor

Because frozen study bytes changed after Correction 1 Gate A1/A2, Correction 2
requires a new source commit, annotated correction tag, immutable Gate A1
release, and post-publication Gate A2 anchor before commissioning.

The intended correction tag is:

`study-vscode-01-prereg-v4-corr2`

No commissioning or primary semantic outcome was used to make this correction.
