# Task Report: 1372+1373 — fix(france-test-fixtures): update stale makeDb() in 5 test files + fix schedulerFileCount
date: 2026-04-17
outcome: APPROVED

## Test Results

| Scope | Pass | Fail | Skip |
|---|---|---|---|
| 5 fixture files (isolated) | 35 | 0 | 0 |
| 1190 pipeline-watchdog (isolated) | 16 | 0 | 0 |
| Full suite (this branch) | 4997–4998 | 1–2* | 20 |
| Full suite (main baseline) | 4981 | 18 | 20 |
| TypeScript | 0 errors | — | — |

*Variance 1–2 across runs is pre-existing flakiness in unrelated tests (network mocks, parallel isolation). The 17 fixture failures introduced before this task are all resolved.

## schedulerFileCount Assertion

- Test asserts: `schedulerFileCount === 34`
- Actual `src/scheduler/*.ts` count: **34**
- Status: CORRECT

## DDD Compliance: PASS

- `src/domain/` has zero actual imports from `infrastructure/` or `application/`
- Comments referencing infrastructure paths are not import statements

## Security: PASS

- No `process.env` usage in `src/` production code
- No hardcoded credentials

## Changes Made (branch diff vs main)

| File | Change |
|---|---|
| `src/__tests__/1290-france-summary-job.test.ts` | Added `market_prices_history` + `watchlist` + `daily_ohlcv` tables to `makeDb()`; inserted 2 history rows per ticker |
| `src/__tests__/1316-france-summary-rewrite.test.ts` | Same schema additions |
| `src/__tests__/1344-france-summary-stale-alerts.test.ts` | Same schema additions |
| `src/__tests__/1348-france-summary-cron-window.test.ts` | Same schema additions |
| `src/__tests__/1364-france-ta-detail.test.ts` | Same schema additions |
| `src/__tests__/1190-pipeline-watchdog.test.ts` | Updated `schedulerFileCount` assertion: 32 → 34 |
| `TASKS.md` | Tasks 1372+1373 moved to Review |

## Root Cause

Sprint 128 (`fetchTopMovers`) changed the query source from `market_prices` to `market_prices_history INNER JOIN watchlist`. Five existing test files still seeded via `INSERT INTO market_prices` only, causing all france-summary tests to fail. This fix propagates the correct schema to all five fixtures.

## Issues Found

### Blocking
None.

### Non-Blocking
- 1 pre-existing failure remains in full suite (present on `main` before this branch; not introduced here)

## Merge Status

MERGED to main via `--no-ff`. Branch `task/1372-1373-france-test-fixtures` deleted.
