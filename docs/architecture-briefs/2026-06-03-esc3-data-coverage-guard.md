# Architecture Brief: ESC-3 Data-Coverage-Limited Guard

**Date:** 2026-06-03
**Author:** agents-architect
**Status:** PLAN-ONLY — for implementation by agent-father
**Priority:** HIGH (16 wasted Opus deep-dives, ongoing every cycle)

---

## Problem Statement

`bctc-analyst` has fired ESC-3 (OCF/NI divergence) for FPT Q1-2026 for **16 consecutive cycles**, each time re-escalating to dev-team via an `esc-deep-dive-request` signal citing root blocker "FU-BCTC-TOOL-PARAMS: get_cash_flow ignores quarters param."

Router live-verification confirms:
- `get_cash_flow(FPT, quarters=8)` returns `quarters_requested=8` + a `periods[]` array — the param IS honored. FU-BCTC-TOOL-PARAMS is DONE-LIVE-VERIFIED.
- `quarters_returned=2` because only 2 quarters of FPT cash-flow data exist in corpus (Q1/2026 + Q4/2025). The other 6 are not yet extracted/stored.
- Multi-quarter accrual decomposition is impossible due to **data coverage**, not a tool bug. Real blockers: `BCTC-HIST-VPS-BACKFILL` (DEFERRED-INFRA, async/multi-week) + `BCTC-HIST-SEED` (DONE-CODE-DATA-BLOCKED-UPSTREAM).

The ESC-3 analyst logic does not distinguish "tool broken" from "data not present yet" — so it re-fires every cycle.

---

## Affected Files — Confirmed by Direct Read

| File | Role | Location of change |
|---|---|---|
| `docs/agents/bctc-analyst/flow/main.md` | **PRIMARY** — ESC-3 trigger + guard_key/TTL dispatch | Escalation Gate § ESC-3 + § Escalation Decision |
| `docs/agents/bctc-analyst/flow/deep-dive-opus.md` | ESC-3 Opus handler — calls `get_cash_flow(ticker, quarters=8)`, checks coverage | § ESC-3, step 1 |

No other files require changes.

---

## Root Cause Analysis

### Why the guard does not suppress re-fires

The current guard (main.md "Escalation Decision"):
```
guard_key = "esc-deepdive:" + ticker + ":" + quarter + ":" + trigger_id
task_claim(..., ttl_seconds: 86400)   # 24h TTL
```

After the Opus deep-dive completes, `deep-dive-opus.md` releases the guard:
```
task_release(task_id: "esc-deepdive:" + ticker + ":" + quarter + ":" + trigger_id)
```

So the lifecycle is: claim → Opus runs → release → next cycle (24h later) → claim again → Opus runs again → repeat forever. The 24h TTL is also inadequate (4 cycles/day × 16 days = blatant re-fire pattern even if release were NOT called).

### Why the deep-dive keeps being dispatched as a tool bug

`deep-dive-opus.md` § ESC-3 handler knows `quarters_returned < quarters_requested` but:
1. It still emits `recommended_action: "flag_for_human_review"` (valid — the analysis is inconclusive).
2. It does NOT emit any structured signal back that would let the main.md escalation gate reclassify the condition as DATA-COVERAGE-LIMITED.
3. The guard is released unconditionally, so the cycle repeats.

The main.md escalation gate has **zero quarters-coverage awareness** — it fires on `divergence_ratio > 0.40` alone, with no check on whether enough historical data exists to make the Opus deep-dive analytically meaningful.

---

## Design Decision

**Option chosen: Pre-flight quarters-coverage check in ESC-3, with long-TTL DATA-COVERAGE-LIMITED guard and single ops-routed signal.**

Rationale for choice over alternatives:
- **Downgrade severity only**: does not stop re-escalation to dev-team — wrong team, wrong cadence.
- **Longer TTL alone (extend 24h → 30d)**: would work IF the guard were not released after each Opus run. But fixing TTL without blocking the release path leaves a semantic gap. However, combining the two (coverage gate + no-release + long TTL) is the correct fix.
- **Suppress entirely**: violates the "allow ONE informative escalation" requirement.
- **Pre-flight gate + long-TTL + ops routing**: satisfies all requirements with minimal machinery changes. Reuses the existing guard_key/TTL mechanism (only changes TTL and routing destination for the coverage-limited case). No new infrastructure.

---

## Exact Change Specification for agent-father

### Change 1 — `docs/agents/bctc-analyst/flow/main.md`

**Location:** § ESC-3 block (around line 63–65 currently):

**Current ESC-3 block:**
```
### ESC-3: OCF vs Net-Profit Divergence
- Extract `ocf_total` from `pass_3_result` (cashflow-v1); `net_profit_total` from `pass_2_result` (pl-v1).
- Compute: `divergence_ratio = |ocf_total / net_profit_total - 1|`
- Guard: if `net_profit_total == 0` → skip ESC-3 (undefined ratio, no escalation).
- If `divergence_ratio > 0.40` → escalate. Context: `{ ocf_total, net_profit_total, divergence_ratio }`.
```

**Replace with:**
```
### ESC-3: OCF vs Net-Profit Divergence
- Extract `ocf_total` from `pass_3_result` (cashflow-v1); `net_profit_total` from `pass_2_result` (pl-v1).
- Compute: `divergence_ratio = |ocf_total / net_profit_total - 1|`
- Guard: if `net_profit_total == 0` → skip ESC-3 (undefined ratio, no escalation).
- **Coverage pre-flight:** call `get_cash_flow(ticker, quarters=4)`. Read `quarters_returned` from response.
  - If `quarters_returned < 4`:
    Set `ESC-3_result = DATA-COVERAGE-LIMITED` (not TRUE, not FALSE — a distinct classification).
    Log: `[ESC-3] DATA-COVERAGE-LIMITED: {ticker}/{quarter} — {quarters_returned} of 4 quarters available. Multi-period accrual decomposition impossible. Blocking escalation to dev-team.`
    (See DATA-COVERAGE-LIMITED handler in § Escalation Decision below.)
  - If `quarters_returned >= 4`:
    Evaluate divergence_ratio as before. If `divergence_ratio > 0.40` → `ESC-3_result = TRUE`.
    Context: `{ ocf_total, net_profit_total, divergence_ratio, quarters_returned }`.
```

**Location:** § Escalation Decision block — within the `IF any(esc_flags) == TRUE` branch, before the guard_key claim:

**Add a DATA-COVERAGE-LIMITED pre-handler block (insert BEFORE the existing `IF any(esc_flags) == TRUE` block):**
```
# --- DATA-COVERAGE-LIMITED handler (runs before normal ESC dispatch) ---
coverage_limited_ids = [esc_id for esc_id in ["ESC-3"] if esc_id_result == "DATA-COVERAGE-LIMITED"]

IF coverage_limited_ids is non-empty:
  For each limited_id in coverage_limited_ids:
    cov_guard_key = "esc-datacov:" + ticker + ":" + quarter + ":" + limited_id
    cov_guard = call_tool(server="vn-market", tool="task_claim", arguments={
      task_id: cov_guard_key, task_kind: "sprint-task",
      owner_agent: "bctc-analyst", ttl_seconds: 2592000   # 30 days — one full BCTC cycle
    })

    IF cov_guard.claimed == FALSE:
      LOG: "[ESC-DISPATCH] COVERAGE-GUARD-HELD " + cov_guard_key + " — no re-emit"
      Append to bctc_signal: { "esc3_status": "DATA-COVERAGE-LIMITED", "coverage_guard_key": cov_guard_key, "coverage_guard_held": true }

    ELSE:
      # First time this quarter/ticker hits coverage-limited: emit ONE signal to ops (not dev-team)
      cov_signal_row = {
        "id": "bca-datacov-{ts_compact}", "ts": "<ISO-8601 UTC>",
        "from": "bctc-analyst", "to": "ops",
        "type": "data-coverage-gap",
        "summary": "ESC-3 DATA-COVERAGE-LIMITED: " + ticker + " " + quarter + " — {quarters_returned}/4 quarters available",
        "severity": "LOW", "status": "NEW", "payload_ref": null,
        "payload": {
          "trigger_id": limited_id, "ticker": ticker, "quarter": quarter,
          "quarters_returned": quarters_returned, "quarters_required": 4,
          "root_task": "BCTC-HIST-VPS-BACKFILL",
          "note": "Multi-period accrual decomposition blocked by data coverage, not tool bug. No Opus deep-dive warranted. Re-check when quarters_returned >= 4.",
          "guard_key": cov_guard_key, "guard_ttl_days": 30
        }
      }
      Append cov_signal_row to orch-state.json .signal_queue.rows[] (atomic temp→rename).
      LOG: "[ESC-DISPATCH] DATA-COVERAGE-LIMITED emitted (ops, once per 30d): " + ticker + "/" + quarter + "/" + limited_id
      Append to bctc_signal: { "esc3_status": "DATA-COVERAGE-LIMITED", "coverage_guard_key": cov_guard_key, "quarters_returned": quarters_returned }

  # Remove DATA-COVERAGE-LIMITED ids from esc_flags before normal ESC dispatch
  esc_flags_for_dispatch = {id: result for id, result in esc_flags if result not in ["DATA-COVERAGE-LIMITED"]}
  # Only proceed to normal dispatch if remaining non-limited ESC flags are TRUE
  IF all(v != TRUE for v in esc_flags_for_dispatch.values()):
    # No true ESC flags remain — skip Opus dispatch entirely
    GOTO no_escalation
# --- end DATA-COVERAGE-LIMITED handler ---
```

**Also: remove the `task_release` in deep-dive-opus.md from the DATA-COVERAGE path** — the DATA-COVERAGE-LIMITED guard must NOT be released after the Opus run (since Opus is never spawned for coverage-limited cases, this is automatic by design — the fix in main.md prevents Opus dispatch, so deep-dive-opus.md is never called for this case).

### Change 2 — `docs/agents/bctc-analyst/flow/main.md`

**Location:** The existing `NOTE FU-BCTC-TOOL-PARAMS` comment in the Escalation Decision block:

**Current:**
```
    # NOTE FU-BCTC-TOOL-PARAMS: tool param defects tracked; seam ships honest low-confidence first.
```

**Replace with:**
```
    # NOTE FU-BCTC-TOOL-PARAMS: DONE-LIVE-VERIFIED (2026-06-03). quarters param IS honored by get_cash_flow.
    # quarters_returned < quarters_requested = DATA COVERAGE GAP, not tool bug. Guard above handles this.
```

### Change 3 — `docs/agents/bctc-analyst/flow/deep-dive-opus.md`

**Location:** § ESC-3 handler, step 1:

**Current step 1:**
```
1. `get_cash_flow(ticker, quarters=8)` — full cash flow history.
2. Decompose accrual drivers: working capital changes (AR, inventory, AP), D&A, deferred items.
```

**Replace step 1 with:**
```
1. `get_cash_flow(ticker, quarters=8)` — full cash flow history.
   COVERAGE CHECK: if `quarters_returned < 4` in the response:
   - Log: `[ESC-3 OPUS] DATA-COVERAGE-LIMITED — only {quarters_returned} quarters available. Accrual decomposition impossible. Emitting coverage-gap verdict.`
   - Set `deep_dive_verdict = "DATA-COVERAGE-LIMITED: insufficient historical cash-flow data ({quarters_returned} quarters available, 4 required for multi-period accrual decomposition). Analysis deferred until BCTC-HIST-VPS-BACKFILL delivers historical corpus."`
   - Set `confidence = 0.0`, `recommended_action = "data_coverage_gap"`.
   - SKIP steps 2–5. Go directly to Output Contract emit + Output Signal emit.
   - **Do NOT call task_release** for the deep-dive guard when coverage-limited — allow natural TTL expiry (86400s) to prevent immediate re-spawn.
2. If quarters_returned >= 4: decompose accrual drivers (working capital changes: AR, inventory, AP), D&A, deferred items.
```

---

## File + Line Summary (confirmed by direct read)

| File | Section | Change type |
|---|---|---|
| `docs/agents/bctc-analyst/flow/main.md` | § ESC-3 (Escalation Gate) | Add coverage pre-flight check; add DATA-COVERAGE-LIMITED variant to ESC-3_result |
| `docs/agents/bctc-analyst/flow/main.md` | § Escalation Decision | Insert DATA-COVERAGE-LIMITED handler block before normal ESC dispatch |
| `docs/agents/bctc-analyst/flow/main.md` | NOTE comment (FU-BCTC-TOOL-PARAMS) | Update stale comment |
| `docs/agents/bctc-analyst/flow/deep-dive-opus.md` | § ESC-3 step 1 | Add coverage check + early-exit path; no task_release when coverage-limited |

**No other files.** cycle.md, stage-pass-cashflow.md, stage-consolidate.md, stage-log-notify.md — untouched.

---

## Does this fully resolve the loop?

**Yes, for the false-escalation loop** — once the 30-day DATA-COVERAGE-LIMITED guard is claimed, no further Opus deep-dives or dev-team signals fire for FPT/Q1-2026/ESC-3 until either:
(a) the guard expires (30 days), or
(b) the backfill delivers ≥4 quarters and `quarters_returned >= 4` passes the pre-flight check, allowing ESC-3 to re-evaluate normally.

**No, for the underlying data coverage** — `BCTC-HIST-VPS-BACKFILL` remains DEFERRED-INFRA. The ops signal routed once by this guard notifies the correct team. The analyst correctly blocks the analysis with a DATA-COVERAGE-LIMITED note rather than repeatedly crying tool-bug to dev-team.

**The FPT OCF/NI divergence itself** (ratio -1.15, divergence 2.15) is a **real signal** worth investigating once historical data is available. This guard does not suppress the finding — it correctly defers the Opus deep-dive until the analysis is actually possible.

---

## Commit Specification

```bash
# agent-father executes:
git add docs/agents/bctc-analyst/flow/main.md docs/agents/bctc-analyst/flow/deep-dive-opus.md
git diff --cached --name-only   # zone check: both files in docs/agents/bctc-analyst/flow/
git commit -m "fix(bctc-analyst): ESC-3 data-coverage-limited guard — suppress 30d, route ops once"
git show --name-only HEAD       # raw self-verify
```

No orch-state mutation. No .env. No sprint task required (hygiene fix, no new capability).
