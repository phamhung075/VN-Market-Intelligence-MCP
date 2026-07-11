---
name: claim-truth-gate
description: >
  Shared SSOT pre-write gate: re-probes narrative absence-claims against live MCP
  gateway tool output via scripts/narrative-truth-gate.sh. Every cowork narrative
  agent (fb-market-poster, unified-agent/CHEF, market-watcher, alert-commander,
  digest-predict) and TNB backstop invoke this ONE skill so in-flow and backstop
  logic never drift. CCATO Tier-1, brief docs/architecture-briefs/2026-06-30-narrative-quality-ccato-gate.md.
---

# Skill: claim-truth-gate

## Purpose
Detects CCATO (Claim Contradicts Authorized Tool Output): an agent asserts
absence/unavailability of a dimension its own authorized tool would populate,
while the tool returns non-null data. Re-probes live via the MCP gateway —
deterministic PASS/FAIL, no model judgment. See "Honest-NULL" below for why
this cannot false-positive on legitimately-missing data.

## Engine (SSOT — do not duplicate)
`scripts/narrative-truth-gate.sh` is the ONLY re-probe implementation.
Negation lexicon, dimension→tool routing, tool-argument shapes, and honest-NULL
markers live exclusively in `docs/data/claim-tool-map.json`. This skill is a
thin invocation wrapper — never re-list lexicon/tools/tickers here or in any
calling flow; extend `claim-tool-map.json` instead (see its own `_meta`).

## Invocation contract

Inputs (set by the calling flow):

| Name | Type | Required | Description |
|---|---|---|---|
| `post_body` | string | yes | Composed narrative text — the exact text about to be written/sent |
| `agent_id` | string | yes | Calling agent's kebab-case id — stamped on the emitted signal for attribution |
| `cache` | object or null | no | This cycle's working-memory tool-call results: `{ "<TICKER>": { "<dimension_id>": <non-null value> } }`. Perf short-circuit only — a cache miss or absent cache still triggers a LIVE re-probe; cache never substitutes for verification |

Steps:
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

## Exit-code contract (matches `scripts/narrative-truth-gate.sh` header exactly)
- `0` = PASS — no CCATO contradiction detected (or nothing to check)
- `1` = FAIL — ≥1 contradiction; `[FAIL] dimension=... tool=... ticker=... claim="..." returned="..."` lines printed on stdout
- `2` = usage/config error (missing args, missing `claim-tool-map.json`, unreadable post file) — this is an infra fault, NOT a verdict: `send_telegram(channel="bug", message="[<agent_id>] claim-truth-gate CONFIG ERROR")`, do not treat as PASS

**Signal emit on FAIL is done by the script itself** (appends a `narrative_contradiction` row to `.signal_queue.rows[]` via `scripts/orch-apply.sh`, `to:"po"`). The calling agent does not separately write this signal.

## Self-correct in-cycle protocol (brief §4.6 — mandatory on FAIL)
1. Re-call the mapped tool named on the `[FAIL]` line (`tool=<name> ticker=<ticker>`) directly: `call_tool(server="vn-market", tool=<name>, arguments=...)`.
2. Rewrite the offending sentence in `post_body` using the real returned values.
3. Re-run this skill (Invocation steps above) with the corrected `post_body`.
4. Second-pass PASS → continue to write/publish.
   Second-pass FAIL (tool genuinely errors this time) → write the per-field honest gap per the calling flow's own existing no-data protocol instead of re-asserting the false claim.
5. The signal already fired on the FIRST FAIL — do not suppress it even if self-correction succeeds; it records that in-cycle correction occurred.

## Time-sensitivity override (real-time agents ONLY)
Applies to **market-watcher** and **alert-commander** (any flow whose gate sits before a real-time alert send, not a scheduled digest/post).
If the SECOND pass (post self-correct) STILL FAILS:
- do NOT block the alert indefinitely
- write the per-field honest-gap version (same text as step 4 above)
- the signal is already emitted (script fired it on the original FAIL)
- PROCEED to send the alert with the honest-gap text

Non-real-time agents (fb-market-poster, unified-agent/CHEF, digest-predict) have **no override** — a persistent second-pass FAIL blocks the write entirely; escalate per that flow's own existing gate-failure path.

## Honest-NULL (structural — no false positives)
A tool call that legitimately returns null/empty (e.g. an indicator still gated
on OHLCV depth, `project_indicator_program_gated_on_ohlcv_depth`) classifies as
**PASS**, never FAIL — the absence claim was true. This is enforced inside the
script's response classifier against `claim-tool-map.json`'s `tool_null_markers`
SSOT list; do not add any additional honest-NULL handling in the calling flow.

## Usage in flow files (generic pattern — exact per-flow anchors are CCATO-T3's scope)
```markdown
**Step <N> — CLAIM-TRUTH GATE (mandatory, last gate before write/send)**
Run: skill `.claude/skills/claim-truth-gate/SKILL.md`
  post_body = <composed narrative text>
  agent_id  = "<this-agent-id>"
  cache     = <this cycle's working-memory tool-call cache, or null>
On FAIL → apply Self-correct protocol above.
[real-time agents only] second FAIL → apply Time-sensitivity override above.
[non-real-time agents] second FAIL → write per-field honest gap, do not publish the false claim.
```

## Smoke-test (run once per gate/lexicon change — proves non-false-green)
```bash
bash scripts/test-narrative-truth-gate.sh
```
Existing DoD harness (CCATO-T1) proves all four: (a) VNM TA-absence claim → FAIL naming VNM + RSI; (b) foreign-flow absence claim → FAIL; (c) honest-NULL claim (insufficient OHLCV depth) → PASS, no false positive; (d) determinism — identical `post_body` → identical verdict across repeated runs.

## Not this skill's job
- Lexicon / dimension / tool-routing edits → `docs/data/claim-tool-map.json` only (extension path documented in its own `_meta`).
- Re-probe engine changes → `scripts/narrative-truth-gate.sh` only.
- WHERE each of the 6 flows calls this skill (exact anchor lines) → `CCATO-T3-FLOW-WIRING-6PT`.
