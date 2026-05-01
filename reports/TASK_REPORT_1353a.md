# Task Report: 1353a — imfIndicatorPollerJob DI overload + 8 gap tests
date: 2026-04-27
outcome: APPROVED

## Test Results
- Unit tests (1353a targeted): 8 passed / 0 failed
- Full suite: 7679 pass / 4 fail / 21 skip
- TypeScript: pre-existing errors in 1348a + 1352b test files only — zero new errors introduced by 1353a

## Pre-existing Failures (unchanged vs main)
1. `1294b-bctc-timeout-fallback.test.ts` — RED 8: E2E OCR overwrites news_inference (timing-sensitive, existed on main)
2. `317-telegram-routing-bugs.test.ts` — Bug A watchdog notifyUser (2 cases, existed on main)
3. `1288-foreign-flow-fallback.test.ts` — cached data with source='cache' when primary times out (existed on main)

All 4 pre-existing failures confirmed identical on main branch before merge.

## DDD Compliance: PASS
- `imfIndicatorPollerJob.ts` lives in `interface/scheduler/` — correct layer
- No domain→infrastructure imports in changed files
- Production file imports from `application/services/` and `domain/services/` only — correct

## Security: PASS
- No `process.env` — uses `Bun.env` (existing pattern)
- No hardcoded secrets or credentials
- No SQL (scheduler job only)

## Production Change Verification: MINIMAL
- Only change: optional `options?: ImfPollerOptions` parameter added
- Default behaviour: all three functions fall back to existing hardcoded imports when `options` is undefined
- Zero behaviour change when called without options (production cron path unchanged)
- New `ImfPollerOptions` interface exported — additive only

## Coverage
- `imfIndicatorPollerJob.ts`: 100% function coverage, 100% line coverage

## Merge Status
- Branch `task/1353a-imf-poller-job-gaps` merged to main via no-ff merge commit
- Branch deleted post-merge
- TASKS.md updated: 1353a added to Done
