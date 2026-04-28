# Task Report: 1390 — OHLCV Volume Bug Fix (MAX volume, not COUNT ticks)
date: 2026-04-28
outcome: APPROVED

## Summary

`ohlcvDailyAggregatorJob.ts` was storing `COUNT(*)` of intraday poll records as
the daily volume instead of `MAX(volume)` from `market_prices_history`. Because
`market_prices_history.volume` holds the cumulative traded volume reported by the
exchange at each snapshot, the correct end-of-day value is the maximum (last
snapshot). The bug caused VIC to display as ~519.5K shares (number of poll ticks)
instead of ~5,194.9K shares (actual traded volume) — a ~10x undercount.

## Files Changed

- `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` (line 114–121)
  - Replaced `const volume = count` with a `SELECT MAX(volume)` query over the same window
  - Added explanatory comment about cumulative nature of exchange volume ticks
- `src/__tests__/1390-ohlcv-volume-unit.test.ts` (new — 3 regression tests)
- `src/__tests__/1358-ohlcv-aggregator.test.ts` (updated — 2 assertions)
- `src/__tests__/1277-ohlcv-guard-checks.test.ts` (updated — 1 assertion)

## Test Results

- Targeted (1390-ohlcv-volume-unit.test.ts): 3 / 3 pass
- Targeted (1358-ohlcv-aggregator.test.ts): 5 / 5 pass
- Targeted (1277-ohlcv-guard-checks.test.ts): 6 / 6 pass
- Targeted total: 14 / 14 pass
- Full suite: 7905 pass / 6 fail / 7932 total
- Pre-existing failures: 6 (unchanged — confirmed present on main before merge)
- Baseline delta: +3 tests vs pre-1390 main (new regression test file)
- TypeScript: 2 pre-existing errors in `1383-macro-alert-dispatch.test.ts` only (unchanged)

## DDD Compliance: PASS

- Changed file (`ohlcvDailyAggregatorJob.ts`) is in `src/scheduler/market-data/` — interface/scheduler layer
- No domain→infrastructure imports introduced
- SQL change is pure infra — no domain logic affected

## Security: PASS

- No `process.env` usage — `Bun.env` used throughout file
- All SQL uses parameterized queries (existing pattern preserved)
- No hardcoded credentials or secrets
- No new `any` types introduced

## Spot Check

- Local `data/market.db` has pre-fix data (volume 423K for VIC 2026-04-24)
- `market_prices_history` in local dev DB has only 1 historic record (dev environment)
- Production data lives in Docker container — fix will take effect on next scheduled OHLCV aggregation run
- Unit tests confirm MAX(volume) = 5,194,900 for a 3-tick VIC scenario (not 3)

## Issues Found

### Blocking
None.

### Non-Blocking
- Local `data/market.db` daily_ohlcv rows pre-date the fix; they will be corrected
  on next aggregator run via ON CONFLICT DO UPDATE upsert.

## Merge Status

APPROVED — merged to main via merge commit `0b0e4e67` on 2026-04-28.
Branch `task/1390-volume-decimal-fix` deleted after merge.
