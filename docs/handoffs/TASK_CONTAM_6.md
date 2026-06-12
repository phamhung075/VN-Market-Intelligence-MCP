---
agent: dev-mcp-server
task_id: CONTAM_6
sprint: OHLCV-UNIT-CONTAM
status: ASSIGNED
assigned_at: 2026-06-12T11:00:00Z
sequence: 6 (after CONTAM-2 merged)
depends_on: CONTAM_2
---

# TASK CONTAM-6: Create repair migration script for 385 contaminated rows (BINDING AMENDMENT)

## BINDING AMENDMENT NOTICE

**Signed:** 2026-06-12T07:53:30Z

**Key amendment:** CONTAM-6 repair must tolerate the separate all-zero-rows defect (2026-05-30T11:47Z bulk zeros) without crashing. That defect is OUT of scope — queue follow-up backlog entry for it separately.

## Summary

Create a one-shot migration script `scripts/migrations/repair-ohlcv-unit-contamination.ts` that identifies and normalizes contaminated rows where `open < 100 OR low < 100` (thousand-VND detection). Multiply by 1000 where `close > 1000` (confirms contamination, not genuinely low-priced stock). Dry-run mode and live-run mode.

## Context

From architect brief § Decision 3:
- 385 known contaminated rows (VNH, FPT, others)
- Pattern: open=0.9, high=1000, low=0.9, close=1000 (mixed units)
- Heuristic: if `open < 100 AND close > 1000`, multiply open and low by 1000
- CONTAM-6 must run AFTER CONTAM-2 is deployed (so new contamination stops)
- Must tolerate all-zero-rows defect (separate bug, 2026-05-30T11:47Z) without crashing

## Files to Create

### Primary
- `scripts/migrations/repair-ohlcv-unit-contamination.ts`

### Dependencies
- SQLite DB (live market.db)
- No domain imports needed (pure SQL repair)

## Implementation Requirements

### Script Signature
```typescript
/**
 * Repair contaminated OHLCV rows where open/low are in thousand-VND scale
 * while close is in full-VND scale.
 *
 * Usage:
 *   bun run scripts/migrations/repair-ohlcv-unit-contamination.ts --dry-run
 *   bun run scripts/migrations/repair-ohlcv-unit-contamination.ts --live
 */
```

### Detection & Repair Logic

**Contamination heuristic:**
```sql
WHERE (open < 100 OR low < 100)     -- Thousand-VND detection
  AND close > 1000                  -- Confirms contamination (not genuinely low price)
  AND open > 0                       -- Exclude all-zero rows (separate defect)
  AND low > 0                        -- Exclude all-zero rows
```

**All-zero safety guard (binding amendment):**
```sql
-- AVOID rows where open=0 AND low=0 AND high=0 AND close=0
-- These are the 2026-05-30T11:47Z bulk zeros defect, OUT OF SCOPE
WHERE NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)
```

**Repair:**
```sql
UPDATE daily_ohlcv
SET
  open = CASE WHEN open < 100 AND open > 0 THEN open * 1000 ELSE open END,
  low  = CASE WHEN low < 100 AND low > 0 THEN low * 1000 ELSE low END
WHERE (open < 100 OR low < 100)
  AND close > 1000
  AND open > 0
  AND low > 0
  AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0);
```

### Dry-Run Mode
- **Flag:** `--dry-run` (default)
- **Output:** `console.log("Would update N rows: [list of code/date pairs]")`
- **No DB write:** Use SQL `SELECT ... FROM daily_ohlcv WHERE ...` to count affected rows
- **Sample rows:** Print first 5 affected rows with before/after values

### Live Mode
- **Flag:** `--live`
- **Prompt:** "About to normalize N rows. Continue? (yes/no)"
- **Execute:** Run UPDATE statement
- **Verification:** SELECT after UPDATE to verify normalization
- **Log:** Write before/after counts to console + log file `repair-ohlcv-unit-contamination.log`

### Error Handling
- **Crash on zero-rows all-zero check:** This is UNLIKELY but if script encounters a row matching the all-zero pattern, log.error + continue (do NOT throw). Per binding amendment, the all-zero defect is separate and out of scope.
- **Wrap in try/catch:** Catch SQL errors, log, exit with non-zero code

## Acceptance Criteria

### Functional
- [ ] Dry-run identifies exactly 385 rows (or close count per live DB state)
- [ ] Dry-run prints code/date of sample contaminated rows
- [ ] Dry-run does NOT modify DB
- [ ] Live-run prompts user before executing
- [ ] Live-run updates identified rows: `open * 1000` and `low * 1000`
- [ ] Post-update verification confirms values are in [100, 10M] range
- [ ] All-zero rows are skipped (binding amendment)

### Code Quality
- [ ] Pure SQL (no ORM)
- [ ] Error handling: try/catch around DB operations
- [ ] Log file written to `repair-ohlcv-unit-contamination.log`
- [ ] CLI arguments parsed correctly (--dry-run vs --live)
- [ ] TypeScript compiles (tsc check)

### Test Coverage
- [ ] Dry-run integration test: seed DB with 385 known-contaminated rows, run dry-run, verify count and sample output
- [ ] Live-run integration test: seed DB with 10 contaminated rows, run live-run (non-interactive), verify all are normalized

### Risk Mitigation
- **RF-3 (race with Writer A):** Script includes note: "Run during off-hours (outside VN trading hours 02:00-09:00 UTC)"
- **RF-4 (INSERT OR IGNORE):** Writer E logic: if rows are healed, cnt > 100 still holds → E skips them (correct)
- **RF-5 (data_env column):** Script preserves existing `data_env` values (SELECT then UPDATE with SET data_env=data_env, no change)

## Definition of Done

- [ ] `scripts/migrations/repair-ohlcv-unit-contamination.ts` file created
- [ ] Dry-run mode verified against live DB (no write)
- [ ] Live-run mode verified in test env (with test DB copy)
- [ ] Log output correct
- [ ] Commit message: `feat(migrations): repair-ohlcv-unit-contamination — normalize 385 mixed-unit rows`
- [ ] Script documented in `docs/policies/dev-standards.md` § Script Persistence (pointer added)

## Execution Timing

- **When:** After CONTAM-2 is deployed and running in production (stop new contamination first)
- **Window:** Off-hours (outside 02:00-09:00 UTC per RF-3)
- **Dry-run first:** Always run --dry-run to verify count before --live

## Zone & DDD Layer
- **Zone:** `scripts/migrations/`
- **DDD:** Migration layer (pure SQL utility)

## Related Architecture Brief
- `docs/architecture-briefs/2026-06-12-ohlcv-unit-contam-arch-1.md` § Decision 3, Binding Amendment, RF-3..5

## Blockers
- Blocked until CONTAM-2 is deployed (new contamination must be stopped first)
- Optional blocker: CONTAM-7 integration tests (script is tested as part of full suite)

## Dispatch Notes
- Size: M (medium, includes dry-run + live-run + logging)
- NOT run immediately — sequenced after CONTAM-2 deployment verified live
- Admin/DevOps may need to review before live-run (user prompt is built-in)

---

## [Developer] Implementation Record

- **Service:** mcp-server (scripts/migrations — pure SQL utility, no domain imports)
- **Zone:** scripts/migrations/
- **Files created:**
  - `scripts/migrations/repair-ohlcv-unit-contamination.ts` — migration script (dry-run + live modes, exportable `runRepair()`)
  - `scripts/migrations/__tests__/CONTAM-6-repair-ohlcv-unit-contamination.test.ts` — 14 test cases
  - Script pointer added to `docs/policies/dev-standards.md` § Script Persistence
- **Tests written:** `scripts/migrations/__tests__/CONTAM-6-repair-ohlcv-unit-contamination.test.ts` — 14 tests, 31 expect() calls, GREEN (0 fail)
- **Git commits:** (see below)
- **Type check:** clean (bun tsc --noEmit, exit 0)
- **bun test (targeted):** 14 pass / 0 fail (scripts test) + CONTAM-3/4/5 10 pass / 0 fail, REAUDIT-004/005 42 pass / 0 fail. Full-suite OOM = pre-existing Bun 1.3.13 issue, not caused by this task.
- **Tool count:** 157 — matches pre-task baseline
- **Scheduler count:** 79 cron.schedule entries — matches pre-task baseline

## [Developer] Repair Execution Record (LIVE)

- **Dry-run count:** 376 contaminated rows (pre-repair, live DB)
- **Rows repaired:** 376
- **All-zero rows skipped:** 116 (2026-05-30T11:47Z bulk-zeros defect — binding amendment, out of scope)
- **Post-repair remaining contaminated:** 0
- **Tickers affected:** 97 unique tickers, date range 2026-05-18 to 2026-06-12
- **Post-verify samples:**
  - FPT 2026-05-27: open=74500 (was 74.5), low=73800 (was 73.8), close=73600 (unchanged)
  - PVI 2026-05-18: open=79300 (was 79.3), low=79300 (was 79.3), close=81001 (unchanged), data_env preserved
  - TRA 2026-05-22: open=79000 (was 79.0), low=79000 (was 79.0), close=79000 (unchanged)
  - VNH: rows with close > 1000 repaired; VNH 2026-06-12 (close=1000.0 exactly) correctly excluded by heuristic (boundary: requires close > 1000, not ≥ 1000)
- **Execution window:** 2026-06-12T09:32:58Z (UTC) — within CONTAM-2 deployed, CONTAM-4 deployed guard live

## G12 DoD Gate Evidence

| Gate | Result |
|------|--------|
| bun test (targeted CONTAM + REAUDIT) | 52 pass / 0 fail |
| bun tsc --noEmit | exit 0 (clean) |
| Tool count | 157 (matches baseline) |
| Scheduler count | 79 cron.schedule (matches baseline) |
| Repair dry-run | 376 rows identified |
| Repair live-run | 376 rows normalized, 0 remaining |

---

## [QA] Review Record

- **Date:** 2026-06-12
- **Verdict:** APPROVED
- **Report:** reports/TASK_REPORT_CONTAM-6.md
- **DJ entry:** docs/agent-memory/decisions/sprint-OHLCV-UNIT-CONTAM-qa-contam6.md

### Live DB Checks (named volume vn-market-intelligence-mcp_market_data)

| Check | Result |
|-------|--------|
| (1) Contamination scan — 0 remaining (exact heuristic) | 0 rows PASS |
| (2a) VNH recent: same scale | Jun08-10 open=900/close=900 PASS |
| (2b) FPT recent: no 1000x gap | Jun09-10 clean range PASS |
| (3) TRA ~79000, PVI ~78000, DFF ~500 | All plausible PASS |
| (4) All-zero rows untouched | 116 PASS |
| (5) Script in scripts/ + dev-standards pointer | PASS |
| (6) pct-change VNH/FPT (< 30%) | 0.0% / 0.68% PASS |
| bun test (14 CONTAM-6 targeted) | 14 pass / 0 fail PASS |
| tsc --noEmit | exit 0 PASS |

### Scope Miss Findings (logged for follow-up — non-blocking)

- SM-1: VNH 2026-06-12 close=1000.0 exactly — strict `> 1000` boundary miss, 1 row unrepaired. Heuristic should be `>= 1000`. New ticket.
- SM-2: 460 pre-repair rows with low=0 pattern (open<100, close>1000, low=0) — outside binding amendment scope (low>0 guard). New ticket.
- SM-3: 59 today's rows same low=0 pattern — CONTAM-2 guard did not block. CONTAM-2 scope review needed.

None introduced by CONTAM-6. Task scope met per binding amendment and DoD.
