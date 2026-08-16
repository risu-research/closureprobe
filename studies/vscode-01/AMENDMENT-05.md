# Preregistration Amendment 05: Mechanical Prerequisite Guard Correction

Recorded: 2026-08-16

Timing: after public preregistration v4 Gate A1/A2 and before any v4
commissioning or primary execution.

## Defect discovered during frozen Step 0

After the v4 public Gate A was complete, the study was checked from a detached
execution worktree before any v4 commissioning prompt was opened.

`study.json` correctly recorded `preregistrationVersion` as `4`, but
`bin/check-prerequisites.mjs` still required the value to equal `3`. The
prerequisite command therefore stopped with:

`preregistration version 4 != 3`

The checker accumulates all prerequisite failures before throwing. No other
prerequisite mismatch was reported. The same frozen execution check also
verified the study design, rc3 carrier preflight, results ledger, study
manifest, and all 25 executable tests.

No v4 commissioning execution and no primary execution occurred before this
defect was discovered.

## Correction

Correction 1 changes only the stale executable guard in
`bin/check-prerequisites.mjs`:

- expected preregistration version: `3` -> `4`.

The preregistration remains Version 4.

Correction 1 does not change:

- ClosureProbe rc3 or its semantic oracle;
- any semantic scenario;
- any representation path;
- the 21 primary cells or three commissioning cells;
- the opaque condition mapping;
- request or grounding arguments;
- tool identity, description, or input stimulus;
- any generated prompt bytes;
- the binary `none` / `unknown` response contract;
- the C licensing rule;
- any P endpoint;
- seeded primary run order;
- invalid-run policy;
- comparison-level escalation rules; or
- publication-language constraints.

## Public correction anchor

Because the executable study code changed after the original v4 Gate A was
published, this correction receives a new source commit, annotated correction
tag, immutable prerelease, and post-publication anchor before v4 commissioning.

The intended correction tag is:

`study-vscode-01-prereg-v4-corr1`

The original immutable v4 release and its A2 anchor remain unchanged historical
provenance.

## Interpretation

This is a mechanical consistency correction to the executable prerequisite
guard, not a new semantic preregistration version and not an outcome-driven
change.

No commissioning or primary semantic outcome was used to make the correction.
