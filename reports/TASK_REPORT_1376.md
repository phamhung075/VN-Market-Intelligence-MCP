# Task Report: 1376+1377 — fix(evening-summary-dedup): DB isolation for test 1192
date: 2026-04-17
outcome: APPROVED

## Summary

| Item | Detail |
|------|--------|
| Branch | `task/1376-1377-evening-summary-db-isolation` |
| Commit | `4aa470a` |
| Files changed | `src/scheduler/eveningSummaryJob.ts`, `src/__tests__/1192-evening-summary-empty-fallback.test.ts` |
| Sprint | 131 |

**Root cause fixed**: `runEveningSummary` called `getDb()` (production singleton) during the dedup check. On days when a real evening summary had already been sent, the dedup guard short-circuited both test cases, making them vacuously pass (calls.length === 0 in both paths).

**Fix**: Added optional `db?: Database` parameter to `runEveningSummary`. Production path unchanged (falls back to `getDb()` when not injected). Test calls inject a fresh `makeTestDb()` (in-memory, schema-complete) so the dedup guard always sees an empty `market_messages` table.

## Test Results

| Scope | Before merge (main) | After merge (main) |
|-------|--------------------|--------------------|
| 1192 target tests | 1 fail (dedup guard short-circuit) | 2 pass |
| Full suite | 4998 pass / 3 fail | 4990 pass / 1 fail |
| TypeScript | 0 errors | 0 errors |

Remaining 1 failure: `296 OCR pipeline e2e smoke test` — pre-existing timeout, unrelated to this task.

Note: task branch showed 17 failures during branch-level regression due to stale base (Sprint 126 vs main at Sprint 131). All 14 extra failures resolved on merge — confirmed pre-existing by running the same tests against main independently.

## DDD Compliance: PASS

- `domain/` imports: comments only, no actual cross-layer imports
- Change is scheduler layer only — no domain/application layer touched

## Security: PASS

- No `process.env` in production code
- No hardcoded credentials
- SQL dedup query uses parameterized binding (pre-existing, unchanged)

## Issues Found

### Blocking
None.

### Non-Blocking
- `eveningSummaryJob.ts` line coverage at 59% — acceptable for a scheduler with heavy I/O paths; core logic paths covered by tests.

## Merge Status

Merged to main: `git merge --no-ff task/1376-1377-evening-summary-db-isolation`
Local branch deleted. Remote branch deleted (pre-push TS check passed).
TASKS.md: Sprint 131 marked COMPLETE.
