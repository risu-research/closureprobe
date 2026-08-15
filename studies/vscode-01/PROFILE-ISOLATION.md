# VS Code Profile Isolation

Use a dedicated Empty Profile named `ClosureProbe VSCode 01`. An Empty Profile
starts without user settings, extensions, snippets, or other customizations.
Install or enable only the Copilot components required for the selected harness.

Launch the isolated workspace with that profile:

```bash
code studies/vscode-01/specimen-workspace --profile "ClosureProbe VSCode 01"
```

Before commissioning:

1. disable Settings Sync for the study profile;
2. keep extension auto-update disabled through the full study;
3. verify workspace settings disable AGENTS.md, CLAUDE.md, instruction files,
   organization instructions, skills, plugins, memory, browser tools, session
   sync, and automatic MCP discovery;
4. confirm no chat context or file attachment is present;
5. stop the fixed MCP server, activate the assigned opaque condition, and
   restart only that server;
6. use Configure Tools to leave only `closureprobe_probe` enabled; and
7. inspect the model-visible request for unexpected system/user customization.

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

The debug export is the final contamination check. If it contains a semantic
condition map, custom instruction, memory, unrelated workspace context, or an
additional tool, the run is invalid even if the profile checklist appeared
clean.
