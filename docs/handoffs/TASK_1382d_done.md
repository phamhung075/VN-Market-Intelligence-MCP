# TASK-1382d DONE — signalOutcomeJob.ts — Daily Post-Close Resolver

**Status:** COMPLETE
**Branch:** task/1382d-signal-outcome-job
**Commit:** 6da7ff06

---

## What Was Built

### New file: `apps/mcp-server/src/scheduler/alerts/signalOutcomeJob.ts`

Exports:
- `SignalOutcomeJobDeps` — injectable `db` + `nowFn`
- `SignalOutcomeJobResult` — `{ evaluated, confirmed, false_positive, skipped }`
- `runSignalOutcomeJob(deps?)` — core async function
- `runSignalOutcomeJobCron()` — production cron wrapper (wired by 1382c)

Logic:
1. Queries `agent_signals` WHERE `(outcome IS NULL OR outcome = 'fired')` AND `created_at >= datetime('now', '-2 days')`
2. Per row: skips if no `stock_code`; fetches baseline price (±15 min around `created_at`) and resolution price (+240 to +270 minutes) from `market_prices_history`
3. Skips if either price window returns no data
4. Infers direction: `ta_overbought` / `price_anomaly(direction=down)` → bearish; everything else → bullish
5. Resolution: `abs(pct) < 1.0` → confirmed; pct in expected direction ≥ 1.0 → confirmed; pct against expected direction ≥ 1.0 → false_positive
6. Calls `recordOutcome(db, id, outcome, detail)` from `agentSignalStore.ts`

### Key fix found during implementation

SQLite `datetime()` does not accept combined modifiers like `'+4 hours 30 minutes'` — it returns `null` silently. Fixed by using `'+240 minutes'` / `'+270 minutes'` for the resolution window bounds.

### New test file: `apps/mcp-server/src/__tests__/1382-signal-outcome-job.test.ts`

8 tests (AC-1 through AC-8):
- AC-1: no pending rows → all zeros
- AC-2: market-wide signal (no stock_code) → skipped
- AC-3: stock_code present but no price data → skipped
- AC-4: bullish + price rose ≥1% → confirmed
- AC-5: bullish + price fell ≥1% → false_positive
- AC-6: flat move (<1%) → confirmed
- AC-7: already confirmed → not re-evaluated
- AC-8: outcome='fired' → re-evaluated and upgraded

All 8 pass. 0 regressions on related files.

---

## For QA

- File: `apps/mcp-server/src/scheduler/alerts/signalOutcomeJob.ts`
- Tests: `apps/mcp-server/src/__tests__/1382-signal-outcome-job.test.ts`
- Run: `bun test src/__tests__/1382-signal-outcome-job.test.ts` from `apps/mcp-server/`
- Expected: 8 pass, 0 fail
- Baseline before this task: 7880 passing (per handoff spec)

---

## Depends On / Blocks

- Depends on: TASK-1382b (notifier writes 'fired'; this job reads 'fired' + NULL rows)
- Blocks: TASK-1382c (cron wiring — requires this file to exist and export `runSignalOutcomeJobCron`)
