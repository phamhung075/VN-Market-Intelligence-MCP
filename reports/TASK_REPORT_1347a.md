# Task Report: 1347a — Test DB Isolation
date: 2026-04-27
outcome: APPROVED

## Test Results
- Targeted suite (1347a): 9 passed / 0 failed
- Full suite: 7517 tests across 652 files — 7423 pass / 74 fail
  - 74 failures are pre-existing (not introduced by 1347a)
  - Failing files include network-dependent tests (RSS, Reuters, Yahoo Finance, foreign-flow fetchers) and other pre-existing issues unrelated to DB isolation
  - 1347a test file does not appear in any failure list
- TypeScript (bun tsc --noEmit): 2 errors in src/application/usecases/scanMarket.ts (lines 130, 139) — pre-existing from commit 2727c75c (fix/1320), not introduced by 1347a

## DDD Compliance: PASS
- grep for `from.*infrastructure` in src/domain/ returns only JSDoc comment references, zero actual imports

## Security: PASS
- 1347a test file uses Bun.env exclusively — no process.env
- No hardcoded credentials or secrets in changed files
- No SQL injection risk: test queries use parameterized placeholders
- Only file changed by fix(1347a) commit: apps/mcp-server/src/__tests__/1347a-test-db-isolation.test.ts

## Issues Found

### Blocking
None. All issues below are pre-existing.

### Non-Blocking (pre-existing, not introduced by 1347a)
1. **TSC errors** — src/application/usecases/scanMarket.ts lines 130 + 139: `string | undefined` not assignable to `string`. Introduced by commit 2727c75c (fix/1320). Tracked separately.
2. **74 test failures** — network-dependent (Reuters, Yahoo Finance, RSS, foreign-flow) and other pre-existing failures across unrelated modules. Not regressed by 1347a.
3. **process.env in src/infrastructure/microservices/clients.ts** — pre-existing, not part of this task scope.

## Merge Status
ALREADY MERGED. Commit 6c471f22 (fix(1347a): add test DB isolation guard + clean 2537 leaked rows) is on main branch. Worktree worktree-agent-af597c68 no longer exists. Branch task/1347a-test-db-isolation not present locally.

## Summary
Task 1347a is complete and correctly merged. The fix:
- Verified setup.ts preload correctly sets DB_PATH=:memory: before any test
- Deleted 2537 historical contamination rows from production data/market.db
- Added 9 sentinel tests covering: preload guard, singleton path, empty table invariant, round-trip insert, cross-test isolation, production DB cleanliness, and concurrent simulation
- Production DB now has 0 rows matching any known fixture text pattern
