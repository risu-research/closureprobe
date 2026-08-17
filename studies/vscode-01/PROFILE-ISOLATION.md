# VS Code Profile Isolation

Use a dedicated Empty Profile named `ClosureProbe VSCode 01`. An Empty Profile
starts without user settings, extensions, snippets, or other customizations.
Install or enable only the Copilot components required for the selected harness.

Launch the isolated workspace with that profile:

```bash
code studies/vscode-01/specimen-workspace --profile "ClosureProbe VSCode 01"
```

Before commissioning and before every experimental attempt:

1. disable Settings Sync for the study profile;
2. keep extension auto-update disabled through the full study;
3. select only the tracked workspace custom agent `ClosureProbe Study`;
4. verify its frontmatter fixes model `MAI-Code-1.1-Flash`, tools
   `closureprobeStudy/*`, and `agents: []`, with no body instructions;
5. verify the visible model configuration is exactly `Thinking Effort: Medium`;
6. verify workspace settings explicitly set
   `github.copilot.chat.agent.backgroundTodoAgent.enabled` to `false`;
7. verify workspace settings disable AGENTS.md, CLAUDE.md, instruction files,
   organization instructions, skills, plugins, memory, browser tools, session
   sync, and automatic MCP discovery;
8. confirm no chat context or file attachment is present;
9. stop the fixed MCP server, activate the assigned opaque condition, and
   restart only that server;
10. confirm the custom-agent tool surface leaves only `closureprobe_probe`
    enabled; and
11. inspect the receipt-bound model request, system-prompt sidecar, and
    tool-definition sidecar for unexpected customization or capability.

The two memory settings in the workspace are current documented VS Code
controls, but they do not prove the absence of hidden account/backend state.
Record any visible account or organization policy separately. The decisive
study control is whether memory-derived content or a memory tool appears in the
selected model request; either occurrence invalidates the run.

Capture installed extension IDs and versions:

```bash
code --profile "ClosureProbe VSCode 01" --list-extensions --show-versions
```

Save the sorted output privately and record its SHA-256 in the specimen. Export
the profile to a local `.code-profile` file and record that file's hash. Record
the exact profile name, whether the profile began Empty, any organization policy
the profile could not override, and every enabled built-in or extension tool.

The sealed request evidence is the final contamination check. It must contain
exactly one model-facing ClosureProbe tool, one study tool call, no
BackgroundTodoAgent housekeeping, and no subagent. If it contains a semantic
condition map, custom instruction, memory-derived content, unrelated workspace
context, active condition value, or additional executable capability, the run
is invalid even if the profile checklist appeared clean.

Fixed client-generated Copilot Agent prompt assembly is reviewed only under the
narrow harness-envelope rule in `PREREGISTRATION.md`. Exact hashes and structure
must agree across all three Version 5 commissioning paths, and manual review
must confirm that the content is neutral and contains no prohibited category.
Equality alone does not whitelist the content.

Gate B stores the accepted privacy-safe comparison values as well as their
aggregate digest. The primary normalizer derives the request audit from the
verified seal receipt, requires the completed manual review, and rejects any
model, system-prompt, input-message byte/structure, user-request, or tool-name
surface drift from that exact freeze.
