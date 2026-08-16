# Operator Runbook

Stop whenever a step cannot be completed exactly. An unobservable boundary is a
limitation, not permission to infer preservation.

## 0. Verify the frozen materials

From repository root:

```bash
npm ci
npm run build
node studies/vscode-01/bin/check-prerequisites.mjs
node studies/vscode-01/bin/generate-matrix.mjs --check
node studies/vscode-01/bin/preflight-rc3-carriers.mjs --check
node studies/vscode-01/bin/results-ledger.mjs --check
node studies/vscode-01/bin/study-manifest.mjs --check
node --test studies/vscode-01/tests/*.test.mjs
```

Do not proceed after any digest, generation, or test failure.

## 1. Satisfy public Gate A

Complete `PUBLICATION.md` Gate A1 and A2. Confirm that both the immutable release
and its separate post-publication anchor record precede every commissioning
timestamp. A local branch or tag is insufficient.

## 2. Create the isolated specimen

Follow `PROFILE-ISOLATION.md` and create an Empty Profile named
`ClosureProbe VSCode 01`. Copy `specimen.template.json` to
`specimen.local.json` and record every client-observable version, extension,
model, setting, profile hash, and hidden backend boundary.

Open only `studies/vscode-01/specimen-workspace`. Do not open the repository
root in the experimental window. Do not attach prompt files; copy their plain
text externally and paste it into chat.

## 3. Activate one opaque condition in the fixed server

The workspace `mcp.json` contains exactly one server key. Before each run:

1. use `MCP: List Servers` to stop `closureprobeStudy`;
2. activate the assigned opaque condition while it is stopped:

   ```bash
   node studies/vscode-01/bin/activate-condition.mjs <opaque-condition-id>
   ```

3. restart `closureprobeStudy` and inspect Configure Tools;
4. leave only `closureprobe_probe` enabled;
5. keep all built-in, extension, browser, file, terminal, memory, and web tools
   disabled; and
6. confirm the displayed server/tool name, description, and argument schema
   contain no semantic scenario, carrier, or condition label.

The ignored `.study-condition.local.env` is analysis-side control state. Never
attach or open it in chat. The server process fixes condition outside the
model's tool call; never edit the prompt or tool arguments to select a scenario.
If the opaque environment value appears in the selected model request, the run
is invalid.

## 4. Commission the observable path

Commissioning is excluded from the primary matrix. Follow the three opaque
files in `commissioning-prompts/` in filename order.

For each:

1. start a fresh chat and select the frozen model;
2. paste the prompt verbatim;
3. permit exactly one read-only call;
4. verify the final response is exactly the required two-key JSON;
5. after the explicit final response and before any further interaction in that
   chat, identify its session-local Agent Debug directory;
6. immediately seal that session directory with `seal-agent-debug.mjs`, writing
   the bundle under `captures/agent-debug-private/<commissioning-id>/`;
7. if a session-local sidecar is actually needed for a preregistered
   contamination control, name it explicitly with `--sidecar`; sidecars are
   auxiliary contamination evidence only and never substitute for `main.jsonl`;
8. verify `seal-receipt.json` with `verify-agent-debug-seal.mjs`;
9. identify and verify the single corresponding raw stdio transcript with
   `verify-wire.mjs`;
10. inspect only the receipt-bound sealed `main.jsonl` with
    `inspect-agent-debug.mjs`, and run `privacy-audit.mjs` on every sealed
    artifact actually used as evidence.

The seal is valid only when the source-before, sealed-copy, and source-after
SHA-256 and byte-length values agree. A sealing or later seal-verification
failure is an instrumentation invalidity under the fixed invalid-run policy.

Also inspect the model-visible request for blinding contamination. Any semantic
or opaque condition identifier, condition map, oracle assessment, custom
instruction, memory, unrelated context, or additional tool invalidates the run.

The ordinary Agent Debug export is not a v4 study evidence artifact. Extraction
and normalization use only the receipt-bound sealed session-local `main.jsonl`.

## 5. Freeze extraction and satisfy Gate B

Copy `extraction.template.json` to `extraction.local.json`. Record event types,
attributes, pointer rules, artifact hashes, role evidence, contamination checks,
and hidden boundaries. A selector may depend on event structure but not on guard
value, claim value, or whether it avoids P3.

Publish the privacy-reviewed extraction freeze, exact specimen tuple, and second
public time anchor as required by `PUBLICATION.md`. Do not open primary prompt 1
before Gate B is public.

## 6. Execute the 21 primary runs

Follow `run-order.json`, not `matrix.json` file order. Each entry provides the
position, opaque condition ID, and prompt path. All prompt files have identical
bytes; filenames are external operator bookkeeping only.

For each run:

1. stop the fixed server, activate the assigned opaque condition, restart it,
   and enable only `closureprobe_probe`;
2. confirm the same profile, model label, settings, and extensions;
3. record UTC start time;
4. start a fresh chat and paste the assigned prompt verbatim;
5. permit exactly one call and record UTC end time;
6. after the explicit final response and before any further interaction in that
   chat, immediately seal the session-local Agent Debug directory using the
   frozen Section 4 acquisition procedure;
7. verify the seal receipt and map that sealed bundle to the single new wire
   transcript;
8. verify wire and inspect only the receipt-bound sealed `main.jsonl` using the
   frozen extraction rule; and
9. record any invalid attempt in `invalid-runs.json` before the one permitted
   rerun. If attempt 2 is also invalid, record it as `invalid_exhausted`, do not
   make a third attempt, continue to the next run-order position, and leave the
   affected contrasts incomplete.

Never retry inside a chat, clarify the prompt, change model, reorder runs,
unblind a prompt, or use a later mutable version of a session-local debug file
in the experimental window.

## 7. Bind and normalize a primary result

Copy `selection.template.json` to `selection.<cell>.local.json`. Fill the exact
run-order position, attempt, UTC timestamps, wire transcript, Agent Debug
`seal-receipt.json` path and receipt SHA-256, and selector pointer, encoding,
and digest for client payload, model payload, and claim.

The receipt is the single Agent Debug evidence root. Do not supply `main.jsonl`
or its SHA-256 as a second routing field. The normalizer verifies the receipt
and derives the eligible sealed primary artifact and any bound auxiliary
artifacts from it.

If a client event or model request is genuinely unavailable under the frozen
rule, replace that selector with:

```json
{"unobservable":true,"reason":"record the exact visibility failure"}
```

Do not mark an observable but transformed value unobservable. The inspector's
`json_value` candidate supplies its pointer, encoding, and `valueDigest`; place
that digest in the ordinary payload selector so the normalizer records P2.

If no exact binary two-key study claim exists, use the following only after
confirming that the frozen inspector found no exact claim candidate. This
includes fenced JSON, extra prose, model-selected `some` or `error`, malformed
JSON, and no answer:

```json
{"invalidResponse":true,"reason":"record the exact formatting or absence failure"}
```

Then normalize:

```bash
node studies/vscode-01/bin/normalize-run.mjs \
  studies/vscode-01/selection.<cell>.local.json \
  --out studies/vscode-01/evidence/public/results/<cell>.json
node studies/vscode-01/bin/results-ledger.mjs
```

The result separately reports `P_client`, `P_model`, cumulative preservation,
first observable normative change, first guard-signal loss, first unsupported
strengthening, localization status, explicit claim, C license and basis, and
every license-critical normalization or outer-binding visibility path. An
unobservable stage is absent from the normalized trace and never synthesized.

## 8. Escalate by comparison

Apply the comparison-level rules in `PREREGISTRATION.md`. Do not repeat only the
cell that supports a preferred interpretation. Keep every repetition in a fresh
chat with paired ordering and timestamps.

Sealed Agent Debug captures can contain full prompts, system instructions,
context, paths, account data, and credentials. Keep their contents private,
publish only the required hashes and privacy-reviewed role evidence, and
disclose only the smallest manually reviewed extract necessary to verify the
selected roles.
