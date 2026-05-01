# Task Report: 1397b — Register vnIndexRefresh cron in jobs.ts
date: 2026-04-28
outcome: APPROVED

## Test Results
- Targeted tests (1397c suite): 5 passed / 0 failed — 100% coverage on vnIndexRefreshJob.ts
- Full suite: 7925 passed / 16 failed / 21 skipped
- 15-16 failures are pre-existing (circuit-breaker, VPS validation, Telegram mocks) — documented in 1397c report; none in 1397b files
- TypeScript: 0 errors in jobs.ts and vnIndexRefreshJob.ts (pre-existing errors in 1383 and 1395 test files only)
- Bun crash at process exit — known Bun v1.3.11 runtime bug, not a test failure

## DDD Compliance: PASS
- vnIndexRefreshJob.ts lives in `scheduler/market-data/` (interface layer)
- Imports only from `infrastructure/fetchers/hose.js` and `infrastructure/logger.js`
- jobs.ts wires interface→infrastructure via scheduler — correct layer
- No domain imports from infrastructure in any modified file

## Security: PASS
- No `process.env` usage in modified files (Bun.env only)
- No hardcoded credentials or API keys
- CRON_VN_INDEX_REFRESH env var override correctly implemented
- No SQL in vnIndexRefreshJob.ts (delegated to storeMarketPrices)

## Implementation Notes
- The developer left jobs.ts changes in stash@{0} (WIP on task/1395a-alert-batch-grouper) rather than a dedicated worktree branch
- vnIndexRefreshJob.ts was untracked on the working tree
- All 4 acceptance criteria steps applied from handoff spec: JSDoc entry, import, CRONS key, cron.schedule block
- Placement: after vpsServiceHealth block, before freshnessSlaMonitor block (per spec)

## Acceptance Criteria
- [x] CRONS.vnIndexRefresh key exists and defaults to '*/5 2-8 * * 1-5'
- [x] CRON_VN_INDEX_REFRESH env var overrides the default
- [x] Import resolves: runVnIndexRefreshJob imported from './market-data/vnIndexRefreshJob.js'
- [x] Cron block registered in startScheduler() with recordJobRun wrapping
- [x] Object.keys(CRONS).length now includes vnIndexRefresh
- [x] No TypeScript errors in modified files (bun run tsc --noEmit clean for 1397b files)
- [x] bun test passes at >= 7915 (7925 pass)

## Issues Found
### Blocking
None.
### Non-Blocking
- Pre-existing TSC errors in 1383-macro-alert-dispatch.test.ts and 1395-alert-batch-grouper.test.ts — not introduced by this task
- Pre-existing test failures (15-16 across circuit-breaker/VPS/Telegram mock tests) — not introduced by this task

## Merge Status
Committed to task/1395a-alert-batch-grouper branch. TASKS.md 1397b → DONE 2026-04-28.
vnIndexRefreshJob.ts and jobs.ts committed together as task(1397b).
