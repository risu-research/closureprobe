# Preregistration Amendment 08: Version 6 Final Instrumentation Revision

Recorded: 2026-08-16

Timing: after Version 5 Gate A1 and A2 were public and one invalid Version 5
commissioning attempt was sealed, before any primary execution and before a
Version 6 public Gate A.

## Version 5 commissioning finding

Exactly one Version 5 commissioning attempt was executed:
`VS01-PILOT-COMPLETE-DUAL`, condition `P_90E7056A96AE`, commissioning position
1, attempt 1. It is invalid, excluded, and not reused. Its visible semantic
claim is not scored and did not motivate either correction below. No primary
execution occurred.

Agent Debug sealing itself succeeded under
`closureprobe-agent-debug-seal-v2`, with three receipt-bound artifacts. The
request-isolation audit failed because the observed main tool call was
`session_store_sql`, not the sole intended ClosureProbe call. The corresponding
raw transcript contained zero verified `closureprobe_probe` calls. Version 5
`verify-wire.mjs` incorrectly returned success for that zero-call transcript.
The privacy-safe supplied hashes and classifications are preserved in
`evidence/public/v5-invalid-commissioning-attempt.json`; raw Agent Debug
contents remain private.

## Version 6 corrections

Version 6 makes exactly two technical corrections:

1. the tracked experimental workspace explicitly sets
   `github.copilot.chat.localIndex.enabled=false`; and
2. `verify-wire.mjs` now requires exactly one verified
   `closureprobe_probe` `tools/call`, rejecting both zero calls and more than
   one call.

The existing wire checks for blinded condition, tool identity, frozen
arguments, carrier shape and equality, frozen stimulus, and leakage remain
unchanged. The custom-agent model, Thinking Effort, tool allowlist, and
no-subagent contract remain unchanged.

No semantic scenario, carrier path, controlled request, grounding,
proposition, condition mapping, prompt, commissioning definition, matrix, run
order, endpoint, normalization rule, comparison rule, escalation rule, MCP
server/stimulus, or stdio tap changes in Version 6.

## Fresh Version 6 commissioning

Version 6 requires a new public Gate A1 and A2 before execution. After those
gates, all three commissioning cells restart from attempt 1 and must be repeated
from scratch under Version 6. No Version 5 commissioning evidence is reused as
Version 6 commissioning evidence. The ordinary invalid-attempt policy remains
fixed: each Version 6 commissioning cell permits at most attempts 1 and 2, and
the second invalid attempt exhausts that cell.

## Final instrumentation-revision rule

Version 6 is the final instrumentation revision. A further preregistration
version must not be created merely to suppress another observed
client-generated hidden tool, context injector, session subsystem, or other
measurement-machine behavior. If Version 6 commissioning cannot produce the
required valid attempts within the frozen two-attempt-per-cell policy because
such unsuppressed client behavior persists or newly appears, the study closes
as instrumentation-limited. This stopping rule is independent of semantic
outcomes and cannot be relaxed because a claim, carrier, or condition is
favorable or unfavorable.
