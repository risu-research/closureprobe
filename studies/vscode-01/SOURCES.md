# Official sources

Accessed: 2026-08-15

Only primary product documentation and the normative protocol specification are
used for study-design claims.

- [VS Code: Add and manage MCP servers](https://code.visualstudio.com/docs/agent-customization/mcp-servers) — workspace `.vscode/mcp.json`, server trust, tool toggles, enable/disable controls, and MCP output logs.
- [VS Code: MCP configuration reference](https://code.visualstudio.com/docs/agents/reference/mcp-configuration) — local stdio `command`, `args`, `cwd`, and environment configuration.
- [VS Code: Debug chat interactions](https://code.visualstudio.com/docs/agents/agent-troubleshooting/chat-debug-view) — Agent Debug tool/LLM events, Chat Debug raw request/context/tool payloads, and OTLP JSON export/import. The page labels Agent Debug as Preview.
- [VS Code: AI settings reference](https://code.visualstudio.com/docs/agents/reference/ai-settings) — debug logging and the instruction, skill, plugin, memory, browser-tool, and MCP-discovery controls used by the isolated workspace.
- [VS Code: Profiles](https://code.visualstudio.com/docs/configure/profiles) — Empty Profiles, local profile export, and launching a named profile with `--profile`.
- [VS Code: Command Line Interface](https://code.visualstudio.com/docs/configure/command-line) — listing extension IDs and versions for a named profile.
- [VS Code 1.112 release notes](https://code.visualstudio.com/updates/v1_112) — introduction of Agent Debug log export/import.
- [VS Code: Monitor agent usage with OpenTelemetry](https://code.visualstudio.com/docs/agents/guides/monitoring-agents) — OpenTelemetry event/export semantics and privacy-sensitive observability data.
- [MCP specification 2026-07-28: Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools) — `structuredContent`, `outputSchema`, tool-result errors, and the requirement that a server declaring an output schema return conforming structured results.
- [GitHub: Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) — protection against changing a published release's assets or associated tag.
- [GitHub: REST API endpoints for releases](https://docs.github.com/en/rest/releases/releases) — post-publication `published_at`, immutable status, release ID, and asset digest metadata used by the non-self-referential anchor record.
- [GitHub CLI: `gh release verify-asset`](https://cli.github.com/manual/gh_release_verify-asset) — local verification of a manually uploaded release asset against GitHub's release attestation.
- [GitHub: About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) — automatic source ZIP/tarball links versus manually attached release assets.
- [npm: `npm ci`](https://docs.npmjs.com/cli/v11/commands/npm-ci/) — lockfile-strict clean installation used by the reproduction commands.
- [GitHub: About Copilot Memory](https://docs.github.com/en/copilot/concepts/agents/copilot-memory) — account-level memory scope and feature availability; used to limit claims beyond the client-visible VS Code controls.

These sources establish available observability surfaces and protocol rules.
They do not establish that any boundary preserves ClosureProbe guards; that is
the empirical question.
