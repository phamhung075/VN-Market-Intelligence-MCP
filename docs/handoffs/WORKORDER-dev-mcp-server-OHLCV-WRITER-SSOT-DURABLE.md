---
id: WORKORDER-dev-mcp-server-OHLCV-WRITER-SSOT-DURABLE
version: "2026-06-17"
assigned_to: dev-mcp-server
status: READY_FOR_DISPATCH
type: WORKORDER
priority: P0
zone: apps/mcp-server/
---

# DEV-MCP-SERVER WORKORDER
# ARCH-OHLCV-WRITER-SSOT-DURABLE Implementation

**Date:** 2026-06-17
**Router verified:** YES (raw finding re: 60s re-fetch cadence)
**Architect design:** FINAL (ARCH-OHLCV-WRITER-SSOT-DURABLE + brief)

---

## EXECUTIVE SUMMARY

You have **3 atomic P0 subtasks** to implement the producer-root fix for the recurring "single-digit RSI / giá 0 dưới BB" MARKET-spam bug (4th recurrence, escalated to architect). The bug is caused by `writeForeignFlowToOhlcv` inserting an all-zero OHLCV stub row when the foreign-flow fetch fires BEFORE the real OHLCV bar arrives. The fix is a **merge-only UPDATE** (no INSERT stub) that defers foreign-flow data until the real bar arrives.

**Sequencing:** All 3 tasks are READY (no cross-dependencies between SUBTASK-1 & SUBTASK-2; SUBTASK-3 blocks on SUBTASK-1). You can start SUBTASK-1 + SUBTASK-2 in parallel; SUBTASK-3 depends on SUBTASK-1 being merged.

**Rebuild required:** YES (mcp-server image rebuild before live gate)

---

## ROUTER RAW-VERIFIED FINDING (Carry verbatim — DO NOT interpret or second-guess)

The foreign-flow fetch cron `CRONS.foreignFlowFetch` fires **every 60 seconds** (`*/1 * * * *`; confirmed `startupHelpers.ts:219` + `startScheduler.ts:840`).

**Therefore the architect's R-1 "2–3h data-loss window" is OVERSTATED in risk-feeling, but the design is CORRECT:**
- Re-fetch is guaranteed within 60s
- The moment the real OHLCV bar lands (~03:00Z), the next 60s fetch UPDATEs the foreign-flow columns
- Same-day final-value loss window ≤ ~60s
- This is **acceptable** under /goal#1 (honest gap beats fake 0)

**CRITICAL:** Do NOT instruct dev to re-introduce any:
- `INSERT-on-absent-row`
- `sentinel-close` (e.g., -1)
- `backfill-on-insert`
- Any other stub-creation hack

The `daily_foreign_flow` separate table is a follow-on (R-1 complete elimination), NOT P0. The producer fix (merge-only UPDATE) is the DEFINITIVE producer-side solution for this sprint.

---

## TASK BREAKDOWN

### SUBTASK-1: Rewrite writeForeignFlowToOhlcv — merge-only UPDATE (no stub INSERT)

**Handoff:** `docs/handoffs/SUBTASK-OHLCV-WRITER-1-FOREIGN-FLOW-MERGE.md`

**Scope:**
- Rewrite `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` L57-69
- Replace `INSERT … ON CONFLICT` with UPDATE-only
- SQL contract (brief §2):
  ```sql
  UPDATE daily_ohlcv
  SET
    foreign_buy_vol   = ?,
    foreign_sell_vol  = ?,
    foreign_net_vol   = ?,
    put_through_vol   = ?,
    foreign_buy_value  = COALESCE(?, foreign_buy_value),
    foreign_sell_value = COALESCE(?, foreign_sell_value),
    updated_at = ?
  WHERE code = ? AND date = ?
  -- changes=0 → no OHLCV row yet → deferred, debug log, no stub
  ```

**Critical Verification (YOU MUST DO THIS):**
- Verify BOTH callers treat `changes=0` as non-error:
  - `foreignFlowFetcher.ts` L136-137 (path 1)
  - `foreignFlowFetcher.ts` L219-220 (path 2)
  - `pushForeignFlowHandler.ts` L319
- None should throw or reject on 0
- Add debug log when `changes=0` (deferred write)

**Acceptance Gate:** Unit tests T-1 + T-2 validate this (SUBTASK-3)

**Size:** ~2h

---

### SUBTASK-2: Add SSOT writer-bypass annotation to ohlcvWriteService.ts

**Handoff:** `docs/handoffs/SUBTASK-OHLCV-WRITER-2-SSOT-ANNOTATION.md`

**Scope:**
- Add comprehensive JSDoc to top of `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts`
- Document exhaustive writer inventory (8 writers: A, C, D, E, F, G, H)
- Explain sentinel pattern `/* OHLCV-WRITE-BYPASS-ALLOWED */`
- Note ESLint rule as follow-on (LINT-OHLCV-WRITE-BYPASS, backlog, not P0)

**Scope:** Documentation only, no code logic changes

**Parallelizable with:** SUBTASK-1 (no dependencies)

**Size:** ~30min

---

### SUBTASK-3: Unit + integration tests T-1 through T-4 (regression + behavioral gate)

**Handoff:** `docs/handoffs/SUBTASK-OHLCV-WRITER-3-UNIT-TESTS.md`

**Scope:**
- **T-1:** No existing row → `changes=0`, zero rows inserted, debug log
- **T-2:** Existing row → `changes=1`, foreign-flow updated, OHLCV untouched
- **T-3:** Deferred + real insert + repopulation workflow
- **T-4 (REGRESSION PROOF):** After foreign-flow write on empty DB, `SELECT close FROM daily_ohlcv ... WHERE code=X AND date=D` returns **ZERO rows** (NOT a row with `close=0`)
- Integration behavioral gate: end-to-end merge-only workflow

**Acceptance Gate:** All 4 tests green, integration gate passes

**Dependency:** Blocks on SUBTASK-1 being merged (tests validate the new SQL)

**Size:** ~2h

---

## SEQUENCING & WIP

**Current board state:**
- `in_progress: 1` (ARCH-CRON-SCHEDULER-RELIABILITY — architect design, gate-held)
- `ready: 3` (your 3 subtasks + 1 guard task + 1 design-umbrella task)
- WIP limit: 2 coding lanes

**Your dispatch sequence:**
1. **Now:** Start SUBTASK-1 + SUBTASK-2 in parallel (both READY, no cross-deps)
2. **After SUBTASK-1 merges:** Start SUBTASK-3 (depends on SUBTASK-1)
3. **After all 3 merge + rebuild:** Shared verification gate at next VN market open (2026-06-18, 02:15Z)

**WIP impact:**
- SUBTASK-1 + SUBTASK-2 in parallel = 2 lanes (at limit)
- SUBTASK-3 starts after SUBTASK-1 merges (lane frees up)
- Total estimated: SUBTASK-1 (2h) + SUBTASK-2 (0.5h parallel) + SUBTASK-3 (2h after SUBTASK-1) ≈ 4–5 developer-hours

---

## PARALLEL CONSUMER-SIDE GUARD (INFO ONLY)

A second P0 task is already in-flight: **FIX-ALERT-SCAN-REJECT-STUB-BAR-P0** (dev-mcp-server, active coding lane). This is the consumer-side defense-in-depth: alert scans (taAlertScanJob + bbAlertScanJob) must reject a latest bar with `close<=0 OR volume<=0` BEFORE computing RSI/BB.

**You are NOT responsible for that task.** It runs in parallel and is ALSO gated by the shared verification gate at 2026-06-18 market open.

---

## SHARED VERIFICATION GATE (Both P0s together)

**When:** NEXT VN market open 2026-06-18, **first TA scan 02:15Z**

**What to verify (RAW, not badges):**
1. **RSI canonical match:** `get_unreviewed_market_messages` → alert-engine TA-Alert RSI within 0.1pt of canonical, no single-digit RSI, no RSI=100.0 for all 30 tickers
2. **No BB spam:** `get_unreviewed_market_messages` → zero "giá 0 dưới BB" / scale-wrong "÷1000" messages
3. **Live DB probe (02:00–03:30Z window):** Named-volume `daily_ohlcv` via keinos/sqlite3 sidecar: ZERO rows with `close=0` on the latest bar for any watchlist ticker
4. **Generic mandate:** All 30 tickers, no per-ticker allowlist

**Timing:** Verify AT 02:15Z (first TA scan), NOT at 04:30Z (self-heal masks stubs after real OHLCV lands)

---

## KNOWLEDGE LOAD (Read in order)

1. **Architect design (full context):** `docs/handoffs/ARCH-OHLCV-WRITER-SSOT-DURABLE-architect-design.md`
   - §1 Verified Paths (recon)
   - §2 Design — Two Concrete Changes (the SQL contract + risk flags)
   - §5 Test Strategy (exact test definitions)

2. **Architecture brief (quick ref):** `docs/architecture-briefs/2026-06-17-ohlcv-writer-ssot-durable.md`
   - §"Root Cause: Schema Constraint vs. Merge-Only Semantics"
   - §"Design Decision: Merge-Only (UPDATE-only, no stub INSERT)"
   - §"Writer Inventory (post-this-fix)"

3. **Your 3 handoff files (detailed specs):**
   - `docs/handoffs/SUBTASK-OHLCV-WRITER-1-FOREIGN-FLOW-MERGE.md`
   - `docs/handoffs/SUBTASK-OHLCV-WRITER-2-SSOT-ANNOTATION.md`
   - `docs/handoffs/SUBTASK-OHLCV-WRITER-3-UNIT-TESTS.md`

4. **Code paths (recon first):**
   - `apps/mcp-server/src/infrastructure/db/ohlcvForeignFlowStore.ts` L57-69 (rewrite target)
   - `apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts` L136-137, L219-220 (callers 1)
   - `apps/mcp-server/src/interface/mcp/routes/pushForeignFlowHandler.ts` L319 (caller 2)
   - `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` (SSOT annotation target)

---

## COMMIT CONVENTION

Use explicit-stage commit discipline (see `docs/policies/commit-convention.md`):

- **Type:** `fix` (bug fix, P0, recurring-class closure)
- **Scope:** `mcp-server/ohlcv-writer-ssot-durable`
- **Task ID:** Use the subtask ID (e.g., `SUBTASK-OHLCV-WRITER-1-FOREIGN-FLOW-MERGE`)
- **Trailers:** Include standard trailers (AC/co-author if applicable)

Example:
```
fix(mcp-server/ohlcv-writer-ssot-durable): SUBTASK-1 writeForeignFlowToOhlcv merge-only UPDATE

Replace INSERT…ON CONFLICT stub injection with UPDATE-only logic. Defers
foreign-flow data until real OHLCV bar arrives (~60s re-fetch window).
Closes the producer-root path for 4th recurrence of single-digit RSI class.

Verified both callers (foreignFlowFetcher, pushForeignFlowHandler) treat
changes=0 as non-error. Unit tests T-1..T-2 validate behavior.

AC:
- writeForeignFlowToOhlcv uses UPDATE only (no INSERT)
- changes=0 → debug log, no stub row
- Callers verified for changes=0 non-error
```

---

## BUILD & REBUILD

- **Local dev:** `bun check` + `bun test` — all green before pushing
- **Image rebuild:** After all 3 subtasks merge, ops/router triggers mcp-server image rebuild (required before live gate)
- **Flag:** REBUILD_REQUIRED:YES set on all 3 tasks

---

## RISK MITIGATION (From architect)

| Risk | Severity | Mitigation |
|------|----------|-----------|
| R-1: Foreign-flow data lost 2–3h | MEDIUM | Accepted for P0. 60s re-fetch window is safe. Follow-on separate table closes entirely. |
| R-2: `changes=0` treated as error | LOW | YOU MUST verify both callers. Tests T-1 validate non-error path. |
| R-3: Parallel race (foreignFlow + OHLCV INSERT) | LOW | UPDATE on 0-change is no-op. No race introduced. |
| R-4: server.ts push-ohlcv-history | LOW | Already has guards, no change needed. |
| R-5: ESLint rule missing allows new bypass writers | LOW-MEDIUM | JSDoc annotation (SUBTASK-2) hardens this. ESLint rule is follow-on (backlog). |

---

## DECISION JOURNAL (PM will capture)

**DJ-GATE-1:** PM appends decision entry to `docs/agent-memory/decisions/sprint-2026-06-17-pm.md` documenting:
- Parent task normalized from REVIEW → done (design deliverable shipped)
- 3 P0 subtasks created + 2 backlog follow-ons queued
- Router 60s re-fetch finding carried verbatim to prevent dev from re-introducing stub hacks

---

## SUCCESS CRITERIA (For this workorder)

After you merge all 3 subtasks:
- [ ] SUBTASK-1: SQL rewrite merged, callers verified, rebuild flagged
- [ ] SUBTASK-2: JSDoc annotation merged, documentation complete
- [ ] SUBTASK-3: Unit tests T-1..T-4 green, integration gate passes, rebuild flagged
- [ ] Shared verification gate: 2026-06-18 market open 02:15Z → RSI canonical match, no BB/gia-0 spam, live DB zero `close=0` stubs

---

## NEXT: Router will dispatch

After you accept this workorder:
1. Router confirms you received it (WORKORDER status → ACCEPTED)
2. You start SUBTASK-1 + SUBTASK-2 in parallel
3. After SUBTASK-1 merges, you start SUBTASK-3
4. After all 3 merge + rebuild, PO gates at shared verification window (2026-06-18 02:15Z)

---

## Questions?

If you encounter blockers (e.g., callers throw on `changes=0`, or test setup fails):
1. Stop and send a one-line Telegram to #work
2. Do NOT work around it or invent a compensating hack
3. Router will escalate to architect if needed

Good luck. Close the class.
