# Task Report: 1407 — foreignFlow CB Three-Fix
date: 2026-04-28
outcome: APPROVED

## Test Results
- Targeted (1407 + 1337-infra + 1352b + FIX-foreign-flow-cb): 37 passed / 0 failed
- Full suite: 7849 passed / 36 failed / 21 skip / 13 errors
- TypeScript: 0 errors in 1407-specific files (pre-existing errors in unrelated files)

## DDD Compliance: PASS
- foreignFlowFetcherJob.ts is in scheduler/ (interface-adjacent) — imports from domain/services (tradingWindow) are correct
- Zero domain/ → infrastructure/ import violations

## Security: PASS
- No hardcoded credentials
- No process.env (Bun.env only)
- No SQL in changed files

## Issues Found

### Blocking (resolved before merge)
1. `1407-foreign-flow-cb-fixes.test.ts` line 91: assertion `failuresAfter > failuresBefore` was wrong.
   Since Task 1392, `breakers.foreignFlow` no longer wraps the HTTP fetcher call — it only wraps
   DB writes in the push handler. The test incorrectly assumed CB failures increment via
   `runForeignFlowFetcherJob`. Fixed: replaced with correct cron gate test (outside window →
   `runForeignFlowFetcherJobCron` returns immediately, CB unchanged).

2. `FIX-foreign-flow-cb.test.ts` line 107: regex `29[0-9]s|300s|5 min` was stale.
   After Task 1407 increased `resetTimeoutMs` to 600_000, the diagnose tool now reports ~600s.
   Fixed: updated regex to `59[0-9]s|600s|10 min`.

3. `circuitBreakerRegistry.ts` cherry-pick conflict: worktree branch was forked before Task 1388
   added `halfOpenMaxAttempts: 1` to foreignFlow CB. Resolved: merged both 1388 and 1407 changes —
   `resetTimeoutMs: 600_000` + `halfOpenMaxAttempts: 1`.

### Non-Blocking
- 36 pre-existing test failures (026, 027, 034, 1027, FIX-1296, 1343e, 1398, etc.) — unrelated to 1407
- 3 pre-existing tsc errors (server-startup.js, pushPricesHandler.js in stash; 1383/1397c test types)

## Merge Status
MERGED to main. Branch fix/1407-foreign-flow-cb + worktree removed.
Deadline: Mon 2026-04-29 02:00 UTC — MET.
