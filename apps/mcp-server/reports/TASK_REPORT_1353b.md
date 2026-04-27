# Task Report: 1353b — priceUpdateWatchdogJob _resetSshCooldown + 8 gap tests
date: 2026-04-27
outcome: APPROVED

## Test Results
- Unit tests (1353b targeted): 8 passed / 0 failed
- Full suite: 7673 pass / 3 fail (all pre-existing, confirmed on main) / 21 skip / 1 error (Bun runtime crash — known Bun 1.3.11 bug, not code)
- TypeScript: 6 pre-existing errors in 1348a + 1352b test files — identical on main, zero new errors introduced

## Pre-existing failures confirmed on main
| Test | File | Status |
|------|------|--------|
| 1294b: RED 8: E2E — OCR fails then succeeds → OCR overwrites news_inference | 1294b-bctc-fallback.test.ts | Pre-existing on main |
| Task 1288a — Fallback returns cached data when primary times out | 1288-foreign-flow-fallback.test.ts | Flaky (timing); passes in isolation on both branches |

## DDD Compliance: PASS
- Production file is `src/scheduler/market-data/` (interface layer) — infrastructure imports are permitted at this layer
- Zero domain-layer files touched

## Security: PASS
- No process.env usage (confirmed)
- No hardcoded secrets or credentials
- No SQL queries in changed files

## Production Change Audit: PASS
- Exactly 1 function added: `_resetSshCooldown()` export (7 lines including JSDoc)
- Zero behaviour change — resets `lastSshAttemptAt = 0` for test isolation only
- Same pattern as pre-existing `_resetWatchdogCooldown` and `_resetWatchdogStaleFlag`
- Files changed: 2 (test file + production file)

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
Merged to main via no-ff merge commit. Branch `task/1353b-price-watchdog-job-gaps` deleted.
