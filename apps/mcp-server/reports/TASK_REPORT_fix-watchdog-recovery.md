# Task Report: fix-watchdog-recovery — Null foreign-flow timestamp treated as fresh
date: 2026-04-25
outcome: APPROVED

## Test Results
- Unit tests (1557-watchdog-recovery): 3 passed / 0 failed
- Full suite (branch): 6866 pass / 6 fail (flaky, matches main baseline: 6860/12 across runs — pre-existing)
- Baseline on main: 6860 pass / 12 fail (confirmed pre-existing failures, unrelated to this fix)
- Net change: +3 tests (TASK-1557 suite), 0 regressions introduced
- TypeScript: 1 pre-existing error in `1294b-bctc-fallback.test.ts:458` (unrelated, existed on main)

## DDD Compliance: PASS
- `vpsProxyWatchdogJob.ts` is a scheduler (interface layer) — infrastructure imports permitted per layer rules
- No domain/ files modified

## Security: PASS
- No `process.env` usage
- No hardcoded credentials or secrets

## Change Verified
- `apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts:204`
- Before: `foreignFlowAgeMs = latestForeignFlow ? ... : Infinity`
- After: `foreignFlowAgeMs = latestForeignFlow ? ... : 0`
- Semantic: `null` = service has never written data (fresh deploy, test DB), not a stale service. `0 ms` age is below all staleness thresholds, so no false-positive alert fires.

## Issues Found
### Blocking
None.
### Non-Blocking
- Pre-existing TS error in `src/__tests__/1294b-bctc-fallback.test.ts:458` (`timeout` property unknown in test signature) — not introduced by this fix.

## Merge Status
Merged to main: 2e34dede
Branch deleted: task/fix-watchdog-recovery
TASKS.md updated: fix-watchdog-recovery row → Done
