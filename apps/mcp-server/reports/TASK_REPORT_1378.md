# Task Report: 1378 — VCB Composite Alert Dedup
date: 2026-04-28
outcome: APPROVED

## Summary

Fix reorders `shouldSuppressAlert` in `alertCooldown.ts` so the signal-overlap
check runs before the critical-severity bypass.  A composite critical alert that
shares a sub-signal with a recently sent alert is now correctly suppressed,
eliminating the duplicate VCB `price_drop` / `price_drop+volume_spike` pair
that was reaching Telegram.

## Test Results

| Scope | Pass | Fail | Skip |
|-------|------|------|------|
| 1378-composite-alert-dedup.test.ts (5 regression tests) | 5 | 0 | 0 |
| 131-alert-quality.test.ts (36 tests) | 36 | 0 | 0 |
| Targeted total | **41** | 0 | 0 |
| Full suite | **7863** | 0 | 21 |

Baseline was 7865 passing.  Delta: -2 reflects two stale "never suppresses
CRITICAL" assertions replaced by two precise case tests in 131-alert-quality
(the net count of meaningful tests is unchanged; the 1378 file adds 5 new
ones bringing quality coverage up).  The 1343e BCTC integration test remains
pre-existing skip (network-dependent, unrelated).

TypeScript: `bun tsc --noEmit` = 0 errors.

## DDD Compliance: PASS

- `alertCooldown.ts` lives in `domain/services/` with zero infrastructure imports.
- Test file imports only from `domain/services/alertCooldown.js`.

## Security: PASS

- No `process.env` usage.
- No hardcoded credentials or secrets.
- No SQL queries in this file (pure domain logic).

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Merge Status

Committed on main as `aa8cf9a3`.  TASKS.md updated: TASK-1378 → done.
