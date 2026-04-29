# Task Report: 1426a — Market Earning Yield (Báu Phase 2, Dinh Gia Tier 1)
date: 2026-04-29
outcome: APPROVED

## Test Results
- Unit tests (targeted 1570a): 11 passed / 0 failed (100% line + function coverage on domain fn)
- Full suite: 8207 passed / 6 failed / 38 skipped
- Baseline on main before merge: 8184 passed / 18 failed — task branch reduces failures, zero regressions introduced
- TypeScript: 1 pre-existing error in `src/__tests__/089-tool-macro.test.ts` (maxDepositRatePct — TS2353), not touched by this branch (confirmed via `git diff main...task/1426a`)

## DDD Compliance: PASS
- `marketEarningYield.ts` is a pure domain function: zero imports from `infrastructure/`, `bun:sqlite`, or any DB layer
- Application use-case `computeMarketEarningYield.ts` correctly lives in `application/usecases/` and imports domain fn + infra DB
- Cron job `marketEarningYieldJob.ts` lives in `scheduler/macro/` and calls application layer only

## Security: PASS
- All SQL uses `.prepare<T, Params>()` with typed parameter arrays — no string interpolation
- No `process.env` usage — all config via `Bun.env` (CRON_MARKET_EARNING_YIELD in cronConfig.ts)
- No hardcoded credentials or secrets

## Coverage Guard Verified
- Domain fn refuses when coverage < 70% and returns `{ refused: true, coverageRatio, coverageCount }`
- Edge cases tested: empty input, totalWatchlist=0, exact boundary (20/30 = 66.7%), exact pass (21/30 = 70%), single ticker

## Issues Found
### Blocking
None.

### Non-Blocking
- Pre-existing TSC error in 089-tool-macro.test.ts (maxDepositRatePct unknown on SbvMacroSnapshot) — not introduced by this branch

## Files Added
- `apps/mcp-server/src/domain/services/macro/marketEarningYield.ts` — pure domain fn
- `apps/mcp-server/src/application/usecases/computeMarketEarningYield.ts` — use-case with DB read/write
- `apps/mcp-server/src/scheduler/macro/marketEarningYieldJob.ts` — cron job wrapper
- `apps/mcp-server/src/__tests__/1570a-market-earning-yield.test.ts` — 11 unit tests

## Files Modified
- `apps/mcp-server/src/domain/services/macro/index.ts` — re-exports new types + fn
- `apps/mcp-server/src/scheduler/macro/index.ts` — re-exports runMarketEarningYieldJob
- `apps/mcp-server/src/scheduler/cronConfig.ts` — adds CRONS.marketEarningYield (30 9 * * 1-5)
- `apps/mcp-server/src/scheduler/startScheduler.ts` — registers new cron job

## Merge Status
MERGED to main via --no-ff. Branch task/1426a-market-earning-yield deleted.
