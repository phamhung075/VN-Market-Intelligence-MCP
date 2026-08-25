---
name: claim-truth-gate
description: >
  Shared SSOT pre-write gate: re-probes narrative absence-claims against live MCP
  gateway tool output. Two runtime paths, identical inputs/verdict/signal-emit
  contract: Path A (MCP-native `narrative_truth_gate` tool — primary for the 5
  no-Bash cowork narrative agents: fb-market-poster, unified-agent/CHEF,
  market-watcher, alert-commander, digest-predict) and Path B
  (`scripts/narrative-truth-gate.sh` — Bash-equipped callers: TNB backstop).
  Every caller invokes this ONE skill so in-flow and backstop logic never drift.
  CCATO Tier-1, briefs docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md
  + docs/architecture-briefs/2026-07-17-ccato-truthgate-mcp-native.md (MCP-native port).
---

# Skill: claim-truth-gate

## Purpose
Detects CCATO (Claim Contradicts Authorized Tool Output): an agent asserts
absence/unavailability of a dimension its own authorized tool would populate,
while the tool returns non-null data. Re-probes live via the MCP gateway —
deterministic PASS/FAIL, no model judgment. See "Honest-NULL" below for why
this cannot false-positive on legitimately-missing data.

## Engine (SSOT — do not duplicate)
Two runtimes share one SSOT data file, `docs/data/claim-tool-map.json`
(negation lexicon, dimension→tool routing, tool-argument shapes, honest-NULL
markers) — reused unchanged by both, never re-listed inline here or in any
calling flow; extend `claim-tool-map.json` instead (see its own `_meta`):

| Path | Engine | Runtime requirement |
|---|---|---|
| **A — MCP-native** | `narrative_truth_gate` MCP tool (`apps/mcp-server/src/application/usecases/runNarrativeTruthGate.ts` + `interface/mcp/tools/system/narrativeTruthGateTool.ts`) | gateway MCP grant only — no Bash |
| **B — Bash/python3** | `scripts/narrative-truth-gate.sh` (456L) | Bash + python3 |

Both engines implement the identical scan → live-probe → classify →
signal-emit pipeline against the same SSOT; Path A's `[FAIL]`/`[PASS]`/`[WARN]`
per-finding line format is byte-identical to Path B's stdout (verified
2026-08-24, CCATO-MCP-T6) so the Self-correct protocol below parses either
source the same way. This skill is a thin invocation wrapper over both — never
reimplement either engine in a calling flow.

## Choosing a path
Pick by **tool availability, not agent identity**:
- **Path A (MCP-native)** — the default for every cowork narrative agent
  (fb-market-poster, unified-agent/CHEF, market-watcher, alert-commander,
  digest-predict). All five hold the gateway MCP grant unconditionally, so
  Path A never needs a Bash-availability probe — this supersedes the older
  "probe, don't inherit" stopgap documented below (kept for historical
  context and as a fallback heuristic for any future no-grant edge case).
- **Path B (Bash script)** — Bash-equipped callers only: the `tran-ngoc-bau`
  backstop (`audit-market.md`) and any CI/dev harness. Deliberately left
  on the original engine this sprint (CCATO-MCP-T7, brief §6 R-5) — two
  engines now read the same SSOT but contain independent detection logic;
  a future drift risk tracked as a Phase-2 follow-up, not fixed here.

## Invocation contract

Inputs (set by the calling flow) — identical for both paths:

| Name | Type | Required | Description |
|---|---|---|---|
| `post_body` | string | yes | Composed narrative text — the exact text about to be written/sent |
| `agent_id` | string | yes | Calling agent's kebab-case id — stamped on the emitted signal for attribution |
| `cache` | object (not nullable — `null` 400s, verified 08-24) | no | This cycle's working-memory tool-call results: `{ "<TICKER>": { "<dimension_id>": <non-null value> } }`. Perf short-circuit only — a cache miss or absent cache still triggers a LIVE re-probe; cache never substitutes for verification |

### Path A — MCP-native tool call
```
call_tool(server="vn-market", tool="narrative_truth_gate", arguments={
  post_body: "<composed narrative text>",
  agent_id:  "<this-agent-id>",
  cache:     <this cycle's working-memory tool-call cache, or {} — never null>
})
```
Response `content[0].text` is plain text; first line is the machine-parseable
verdict marker (byte-identical semantics to Path B's exit codes):
- `GATE_VERDICT: PASS` — equivalent to script exit `0`
- `GATE_VERDICT: FAIL (N contradiction(s))` + one `[FAIL]`/`[PASS]`/`[WARN]`
  line per scanned candidate — equivalent to script exit `1`
- `GATE_VERDICT: CONFIG_ERROR: <reason>` (`isError:true` on the tool response)
  — equivalent to script exit `2`

Paste the full response text into the calling flow's cycle report (RAW
output, not a green badge — `feedback_router_verify_raw_not_badges`).

### Path B — Bash script
```bash
TMPFILE=$(mktemp "${TMPDIR:-/tmp}/ctg-body-XXXXXX.txt")
printf '%s' "$POST_BODY" > "$TMPFILE"

CACHEFILE=""
if [ -n "$CACHE_JSON" ]; then
  CACHEFILE=$(mktemp "${TMPDIR:-/tmp}/ctg-cache-XXXXXX.json")
  printf '%s' "$CACHE_JSON" > "$CACHEFILE"
fi

bash scripts/narrative-truth-gate.sh "$TMPFILE" "$AGENT_ID" ${CACHEFILE:+"$CACHEFILE"}
GATE_EXIT=$?

rm -f "$TMPFILE" "${CACHEFILE:-}"
```
Capture full stdout+stderr and paste it into the calling flow's cycle report
(RAW output, not a green badge — `feedback_router_verify_raw_not_badges`).

## Verdict contract (both paths — same three outcomes)
- **PASS** (Path A `GATE_VERDICT: PASS` / Path B exit `0`) = no CCATO contradiction detected (or nothing to check)
- **FAIL** (Path A `GATE_VERDICT: FAIL (N contradiction(s))` / Path B exit `1`) = ≥1 contradiction; `[FAIL] dimension=... tool=... ticker=... claim="..." returned="..."` lines present in the response
- **CONFIG_ERROR** (Path A `GATE_VERDICT: CONFIG_ERROR: <reason>`, `isError:true` / Path B exit `2`) = usage/config error (missing args, missing `claim-tool-map.json`, unreadable post file) — this is an infra fault, NOT a verdict: `send_telegram(channel="bug", message="[<agent_id>] claim-truth-gate CONFIG ERROR")`, do not treat as PASS

**Signal emit on FAIL is done server-side by whichever engine ran** — Path A
inside the `narrative_truth_gate` tool handler, Path B inside the script
itself (both append a `narrative_contradiction` row to `.signal_queue.rows[]`,
`to:"po"` — Path A via `orchStateStore.appendSignalQueueRow()` in-process,
Path B via `scripts/orch-apply.sh`). The calling agent never separately
writes this signal, and — critically for Path A callers — cowork agents are
structurally forbidden from writing `orch-state.json` themselves
(`cowork-boundary/SKILL.md`); this server-side emit is why Path A exists at
all, not just a Bash-avoidance convenience.

**Emitted row contract (FIX-CCATO-NTG-...-FORGED-WRITER-ID, 2026-08-25) — both paths identical:**
- `summary` QUOTES the probe evidence (`... {tool} returned: <value>`, budgeted to the 120-char
  HC-2 cap). It no longer asserts "returned non-null data" unconditionally, which previously let a
  row whose own `payload.returned_value` said the opposite still read as an accusation.
- `dedup_key` = `narrative_contradiction:{agent_id}:{tool}:{ticker_or_dim}:{cycle}` — keyed on the
  FINDING, not the emission. A repeat emission of an already-queued finding BUMPS `.occurrences` /
  `.last_seen_ts` on the existing row instead of appending a second one. Do not expect one row per
  gate run; count `occurrences`. (The row `id` cannot dedup: its uuid4 suffix makes every duplicate
  id-unique by construction.)
- Path A screens each candidate at the write boundary and QUARANTINES rather than appends when the
  row fails a check — never a silent drop. Greppable markers, one per class:
  `NTG-GUARD-REFUSED-TEST-HARNESS-LIVE-WRITE` (a `NODE_ENV=test` process aimed at the live
  `orch-state.json` — refused outright), `NTG-GUARD-QUARANTINED-CLOCK-SKEW` (row `ts` more than
  15 min from the wall clock, either direction), `NTG-GUARD-QUARANTINED-NULL-MARKER-CONTRADICTION`
  (`returned_value` contains a `claim-tool-map.json` `.tool_null_markers` entry — that is an honest
  NULL, structurally impossible for a FAIL). Quarantined candidates land in
  `docs/data/telemetry/narrative-contradiction-quarantine.jsonl` (gitignored) with their marker and
  reason. If a gate run reports FAIL but no row appears in `.signal_queue.rows[]`, grep that file.

## Self-correct in-cycle protocol (brief §4.6 — mandatory on FAIL, both paths)
1. Re-call the mapped tool named on the `[FAIL]` line (`tool=<name> ticker=<ticker>`) directly: `call_tool(server="vn-market", tool=<name>, arguments=...)`.
2. Rewrite the offending sentence in `post_body` using the real returned values.
3. Re-run this skill (Invocation steps above, same path) with the corrected `post_body`.
4. Second-pass PASS → continue to write/publish.
   Second-pass FAIL (rewritten `post_body` still classified NON_NULL by the gate — this includes
   both a genuine tool error AND a live tool response that is real but simply absent from
   `tool_null_markers`, e.g. a "PDF downloaded, extraction pending" state; confirmed live
   2026-08-22, digest-predict/SHB/compare_financials) → write the per-field honest gap per the
   calling flow's own existing no-data protocol instead of re-asserting the false claim. Do not
   attempt a 3rd rewrite to dodge the negation-lexicon match — 2 passes is the limit.
5. The signal already fired on the FIRST FAIL — do not suppress it even if self-correction succeeds; it records that in-cycle correction occurred.

## Time-sensitivity override (real-time agents ONLY)
Applies to **market-watcher**, **alert-commander**, and **qa-responder** (any flow whose gate sits before a real-time alert/answer send, not a scheduled digest/post).
If the SECOND pass (post self-correct) STILL FAILS:
- do NOT block the alert indefinitely
- write the per-field honest-gap version (same text as step 4 above)
- the signal is already emitted (the engine fired it on the original FAIL)
- PROCEED to send the alert with the honest-gap text

Non-real-time agents (fb-market-poster, unified-agent/CHEF, digest-predict) have **no override** — a persistent second-pass FAIL blocks the write entirely; escalate per that flow's own existing gate-failure path.

## No-Bash cowork subagent sessions — historical stopgap, superseded by Path A (discovered live, alert-commander, 2026-07-20)
Some cowork subagent sessions are bound Read/Write/Edit/MCP-gateway ONLY — no Bash tool, so `scripts/narrative-truth-gate.sh` (Path B) cannot be invoked at all (categorical, not a script failure). Before CCATO-MCP-T7 this was worked around with a manual-substitute heuristic (below); as of this sprint the fix is structural, not a workaround — the 5 no-Bash cowork narrative agents call Path A (`narrative_truth_gate` MCP tool) directly, which needs no Bash and needs no probe. Kept below for historical context and as a last-resort fallback only if a future session somehow lacks the gateway grant too (not expected for any current agent):

Manual-substitute fallback (only if BOTH Path A's gateway grant AND Path B's Bash are unavailable): manually check `post_body` for any absence/unavailability claim about a dimension a tool would populate (the actual CCATO risk this gate exists to catch). If the message states only facts taken verbatim from data already fetched live this cycle (no fabricated absence claim), treat as equivalent to PASS and proceed — for real-time agents (alert-commander, market-watcher) this falls under the Time-sensitivity override above (never block a real-time alert on an unavailable tool). Log the substitution in the notebook.

**PROBE, don't inherit (alert-commander, 2026-07-21 16:10Z) — retained for Path B/TNB only.** Bash availability is **per-session, not per-agent**. For `tran-ngoc-bau` (Path B), probe once (`date -u +"%Y-%m-%dT%H:%M:%SZ"`) before assuming Bash is present; if it succeeds, run the real `scripts/narrative-truth-gate.sh` and follow the normal verdict contract above. This probe is **not needed** for the 5 Path A cowork agents — the gateway MCP grant is unconditional, so there is nothing to probe.

## Honest-NULL (structural — no false positives)
A tool call that legitimately returns null/empty (e.g. an indicator still gated
on OHLCV depth, `project_indicator_program_gated_on_ohlcv_depth`) classifies as
**PASS**, never FAIL — the absence claim was true. This is enforced inside
each engine's response classifier against `claim-tool-map.json`'s
`tool_null_markers` SSOT list; do not add any additional honest-NULL handling
in the calling flow.

## Usage in flow files (generic pattern — exact per-flow anchors are CCATO-T3's/CCATO-MCP-T7's scope)
```markdown
**Step <N> — CLAIM-TRUTH GATE (mandatory, last gate before write/send)**
Run: skill `.claude/skills/claim-truth-gate/SKILL.md` — Path A (MCP-native, this agent's default)
  post_body = <composed narrative text>
  agent_id  = "<this-agent-id>"
  cache     = <this cycle's tool-call cache, or {} — never null>
On FAIL → apply Self-correct protocol above.
[real-time agents only] second FAIL → apply Time-sensitivity override above.
[non-real-time agents] second FAIL → write per-field honest gap, do not publish the false claim.
```

## Smoke-test (run once per gate/lexicon change — proves non-false-green)
```bash
# Path B (bash engine):
bash scripts/test-narrative-truth-gate.sh

# Path A (MCP-native tool) unit/registration coverage:
cd apps/mcp-server && bun test src/__tests__/CCATO-MCP-T6-TOOL-REGISTRATION.test.ts
```
Existing DoD harness (CCATO-T1, Path B) proves all four: (a) VNM TA-absence claim → FAIL naming VNM + RSI; (b) foreign-flow absence claim → FAIL; (c) honest-NULL claim (insufficient OHLCV depth) → PASS, no false positive; (d) determinism — identical `post_body` → identical verdict across repeated runs. Path A's own full (a)-(e) DoD replay (incl. live-container re-run) is CCATO-MCP-T8's scope — not yet built; today's Path A coverage is registration + CONFIG_ERROR + zero-candidate-PASS + pure `formatGateReport()` byte-fidelity only (see CCATO-MCP-T6-TOOL-REGISTRATION.test.ts header for exact scope boundary).

## Not this skill's job
- Lexicon / dimension / tool-routing edits → `docs/data/claim-tool-map.json` only (extension path documented in its own `_meta`).
- Re-probe engine changes → `scripts/narrative-truth-gate.sh` (Path B) or `apps/mcp-server/src/application/usecases/runNarrativeTruthGate.ts` (Path A) only — never here.
- WHERE each of the 5 no-Bash cowork flows calls Path A (exact anchor lines) → `CCATO-T3-FLOW-WIRING-6PT` (original anchors) + `CCATO-MCP-T7-SKILL-DUAL-PATH` (this sprint's invocation swap).
