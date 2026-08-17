# ClosureProbe External Boundary Study 01 — Terminal Report

## Status

**Terminal classification: instrumentation-limited**

Version 6 commissioning did not produce a valid first commissioning cell within the preregistered two-attempt limit. No primary execution occurred, no semantic outcome was scored, and the study does not proceed to Gate B.

## What happened

The first required commissioning cell was `VS01-PILOT-COMPLETE-DUAL` under opaque condition `P_90E7056A96AE`.

Both permitted attempts were independently executed and immediately sealed. In both attempts:

- the request-isolation audit observed an unexpected main tool call, `session_store_sql`;
- the instrumented MCP wire contained **zero** verified `closureprobe_probe` calls;
- the attempt was therefore invalid and excluded; and
- the visible semantic response was not scored.

The retained evidence hashes are recorded in `evidence/public/v6-terminal-record.json`. Full Agent Debug contents and raw wire contents remain private.

## Attempt ledger

| Attempt | Started (UTC) | Invalidated (UTC) | Status | Reason |
| ---: | --- | --- | --- | --- |
| 1 | 2026-08-17T03:19:50.303Z | 2026-08-17T03:25:34.1341319Z | invalid | unexpected `session_store_sql`; zero intended wire calls |
| 2 | 2026-08-17T03:32:37.878Z | 2026-08-17T03:39:10.8909482Z | invalid | unexpected `session_store_sql`; zero intended wire calls |

After attempt 2, the commissioning cell is `invalid_exhausted`.

## Why the study stops here

Version 6 was preregistered as the **final instrumentation revision**. Its stopping rule prohibits creating Version 7 merely to suppress another client-generated hidden tool, context injector, session subsystem, or similar measurement-machine behavior.

The first required commissioning cell exhausted both allowed attempts with repeated unexpected session-store tool activity and zero intended MCP wire calls. Because the three valid commissioning paths are prerequisites for the harness/extraction freeze at Gate B, Gate B cannot be satisfied under the frozen protocol. Commissioning positions 2 and 3 and the 21-cell primary matrix are therefore not opened.

## What this result means

This is **not** evidence that ClosureProbe negative-evidence semantics were preserved or lost across the intended VS Code/Copilot boundary.

It establishes a narrower methodological result:

> Under the preregistered Version 6 configuration of the named VS Code/Copilot specimen, valid external-boundary commissioning could not be established: both permitted attempts contained unexpected `session_store_sql` activity in the model/tool loop while the instrumented MCP wire contained zero intended `closureprobe_probe` calls.

Accordingly:

- semantic outcomes from the invalid attempts are unscored;
- no product-wide claim about VS Code, GitHub Copilot, or the model family is made;
- no primary result is claimed; and
- the study terminates as instrumentation-limited rather than adapting the protocol after observing the failure.

## Integrity and provenance

Version 6 Gate A1 and Gate A2 were published before Version 6 commissioning. The execution instrument was run from the immutable Version 6 A1 tag. Each invalid attempt retained a sealed Agent Debug receipt hash, sealed `main.jsonl` hash, and raw-wire transcript hash.

This terminal report is a post-execution closure artifact. It does not alter the preregistered study semantics, prompts, conditions, matrix, run order, endpoints, or stopping rule.
