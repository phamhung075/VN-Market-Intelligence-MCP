# Task Report: 1794 — EOD Vol/RSI Populated
date: 2026-04-30
outcome: APPROVED

## Test Results
- Unit tests (1794 file): 19 passed / 0 failed
- Full suite: 8463 passed / 0 failed
- TypeScript: 0 errors

## DDD Compliance: PASS
- `assembleEveningSummary.ts` is in `application/usecases/` — correct layer for orchestration
- `eveningSummaryJob.ts` is in `interface/scheduler/` — correct layer for formatting/output
- SQL changes use existing parameterized query patterns — no raw string interpolation

## Security: PASS
- SQL volume column added via COALESCE in existing parameterized prepare() calls — no injection risk
- No process.env, no hardcoded credentials

## Issues Found
### Blocking
None

### Non-Blocking
- `[assembleEveningSummary] globalSnapshot step failed — no such table: commodity_prices` in test logs.
  This is a pre-existing warn (test DB has no commodity_prices table); gracefully caught, does not affect Vol/RSI output. Non-blocking.

## Acceptance Criteria Verified
- AC-1: `formatMoversSection` renders `Vol: 7.0M` for volume 7_000_000
- AC-2: `formatMoversSection` renders `RSI: 58.3` for rsi14 58.3
- AC-3: Both Vol and RSI appear on same ticker line
- AC-4: `Vol: N/A` when volume is undefined
- AC-5: `RSI: N/A` when rsi14 is null or undefined
- AC-6: Volume formatted as human-readable — M/K suffixes with 1 decimal
- AC-7: RSI formatted to 1 decimal place (toFixed(1))
- AC-8: Backward compat — `{ code, changePct }` only callers unaffected
- AC-9: `assembleEveningSummary` populates `WatchlistMover.volume` from `market_prices.volume`
- AC-10: `assembleEveningSummary` populates `WatchlistMover.rsi14` from `computeTaFn` result; null when TA unavailable
- Format string: `CODE: +X.XX% | Vol: X.XM | RSI: X.X` confirmed in AC-3 test

## Merge Status
Merged to main as part of 1786+1788+1794 merge commit. Branch `task/1794-eod-vol-rsi` deleted.
