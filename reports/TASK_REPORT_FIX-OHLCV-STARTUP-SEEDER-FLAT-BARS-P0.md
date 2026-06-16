# Task Report: FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0
date: 2026-06-16
qa_cycle: cycle-280
outcome: APPROVED

## Changed Files
- `apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts` — flat seed-bar guard added (lines ~221-248) + injectable fetchFn option
- `apps/mcp-server/src/__tests__/FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0.test.ts` — 395L, 8 test cases

## Test Results
- Fix-specific suite: 8 pass / 0 fail (316ms, bun test v1.3.13)
- OHLCV companion suites (CONTAM-5, ALLZERO-OHLCV-FETCH, FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0, FIX-OHLCV-STRANDED-ROWS-REPAIR-P1, 1842b): 44 pass / 0 fail
- Additional OHLCV suites (CONTAM-7, 1970-ta-ohlcv-backfill, 1352-ohlcv-startup-probe): 60 pass / 0 fail
- TypeScript: `bunx tsc --noEmit` exit 0, 0 errors

## DDD Compliance: PASS
`ohlcvBackfill.ts` is in `infrastructure/fetchers/`. Imports:
- `./browserHeaders.js` (same infra layer)
- `../envCheck.js` (same infra layer)
- `../../domain/services/market-data/ohlcvUnitGuard.js` (domain — permitted: infra imports domain)
No domain→infra violation. No application→domain→infra cycle.

## Security: PASS
- No `process.env` (Bun.env pattern not present in this file; VNDirect URL is a constant string, not env)
- All SQL parameterized (prepared statements with `?` placeholders)
- No hardcoded credentials or secrets
- mock-guard: EXIT 0 PASS

## Gate Analysis

### G1 — Generic predicate (/goal#2): PASS
Guard predicate at `ohlcvBackfill.ts:237-248`:
```
vol === 0 && norm.open === norm.high && norm.high === norm.low && norm.low === norm.close
```
- Zero ticker allowlist
- Zero date literal
- Zero per-instance branch in the executed path
- Applied after `normalizeOhlcvToVnd` so thousand-scale flat bars (DCR 5.9→5900, still flat post-normalize) are caught
- Same shape as `purgeStrandedSeedRows()` — consistent predicate semantics

### G2 — Coverage: PATH-BOUNDED (reviewer explicit finding, non-blocking per task scope)
This fix closes the `ohlcvBackfill.ts` inflow path only. Full startup write-path audit:

**Startup INSERT paths into `daily_ohlcv`:**
1. `startScheduler.ts` → `purgeStrandedSeedRows(db)` — DELETE only, no INSERT
2. `startScheduler.ts` → `runOhlcvStartupProbe()` → `runOhlcvBackfill(db)` — **THIS FIX APPLIES HERE**
3. `startScheduler.ts` → `runOhlcvDailyAggregator()` — cron, 15:00 UTC (not startup); routes through `writeOhlcvBatch` with FR-S1 (APPROVED at d4b532be)
4. `pushPricesHandler.ts` → `writeOhlcvBatch(ohlcvRows, db, {conflictStrategy:'intraday'})` — VPS real-candle push; FR-S1 fires on vol=0 AND O=H=L=C (live non-zero volumes so not hit)
5. `taOhlcvBackfillJob.ts` → `writeOhlcvBatch(writeRows, db, {conflictStrategy:'backfill'})` — 01:30 UTC cron; routes through SSOT choke-point with FR-S1
6. `ohlcvForeignFlowStore.ts` — INSERT into ohlcv_foreign_flow sub-table, not daily_ohlcv

**The `ohlcvBackfill.ts` path (path 2) was the ONLY startup INSERT that bypassed FR-S1.** It used its own `db.transaction()` with a raw `INSERT OR IGNORE`, not routing through `writeOhlcvBatch`. This fix adds the shape guard inline in that transaction. After this fix, every non-daily-aggregator INSERT into `daily_ohlcv` routes through either: (a) this guard in `ohlcvBackfill.ts`, or (b) `writeOhlcvBatch` with FR-S1.

**Residual gap (pre-existing, out of scope):** `taOhlcvBackfillJob.ts` runs at 01:30 UTC on weekdays — not startup. Its writeOhlcvBatch FR-S1 has a `date >= vnToday` constraint (not a pure shape predicate), so historical flat bars on older dates pass through, relying on `validateOhlcvUnit` to catch all-zero. This is a separate, scoped concern and NOT triggered by the startup boot sequence; its historical coverage is bounded by the existing `purgeStrandedSeedRows()` purge at each boot.

### G3 — Regression test rigor: HONEST SCOPE
The test exercises `runOhlcvBackfill()` directly with an injectable `fetchFn`. This is a **function-level test of the real write path** — it calls the exact production function with a mock VNDirect fetcher. 8 cases:
- TC-1 (primary): startup probe feed of flat vol=0 O=H=L=C rows → 0 rows written for today
- TC-2: thousand-VND flat seed (5.9→5900 after normalize) → not written
- TC-3: full-VND flat seed (25700=25700 vol=0) → not written
- TC-4: all-zero flat seed (DAG 0=0=0=0 vol=0) → not written
- TC-5: real candle (vol>0, varied OHLC) → written (safety guard)
- TC-6: historical real candle (past date, vol>0) → written
- TC-7: mixed — flat seeds rejected, real candle + halt-day (O=H=L=C vol>0) written
- TC-8 (boot sequence): `purgeStrandedSeedRows` + `runOhlcvBackfill` combined → 0 flat bars, real candle intact

**What "green" proves:** the guard correctly rejects all flat-seed shapes (thousand-scale, full-VND, all-zero, DAG class), does not accidentally reject halt-day candles (vol>0 discriminator), and does not reject real traded candles. The test does NOT cover the Docker container boot end-to-end (REBUILD_REQUIRED:yes — this is expected per task scope; the router holds live-DB done_verified until post-rebuild probe).

**MUST FAIL on pre-fix code:** YES. Removing lines 237-248 would cause TC-1 through TC-4, TC-7, TC-8 to fail (flat bars would be written; `countFlatSeedBarsForToday(db)` > 0).

### G4 — No-fake-data + consumer-safety (/goal#1): PASS
Option (b) leaves a gap — NO row written for today's date for illiquid tickers. Downstream consumer behavior:
- **RSI/MACD/BB alert scans**: read daily_ohlcv with `date <= today ORDER BY date DESC LIMIT N`. A missing today-row returns N rows of real historical data → valid TA computation (not single-digit RSI)
- **pushPricesHandler (VPS real-data push)**: writes today's row via `writeOhlcvBatch` when real prices arrive → fills the gap with real data
- **taOhlcvBackfillJob (01:30 UTC)**: re-fetches and writes rows for sparse tickers — fills the gap for tickers that were genuinely traded
- **Dashboard / franceSummaryJob**: if no today-row, ticker skipped from "top movers" (graceful absence is correct per /goal#1; a fake 0 is not)
- **Crash risk**: zero — all consumers do `WHERE code=? ORDER BY date DESC LIMIT N`; missing row = shorter series, not null panic

A gap producing "no RSI for illiquid ticker X" is acceptable (/goal#1). A fake 0-vol O=H=L=C row producing single-digit RSI and "giá 0 dưới BB" alerts is NOT.

### G5 — Full suite: PASS (with known pre-existing exceptions)
- `bun test FIX-OHLCV-STARTUP-SEEDER-FLAT-BARS-P0.test.ts`: 8/0 pass
- `bunx tsc --noEmit`: exit 0, 0 errors
- OHLCV companion suites: 104 pass / 0 fail across 8 test files
- Bun v1.3.13 end-of-full-suite C++ OOM crash: pre-existing runtime bug (cycles 265/267/279); exit 0 before crash, not a fail
- REBUILD_REQUIRED:yes — ops must rebuild before live-DB flat-seed=0 can be confirmed post-boot

## Issues Found

### Blocking
None.

### Non-Blocking
- The `taOhlcvBackfillJob.ts` FR-S1 guard uses `date >= vnToday` (not a pure shape predicate). Historical flat bars on older dates pass its shape guard and rely on `validateOhlcvUnit` (which catches all-zero via Rule 1). This is pre-existing behavior, not introduced by this fix, and not in scope of P0. The live boot-sequence coverage is complete.
- `ohlcvBackfill.ts` still uses its own raw `INSERT OR IGNORE` transaction rather than routing through `writeOhlcvBatch`. The flat-seed guard is applied inline. This is architecturally suboptimal (two guard locations vs one SSOT choke-point) but is a scoped future cleanup, NOT a blocking issue for this P0 fix.

## Verdict: APPROVED
Code is correct, generic, safe. Guard closes the specific write path identified as the boot-time flat-seed inflow. Regression test suite is honest about scope. Consumer-safety on gap is sound. REBUILD_REQUIRED:yes — router holds `done_verified` until live post-rebuild probe confirms flat-seed=0 for today after the next boot.
