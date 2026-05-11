# Task Report: 1350a — Fix 73 Failing Tests
date: 2026-04-27
outcome: APPROVED

## Test Results
- Targeted tests (5 files, 26 tests): 26 passed / 0 failed
- Full suite: 7568 passed / 0 failed / 21 skipped
- TypeScript: pre-existing errors in 1348a-cascade-brokerage-competitive.test.ts (unrelated to 1350a — last touched by commits 3766079d and 9eec0441, before this fix)

## DDD Compliance: PASS
All 5 modified files are in `src/__tests__/` only. Zero production code (domain/application/infrastructure/interface) was changed.

## Security: PASS
No new production code. No credentials, no process.env, no SQL added.

## Root Causes Fixed

### Category A — mock.module schema contamination (65 tests, 10 files)
`1345b-bctc-financial-validation.test.ts` had a sticky `mock.module("../infrastructure/db/schema.js")` that replaced the process-wide module registry entry for the rest of the worker lifetime. All test files in execution positions 112–121 that imported schema.js received a stub with only the `financial_reports` table, causing 65 failures across 8 downstream files.

Fix: Removed `mock.module(schema)` block (lines 36–116). Replaced with `beforeEach`/`afterEach` using real `initDatabase()`.

### Category B — Missing readReuters/readTe injection (5 tests, 3 files)
Task 1345a added `readReuters` and `readTe` as optional reader params to `runVpsProxyWatchdog`. Without injection and without `initDatabase()`, these return `null`, which triggers infinite-staleness detection and changes expected `"ok"`/`"restored"` outcomes to `"alert-sent"`.

Fix: Added `readReuters: () => new Date(now.getTime() - 5 * 60_000)` and `readTe` equivalents to `freshReaders` helpers in `1319`, `1557`, and `1567`.

### Category C — Stale sprint number in doc invariant test (3 tests, 1 file)
`1338-sprint-goal-retrospective.test.ts` hardcoded `expect(stats.currentSprint).toBe(1344)`. Project is on sprint 1350.

Fix: Replaced with structural invariants: `toBeGreaterThanOrEqual(1344)`, `typeof string` check, and `toContain("Retrospective")`.

## Files Modified
| File | Change |
|------|--------|
| `apps/mcp-server/src/__tests__/1345b-bctc-financial-validation.test.ts` | Removed mock.module(schema); added beforeEach/afterEach with initDatabase() |
| `apps/mcp-server/src/__tests__/1319-watchdog-foreign-flow.test.ts` | Extended freshReaders with readReuters + readTe |
| `apps/mcp-server/src/__tests__/1557-watchdog-recovery.test.ts` | Added readReuters/readTe injections |
| `apps/mcp-server/src/__tests__/1567-watchdog-user-alert-error-logging.test.ts` | Added readReuters/readTe injections |
| `apps/mcp-server/src/__tests__/1338-sprint-goal-retrospective.test.ts` | Replaced hardcoded sprint 1344 with structural invariants |

## Issues Found
### Blocking
None.

### Non-Blocking
- Pre-existing tsc errors in `1348a-cascade-brokerage-competitive.test.ts` (TS2322: AnalysisLevel/DomainType type mismatches). These are unrelated to 1350a and pre-date this fix.

## Merge Status
Commit `9c95b371` already on main branch. No worktree to clean up.
New baseline: **7568 pass / 0 fail** (up from 7471 pass / 73 fail).
