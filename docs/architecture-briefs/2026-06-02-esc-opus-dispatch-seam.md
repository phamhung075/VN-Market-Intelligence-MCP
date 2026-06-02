<!-- size-justification: 200L — ESC-OPUS-DISPATCH-SEAM design brief; 6 sections (problem/pattern/seam/idempotency/dependency/acceptance); all load-bearing; agent-father implementation-ready without re-deriving. -->

# ESC-OPUS-DISPATCH-SEAM — Architecture Brief

**Date:** 2026-06-02
**Author:** agents-architect
**Status:** DESIGN — agent-father implements
**Task:** ESC-OPUS-DISPATCH-SEAM (SPRINT-S)
**Dependency:** FU-BCTC-TOOL-PARAMS (necessary-but-not-sufficient — see §5)

---

## §1 Problem — 10-Cycle Silent Failure

`docs/agents/bctc-analyst/flow/main.md` § Escalation Decision (L74-80) says:

```
IF any(esc_flags) == TRUE:
  Invoke sub-flow: flow/deep-dive-opus.md
```

`docs/agents/bctc-analyst/flow/deep-dive-opus.md` has frontmatter `model: claude-opus-4`.

**The gap:** A running bctc-analyst agent (spawned on Sonnet/Haiku by the dev-team cron) cannot change its own model mid-flow. "Invoke sub-flow: deep-dive-opus.md" is prose — no runtime mechanism executes it as a new Agent call with model=opus. For 10 consecutive cycles, FPT ESC-3 (OCF/profit divergence_ratio > 0.40) set the flag, the prose ran, and zero Opus analysis was produced. No error was surfaced; the bctc_signal quietly omitted the `deep_dive_result` block.

**Root cause class:** Model-pinned sub-flows cannot be invoked from within a lower-model agent. The only runtime boundary that enforces a model switch is a new Agent spawn — which only the main terminal / dev-team dispatcher can do.

---

## §2 Proven Pattern (Reference Implementation)

The dev-team dispatcher manually resolved the FPT backlog this cycle (2026-06-02):

1. cowork-team emitted a `bug-escalation` signal_queue row (to:po) summarizing ESC blockers.
2. dev-team drain-signals (Step 0a-D) drained it; PO triaged.
3. dev-team dispatcher spawned `bctc-analyst` via Agent tool with explicit `model: claude-opus-4` override and prompt: "run deep-dive-opus.md ESC-3 handler, input = {trigger context}."
4. bctc-analyst-on-Opus ran `get_cash_flow` / `get_bctc_full`, emitted `deep_dive_result` contract block, wrote a `deep_dive_result`-type signal (to:po) back into the queue.

This is the seam to formalize.

---

## §3 Proposed Seam Design

### 3.1 Trigger — bctc-analyst (Sonnet/Haiku cycle)

**File to edit:** `docs/agents/bctc-analyst/flow/main.md` — § Escalation Decision (L74-82)

**Before (prose-only, no runtime seam):**
```
IF any(esc_flags) == TRUE:
  Invoke sub-flow: flow/deep-dive-opus.md
  Input: { trigger_id, report_id, ticker, quarter, context, pass_results }
  Await output: deep_dive_result JSON block
  APPEND deep_dive_result to bctc_signal output
```

**After (emit signal + skip inline Opus invocation):**
```
IF any(esc_flags) == TRUE:
  # Check idempotency guard FIRST (see §4 below).
  guard_key = "esc-deepdive:" + ticker + ":" + quarter + ":" + trigger_id
  guard = call_tool(server="vn-market", tool="task_claim", arguments={
    task_id:     guard_key,
    task_kind:   "sprint-task",
    owner_agent: "bctc-analyst",
    ttl_seconds: 86400
  })
  IF guard.claimed == FALSE:
    LOG: "[ESC-DISPATCH] guard_key={guard_key} already pending/done — skip emit"
    # Do NOT emit; do NOT fail cycle. Carry on with standard bctc_signal output.
  ELSE:
    # Write esc-deep-dive-request signal to orch-state.json .signal_queue
    # SAFE-JSON: all fields are structured — NEVER interpolate into a shell string.
    signal_row = {
      "id":          "bca-" + ts_compact,
      "ts":          "<ISO-8601 UTC>",
      "from":        "bctc-analyst",
      "to":          "dev-team",
      "type":        "esc-deep-dive-request",
      "summary":     "ESC deep-dive request: " + ticker + " " + quarter + " " + trigger_id,
      "severity":    "HIGH",
      "status":      "NEW",
      "payload_ref": null
    }
    # Inline payload (≤800 chars — fits; no separate handoff file needed):
    signal_row.payload = JSON.stringify({
      "trigger_id":   trigger_id,       # e.g. "ESC-3"
      "ticker":       ticker,
      "quarter":      quarter,
      "report_id":    report_id,
      "guard_key":    guard_key,        # dev-team uses this to release after dispatch
      "context":      context,          # ESC context dict (small)
      "all_esc_fired": all_fired_ids    # list of all TRUE esc ids this cycle
    })
    Append signal_row to orch-state.json .signal_queue.rows[] (atomic temp→rename per signal-dashboard SKILL §WRITE).
    LOG: "[ESC-DISPATCH] emitted esc-deep-dive-request for " + ticker + "/" + quarter + "/" + trigger_id

  # In BOTH cases — OMIT deep_dive_result from bctc_signal (it is not yet computed).
  # Standard bctc_signal carries esc_flags section noting PENDING or GUARD-HELD.
  Append to bctc_signal: { "escalation_status": "PENDING" | "GUARD-HELD", "guard_key": guard_key }
```

**Note on existing deep-dive-opus.md:** Remove the prose "Invoke sub-flow" sentence from main.md; deep-dive-opus.md itself is unchanged — it becomes the target flow that the dispatcher spawns.

### 3.2 Routing — drain-signals.md routing table

**File to edit:** `docs/agents/dev-team/flow/drain-signals.md` — § 0a-3 Signal routing table

**Add row (after the existing `repair_task_request` row):**
```
| `esc-deep-dive-request` | `bctc-analyst` | ESC-DISPATCH | dev-team dispatches model=opus bctc-analyst deep-dive; guard released after spawn |
```

**Also add footnote below the table:**
```
**ESC-DISPATCH handler** (inline in drain-signals.md, Step 0a-3):
When a NEW row with type=`esc-deep-dive-request` is drained:
1. Read payload: {trigger_id, ticker, quarter, report_id, guard_key, context, all_esc_fired}.
2. Mutex-wrap (on-demand cowork lane, per main.md § On-demand spawn):
   spawn_key = "task:on-demand:bctc-analyst-opus:" + ticker + ":" + quarter
   claim spawn_key (ttl=7200, owner_agent="dev-team").
   If not claimed: log SKIP, mark row READ, do NOT release guard_key. Exit handler.
3. Spawn bctc-analyst with model: claude-opus-4 and prompt:
   "Run ONLY docs/agents/bctc-analyst/flow/deep-dive-opus.md.
    Input: {trigger_id, report_id, ticker, quarter, context, all_esc_fired}.
    On completion, emit a deep_dive_result signal (to:po, type:deep_dive_result) per §Output Contract."
4. After spawn returns: release spawn_key.
5. Release guard_key via task_release (so the bctc-analyst cycle can detect DONE on next cycle if needed).
   Note: guard_key TTL is 24h regardless — if release fails gracefully, next-cycle guard check auto-expires.
6. Mark esc-deep-dive-request row status → RESOLVED.
```

### 3.3 Result Closure — deep-dive-opus.md output signal

**File to edit:** `docs/agents/bctc-analyst/flow/deep-dive-opus.md` — append to § Error Handling section

**Add after existing error handling:**
```
## Output Signal (mandatory — emit after completing any ESC handler)

After emitting `deep_dive_result` session block, write a signal_queue row:
{
  "id":       "bca-ddres-" + ts_compact,
  "from":     "bctc-analyst",
  "to":       "po",
  "type":     "deep_dive_result",
  "summary":  "Deep dive complete: {ticker} {quarter} {trigger_id} → {recommended_action}",
  "severity": "HIGH",
  "status":   "NEW",
  "payload_ref": null,
  "payload": JSON.stringify({
    "ticker":       ticker,
    "quarter":      quarter,
    "trigger_id":   trigger_id,
    "escalation_trigger":  deep_dive_result.escalation_trigger,
    "deep_dive_verdict":   deep_dive_result.deep_dive_verdict,
    "confidence":          deep_dive_result.confidence,
    "recommended_action":  deep_dive_result.recommended_action
  })
}
Append to orch-state.json .signal_queue.rows[] (atomic temp→rename).
PO receives on next drain → routes to market-watcher / alert-commander / human as appropriate.
```

---

## §4 Idempotency Design

**Problem:** ESC flags persist across cycles. Without a guard, every bctc-analyst cycle would re-emit an `esc-deep-dive-request` until the Opus result arrives, causing duplicate dispatches.

**Guard mechanism:** `task_claim` on key `"esc-deepdive:{ticker}:{quarter}:{trigger_id}"` with TTL=86400s (24h).

- When bctc-analyst fires ESC on cycle N: claims key → emits signal → key held for 24h.
- Cycle N+1 (before Opus finishes): `task_claim` returns `claimed=false` → bctc-analyst logs GUARD-HELD, skips emit. No duplicate signal.
- After Opus deep-dive: dev-team dispatcher calls `task_release(guard_key)` → key freed.
- Next bctc-analyst cycle: `task_claim` succeeds → but ESC flag should also be re-checked. If ESC still fires (data unchanged), a NEW deep-dive is legitimately warranted (data not updated). This is correct behavior.
- TTL acts as safety net: if dev-team dispatcher crashes before release, key auto-expires in 24h and the next cycle can retry.

**Why task_claim (not a signal marker or notebook flag):**
- TTL-backed: survives agent restarts and crash scenarios automatically.
- Already used by on-demand spawn mutex in main.md — consistent pattern.
- Cross-agent visible: both bctc-analyst and dev-team dispatcher see the same key state.
- No additional file writes or notebook coupling required.

---

## §5 FU-BCTC-TOOL-PARAMS Dependency (Necessary-But-Not-Sufficient)

The seam enables the Opus dispatch. But the Opus deep-dive's analytical value for **ESC-3** is still data-starved due to known tool defects logged as FU-BCTC-TOOL-PARAMS:

1. **`get_cash_flow` ignores its `quarters` param** — returns only 1 quarter regardless of `quarters=8`. ESC-3 handler (deep-dive-opus.md L61: `get_cash_flow(ticker, quarters=8)`) cannot perform multi-quarter accrual trend analysis until this is fixed.
2. **`get_bctc_full` takes `code`/`report_id`, NOT `ticker`** — ESC handlers in deep-dive-opus.md call `get_bctc_full(ticker)` which may fail or return wrong data. The correct call is `get_bctc_full(code=report_id)`.

**Impact:** Without FU-BCTC-TOOL-PARAMS, the Opus deep-dive will run (seam works) but ESC-3 accrual decomposition will be single-quarter only and ESC-1/2/4 re-reads may silently fail. The output contract will still be emitted (never-throw rule in deep-dive-opus.md) but with reduced analytical depth and potentially `confidence=0.0`.

**Sequencing recommendation:** Ship the seam (ESC-OPUS-DISPATCH-SEAM) and FU-BCTC-TOOL-PARAMS as parallel tracks. The seam is safe to deploy before the tool fixes — it will emit honest low-confidence results until the tools are corrected. Agent-father should log FU-BCTC-TOOL-PARAMS as a dev-mcp-server task.

---

## §6 File Edit Summary for Agent-Father

| File | Section | Change type |
|---|---|---|
| `docs/agents/bctc-analyst/flow/main.md` | § Escalation Decision (L74-82) | Replace prose "Invoke sub-flow" block with guard-check + signal-emit logic (§3.1) |
| `docs/agents/dev-team/flow/drain-signals.md` | § 0a-3 routing table + new ESC-DISPATCH handler block | Add 1 routing row + inline handler spec (§3.2) |
| `docs/agents/bctc-analyst/flow/deep-dive-opus.md` | Append after § Error Handling | Add § Output Signal block (§3.3) |

All three edits are required for the seam to function. They can be committed atomically in one agent-father pass.

**File-size check (flow cap = 120L):**
- main.md is currently ~86L; § Escalation Decision replacement adds ~15L net → ~101L. Within cap.
- drain-signals.md is currently ~113L; routing row + ESC-DISPATCH block adds ~18L net → ~131L. **Exceeds 120L cap.** Agent-father must either extract the ESC-DISPATCH handler to a new sub-file `docs/agents/dev-team/flow/drain-esc-dispatch.md` and reference it inline, or prune an equivalent number of comment lines. Recommend extraction.
- deep-dive-opus.md is currently ~94L (including frontmatter); Output Signal block adds ~16L → ~110L. Within cap (119L with size-justification comment update).

---

## §7 Acceptance Test

**One ESC fire → one Opus deep-dive → zero duplicate, zero manual intervention:**

1. Trigger: bctc-analyst Sonnet cycle fires ESC-3 for ticker X, quarter Q.
   - Expected: `esc-deep-dive-request` row appears in `.signal_queue.rows[]` with status=NEW; `task_claim("esc-deepdive:X:Q:ESC-3")` returns claimed=false on the NEXT bctc-analyst cycle (guard held).
2. Dispatch: next dev-team drain-signals tick reads the NEW row.
   - Expected: bctc-analyst spawned with model=claude-opus-4; deep-dive-opus.md ESC-3 handler runs; `get_cash_flow` + `get_bctc_full` called; `deep_dive_result` block emitted.
3. Close: deep-dive-opus.md emits `deep_dive_result` signal (to:po); dev-team releases guard_key.
   - Expected: `deep_dive_result` row appears in `.signal_queue.rows[]` with to=po; guard_key claim is released; esc-deep-dive-request row marked RESOLVED.
4. Next bctc-analyst cycle (ESC-3 still fires on same data):
   - Expected: `task_claim("esc-deepdive:X:Q:ESC-3")` returns claimed=false (guard released, but if ESC still fires, new claim succeeds → new emit). Verify: only ONE new signal row emitted, not two.
5. Zero manual intervention at any step.
6. Verify via: `jq '.signal_queue.rows[] | select(.type=="esc-deep-dive-request")' docs/data/orch/orch-state.json`
   and `jq '.signal_queue.rows[] | select(.type=="deep_dive_result")' docs/data/orch/orch-state.json`.
