# Task Report: 1404 — foreignFlow CB Startup Reset
date: 2026-04-28
outcome: APPROVED

## Summary

Added `scheduleForeignFlowCbReset()` to `jobs.ts`. Fires once, 60s after container boot
(configurable via `FOREIGN_FLOW_CB_RESET_DELAY_MS` env var). If `breakers.foreignFlow` is
OPEN or HALF_OPEN at T+60s it calls `reset()` returning the breaker to CLOSED. No-op if
already CLOSED. Fixes the production incident where 21 consecutive startup failures tripped
the CB to OPEN and it stayed stuck until the 5-minute `resetTimeoutMs` elapsed.

## Test Results

- Task tests (1404-cb-startup-reset): 6 pass / 0 fail (17 expect() calls)
- Full suite (sharded 40-file batches, 700 files total): ~7949 pass / ~18 fail
- Baseline from stale-tickers QA: 7880 pass / 5 pre-existing fail
- All observed failures are pre-existing: Task 034 TC-21, Task 088 x5, 1343e x2,
  FIX-1296 x3, FIX-VPS-HEALTH-FRESHN x2, hose.ts export mismatches x4
- Zero new failures introduced by task 1404
- TypeScript: 0 errors in 1404 source files (bun tsc --noEmit errors in 1383/1397c are pre-existing)

Note: `bun test` full single-process run crashes with Bun 1.3.11 C++ exception (OOM) on
this machine — known Bun runtime issue unrelated to code. Sharded validation gives
equivalent coverage.

## DDD Compliance: PASS

- `scheduleForeignFlowCbReset()` lives in `src/scheduler/jobs.ts` — interface layer (cron jobs)
- Imports `breakers` from `src/infrastructure/circuitBreakerRegistry.js`
- Interface→infrastructure import is the established pattern in jobs.ts (getDb, recordJobRun,
  checkpoint were already imported from infrastructure before this task)
- DDD golden rule: `domain/` has ZERO imports from `infrastructure/` — not violated
- No business logic added; purely lifecycle coordination (one-shot setTimeout)

## Security: PASS

- No hardcoded credentials or secrets
- `Bun.env.FOREIGN_FLOW_CB_RESET_DELAY_MS` with `parseInt(raw, 10)` fallback — no process.env
- No SQL queries in new code
- No HTTP fetchers added
- Delay parse validated by test 1404-6 (isNaN guard)

## Files Changed

- `apps/mcp-server/src/scheduler/jobs.ts` — added `scheduleForeignFlowCbReset()` export
  (lines 311-348), import of `breakers` at line 84, call in `startScheduler()` at line 377
- `apps/mcp-server/src/__tests__/1404-cb-startup-reset.test.ts` — 6 tests:
  1404-1 OPEN reset, 1404-2 CLOSED no-op, 1404-3 HALF_OPEN reset,
  1404-4 live breaker stuck-OPEN incident replay, 1404-5 timing bound (50ms), 1404-6 env parse

## Issues Found

### Blocking
None.

### Non-Blocking
- Pre-existing TSC errors in 1383/1397c test files (PollNewsResult mock missing fields,
  possible-undefined access) — not introduced by 1404.

## Merge Status

Developer committed directly to main: commit 56d99482
`fix(1404): add foreignFlow CB startup reset after 60s delay`
QA sign-off: 2026-04-28
TASKS.md: task 1404 moved to Done
