# Task Report: 1391 — stale-lock test regression fix (1221-weekly-report-db-lock.test.ts)
date: 2026-04-17
outcome: APPROVED

## Commit Reviewed
dc5b456 — fix(test): seed VCB position in stale-lock test to bypass early-return guard

## Change Summary
+5 lines in `src/__tests__/1221-weekly-report-db-lock.test.ts`.
No production code changed.
Root cause: stale-lock integration test seeded no positions → early-return guard (`no open positions → skip send`) fired before `sendFn` → `sendCalled` stayed `false` → assertion failed.
Fix: insert one open VCB row in that test's DDL setup, same pattern as Sprint 138 B3 fix.

## Test Results

| Scope | Pass | Fail |
|-------|------|------|
| Targeted (1221-weekly-report-db-lock.test.ts) | 14 | 0 |
| Full suite | N/A — pre-existing Bun LanceDB C++ crash (exit 132) on full run, confirmed present on parent commit before dc5b456 — not introduced by this fix |
| TypeScript `bun tsc --noEmit` | 0 errors | — |

## DDD Compliance: PASS
- Import `from "../infrastructure/db/schedulerLockStore.js"` is in test file (acceptable — integration test).
- No domain layer imports infrastructure.

## Security: PASS
- `process.env["DB_PATH"] = ":memory:"` at line 11 is pre-existing test-isolation override, not introduced by this commit.
- No new env reads, no hardcoded credentials, SQL uses parameterized bindings (`.run("VCB", 100, 83000, "2025-01-01T00:00:00Z")`).

## Issues Found

### Blocking
None.

### Non-Blocking
- Pre-existing Bun crash (exit 132 / C++ exception in LanceDB) on full suite. Affects all runs on this machine. Unrelated to task 1391. Tracked separately.

## Files Confirmed Clean
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1221-weekly-report-db-lock.test.ts

## Merge Status
Fix already committed to main (dc5b456). No branch to merge.
