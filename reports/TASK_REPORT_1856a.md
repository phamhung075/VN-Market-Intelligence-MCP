# Task Report: 1856a — FIX vnstock_events NOT NULL constraint on code column
date: 2026-05-08
outcome: APPROVED

## Test Results
- Unit tests (1856a): 11 pass / 0 fail
- Full suite: 8995 pass / 11 fail (all 11 pre-existing, unrelated to this task)
- TypeScript: 0 errors on changed files. 9 pre-existing errors in unrelated files.

## DDD Compliance: PASS
- infrastructure/db/vnstockStore.ts — correct layer (infrastructure)
- domain/ imports are type-only (allowed: infra depends on domain types)
- No domain files modified

## Security: PASS
- SQL uses parameterized queries (?, ?, ?, ?, ?, ?)
- No process.env — Bun.env pattern used elsewhere in file
- No hardcoded credentials

## Changes Reviewed
- `apps/mcp-server/src/infrastructure/db/vnstockStore.ts` line 741-773: Array.isArray guard + null/empty code filter before INSERT. Dropped rows logged via logger.warn.
- `apps/mcp-server/src/__tests__/1856a-vnstock-events-null-code.test.ts`: 11 tests covering AC-1 (non-array guard), AC-2 (null-code filter), AC-3 (valid rows preserved), AC-4 (warn message format).

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
Merged: task/1856a-vnstock-events-null-code → main
Branch deleted: pending (task branch left for cleanup per dev-standards)
docs/TASKS.md: 1856a moved to Done
