# Task Report: 1400 — Centralise VN_OFFSET_MS (Pass 1 of 2)
date: 2026-04-28
outcome: APPROVED

## Test Results
- Targeted tests (1400-db-isolation.test.ts): 3 pass / 0 fail
- Full suite: 7538 pass / 120 fail / 21 skip
- Baseline for this branch: ~7538-7542 pass / 120 fail (confirmed in TASK_REPORT_1394 and via git stash isolation)
- Developer-stated baseline (7926/15) was from a prior cycle — actual branch baseline is 7538/120
- TypeScript: pre-existing errors in 1348a and 1397c test files (unchanged by this task); 0 errors in task-1400 changed files

## DDD Compliance: PASS
- `timeConstants.ts` placed in `domain/services/` — correct layer, no imports, pure constants
- `infrastructure/logger.ts` imports from `domain/services/timeConstants.js` — allowed direction
- `interface/scheduler/` files import from `domain/services/timeConstants.js` — allowed direction
- No domain→infrastructure violations

## Security: PASS
- No `process.env` usage in changed files
- No hardcoded credentials
- No SQL queries in changed files

## Issues Found

### Blocking
None introduced by this task.

### Non-Blocking
- 120 pre-existing test failures (all environmental — worktree missing `data/` directory; confirmed via git stash isolation)
- Pre-existing TS errors in `1348a` and `1397c` test files (not touched by this task)

## Files Changed
- `apps/mcp-server/src/domain/services/timeConstants.ts` — added `export const VN_OFFSET_MS = 7 * 3600_000`
- `apps/mcp-server/src/infrastructure/logger.ts` — replaced inline `7 * 60 * 60 * 1000` with import
- `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` — replaced inline with import
- `apps/mcp-server/src/scheduler/market-data/ohlcvStalenessCheckJob.ts` — replaced inline with import

## Merge Status
MERGED to main. Branch `worktree-agent-ac1574d7` deleted. Worktree removed.
Pass 2 of 2 remains: 13 remaining inline occurrences in application usecases, server.ts, and test files.
