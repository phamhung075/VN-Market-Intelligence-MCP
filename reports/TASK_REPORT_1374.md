# Task Report: 1374+1375 — fix(ohlcv-aggregator-cron): shift default from 16:00 to 15:00 UTC
date: 2026-04-17
outcome: APPROVED

## Test Results

| Check | Result |
|-------|--------|
| Unit tests (1374-ohlcv-aggregator-cron.test.ts) | 2 pass / 0 fail |
| Full suite (task branch) | 5001 pass / 2 fail |
| Full suite (main pre-merge) | 4996 pass / 3 fail |
| Net regression delta | +1 fix (cron-registry count test now passes on branch) |
| Pre-existing failures | 1192 (evening-summary double-send) + 296 (OCR e2e) — both on main before merge |
| TypeScript | 0 errors |

## DDD Compliance: PASS

- No new domain/ imports from infrastructure/ or application/ introduced.

## Security: PASS

- No `process.env` introduced. No hardcoded credentials.

## Key Verification

| Item | Value |
|------|-------|
| `CRONS.ohlcvDailyAggregator` default (jobs.ts:135) | `'0 15 * * 1-5'` |
| `CRON_OHLCV_DAILY_AGGREGATOR` env override | supported via `Bun.env` |
| Comment in jobs.ts | "aggregate intraday ticks into daily_ohlcv at 15:00 UTC (22:00 VN) Mon-Fri" |
| Evening summary cron (unchanged) | `'30 22 * * 1-5'` (22:30 VN = 15:30 UTC) |
| Margin aggregator→summary | 30 min |

## Root Cause Fixed

`taSummary: []` in every evening report was caused by aggregator firing at 16:00 UTC (23:00 VN) — 30 minutes AFTER the 15:30 UTC evening summary. TA signals were never computed before the report ran. Shifting aggregator to 15:00 UTC gives 30 min lead time.

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Merge Status

Merged `task/1374-1375-ohlcv-aggregator-cron` → `main` (no-ff) 2026-04-17.
Branch deleted local + remote. Post-merge tsc: 0 errors. Post-merge task tests: 2/2 pass.
Sprint 130: COMPLETE.
