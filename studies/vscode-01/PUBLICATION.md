# Public Time-Anchor Protocol

Local commits and hashes protect integrity but do not independently establish
when a design existed. This study therefore has two mandatory public gates.

The immutable v3 preregistration release, the original immutable v4
preregistration release/A2 anchor, and the immutable Version 4 Correction 1
release/A2 anchor remain historical provenance and are never moved, replaced,
or relabeled. After Correction 1 Gate A1/A2 and before any v4 commissioning,
the named VS Code 1.133.0 specimen reproducibly rewrote the legacy boolean
representation of `chat.mcp.discovery.enabled` to its four-source all-false
object representation. Version 4 Correction 2 therefore receives a new commit,
annotated correction tag, immutable release, and post-publication anchor before
commissioning. Correction 2 changes only this byte-stability representation;
the Version 4 experimental design is unchanged.

## Gate A1: publish the preregistration release

Create a draft release and attach all frozen assets before publishing it:

1. the exact Git commit;
2. annotated tag `study-vscode-01-prereg-v4-corr2`;
3. the manually generated study source asset named
   `closureprobe-study-vscode-01-prereg-v4-corr2.zip`, uploaded directly to the draft
   release rather than relying on GitHub's automatic “Source code” links;
4. the ZIP SHA-256 recorded verbatim in the release body and post-release
   anchor record;
5. `MANIFEST.sha256` and its SHA-256;
6. the preregistration and Amendments 01 through 06, including `AMENDMENT-06.md`; and
7. a release body stating `Primary executions observed: none. V4 commissioning executions observed: none. Pre-primary v3 commissioning executions: recorded and excluded. Correction 2 changes only the VS Code MCP discovery setting representation required for byte-stable launch of the named specimen; the Version 4 experimental design is unchanged.`

Enable immutable releases if available. Publish only after every asset is
attached. Never move or replace the preregistration tag.

After publication, verify the manually uploaded local ZIP against the release
attestation:

```bash
gh release verify-asset study-vscode-01-prereg-v4-corr2 \
  ./closureprobe-study-vscode-01-prereg-v4-corr2.zip \
  --repo risu-research/closureprobe
```

The automatically generated repository ZIP/tarball links are distinct source
archives and are not substitutes for this named, locally hashed study asset.

Suggested release title:

```text
ClosureProbe External Boundary Study 01 — Preregistration v4 Correction 2
```

## Gate A2: publish the post-release anchor record

`published_at`, release ID, public URL, immutable status, attestation, and API
asset digests exist only after Gate A1 is published. Retrieve them from the
public release page/API, complete `publication-anchor.json` from the template,
and publish that record in a separate public Git commit. The completed record is
not an asset inside the release whose publication it records.

The record commit must expose the completed JSON at a durable URL and identify
the Gate A1 tag target exactly. Correction 2 requires this new
post-publication A2 anchor before commissioning. Commissioning may begin only
after both A1 and A2 are public and independently readable. The instrument
itself must still be run from the immutable A1 tag, not from the later
metadata-record commit.

## Gate B1/B2: after commissioning, before primary execution

The three excluded commissioning runs determine only the extraction rule. Then:

1. complete and privacy-review `extraction-freeze.json` from
   `extraction.template.json`;
2. publish the named client-observable specimen tuple;
3. publish the three wire hashes, the three Agent Debug seal-receipt hashes, and minimal role evidence;
4. list every hidden or non-version-addressable boundary;
5. regenerate the study manifest;
6. commit and create annotated tag `study-vscode-01-extraction-v1`;
7. publish a second immutable release using the same draft → attach → publish
   sequence; and
8. publish its completed post-release anchor record in a separate public commit
   before opening primary run 1.

If extraction cannot be frozen without result-dependent selection, stop the
study. If code, prompts, conditions, endpoints, or run order change, return to
Gate A and repeat commissioning.

## Public anchor record

The completed record must include repository URL, release ID, commit, tag,
release URL, `published_at`, asset names, byte lengths, local SHA-256 and API
digest values, immutable status, and release-attestation URL or an explicit
statement that none was exposed. The public commit containing the record
supplies its own time and integrity anchor; the JSON does not contain its own
future commit hash. A local tag or unpushed branch does not satisfy either gate.

## What may remain private

Credentials, account identifiers, full system prompts, unrelated context, user
paths, and sealed Agent Debug capture contents may remain private. The required
wire and seal-receipt hashes and the smallest privacy-reviewed evidence needed
to establish the selected roles are public.
