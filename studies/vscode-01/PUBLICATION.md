# Public Time-Anchor Protocol

Local commits and hashes protect integrity but do not independently establish
when a design existed. This study therefore has two mandatory public gates.

The immutable v3, v4, and v5 preregistration/correction releases and their A2
anchor records remain historical provenance and are never moved, replaced, or
relabeled. The single invalid Version 4 commissioning attempt and the single
invalid Version 5 commissioning attempt are excluded and recorded only through
their privacy-safe public records. Private raw debug is not published or reused.

Version 6 changes only the explicit local-index isolation control and exact-one-
call wire enforcement. It receives a new source commit, annotated tag, immutable
Gate A1 release, and separate Gate A2 record before all three commissioning
paths restart from attempt 1. No Version 6 public anchor exists at
preregistration-candidate time.

## Gate A1: publish the preregistration release

Create a draft release and attach all frozen assets before publishing it:

1. the exact Git commit;
2. annotated tag `study-vscode-01-prereg-v6`;
3. the manually generated study source asset named
   `closureprobe-study-vscode-01-prereg-v6.zip`, uploaded directly to the draft
   release rather than relying on GitHub's automatic “Source code” links;
4. the ZIP SHA-256 recorded verbatim in the release body and post-release
   anchor record;
5. `MANIFEST.sha256` and its SHA-256;
6. the preregistration and Amendments 01 through 08, including `AMENDMENT-08.md`;
7. the privacy-safe Version 4 and Version 5 invalid-attempt records; and
8. a release body stating `Primary executions observed: none. Version 4 commissioning executions observed: one invalid and excluded. Version 5 commissioning executions observed: one invalid and excluded. Version 6 commissioning executions observed: none. Version 6 adds only explicit local-index isolation and exact-one-call wire enforcement; study semantics, prompts, conditions, matrix, run order, normalization, and endpoints are unchanged.`

The manually frozen local asset set is exactly 13 files: Amendments 01 through
08, the named Version 6 source ZIP, `MANIFEST.sha256`, `PREREGISTRATION.md`, and
the two privacy-safe invalid-attempt records. GitHub-generated source archives
and attestations are not counted in that set.

Enable immutable releases if available. Publish only after every asset is
attached. Never move or replace the preregistration tag.

After publication, verify the manually uploaded local ZIP against the release
attestation:

```bash
gh release verify-asset study-vscode-01-prereg-v6 \
  ./closureprobe-study-vscode-01-prereg-v6.zip \
  --repo risu-research/closureprobe
```

The automatically generated repository ZIP/tarball links are distinct source
archives and are not substitutes for this named, locally hashed study asset.

Suggested release title:

```text
ClosureProbe External Boundary Study 01 — Preregistration v6
```

## Gate A2: publish the post-release anchor record

`published_at`, release ID, public URL, immutable status, attestation, and API
asset digests exist only after Gate A1 is published. Retrieve them from the
public release page/API, complete `publication-anchor.json` from the template,
and publish that record in a separate public Git commit. The completed record is
not an asset inside the release whose publication it records.

The record commit must expose the completed JSON at a durable URL and identify
the Version 6 Gate A1 tag target exactly. Version 6 requires this new
post-publication A2 anchor before commissioning. Commissioning may begin only
after both A1 and A2 are public and independently readable. The instrument
itself must still be run from the immutable A1 tag, not from the later
metadata-record commit.

## Gate B1/B2: after commissioning, before primary execution

The three excluded Version 6 commissioning runs determine only the extraction
and harness-envelope freeze. Then:

1. complete and privacy-review `extraction-freeze.json` from
   `extraction.template.json`;
2. publish the named client-observable specimen tuple;
3. publish the three wire hashes, three Agent Debug seal-receipt hashes,
   privacy-safe request-isolation audits, automated harness-envelope comparison,
   its explicit privacy-safe frozen comparison values and aggregate digest, and
   minimal role evidence;
4. manually confirm that the fixed harness envelope is client-generated only
   and contains none of the prohibited contamination categories;
5. list every hidden or non-version-addressable boundary;
6. regenerate the study manifest;
7. commit and create annotated tag `study-vscode-01-extraction-v2`;
8. publish a second immutable release using the same draft → attach → publish
   sequence; and
9. publish its completed post-release anchor record in a separate public commit
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
