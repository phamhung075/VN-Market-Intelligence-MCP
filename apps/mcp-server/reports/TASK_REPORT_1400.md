# Task Report: 1400 — Centralise VN_OFFSET_MS into timeConstants.ts
date: 2026-04-28
outcome: APPROVED

## Summary

Three-pass DRY refactor completing full centralisation of `VN_OFFSET_MS` across the codebase.
All inline `7 * 3600_000` / `7 * 3600 * 1000` occurrences replaced with imported constant.

## Pass Summary

| Pass | Scope | Files | Replacements | Merged |
|------|-------|-------|--------------|--------|
| 1 | Source files: ohlcvDailyAggregatorJob, ohlcvStalenessCheckJob, logger | 3 | 3 | Yes |
| 2 | Production source: scanMarket, getPipelineHealth, assembleBriefing, assembleEveningSummary, server.ts, dataAuditJob | 6 | 10 | Yes |
| 3 | Test files: 101, 105, 125, 1192, 1322, 1335, 1465 | 7 | 16 | Yes |

## Test Results (Pass 3 — full suite on fix/1400-pass3)
- Unit tests: 7930 passed / 17 failed
- Baseline: 7926 passed / 17 failed
- Delta: +4 passing, 0 new failures
- Pre-existing env failures: 17 (unchanged)
- TypeScript: 4 pre-existing errors in 1383 + 1397c (not introduced by this task)

## DDD Compliance: PASS
- All imports use `domain/services/timeConstants.js` path — correct layer (domain constant)
- No infrastructure imports from domain

## Security: PASS
- No process.env usage
- No hardcoded credentials

## Issues Found
### Blocking
None.

### Non-Blocking
- 4 pre-existing TSC errors in 1383-macro-alert-dispatch.test.ts and 1397c-vn-index-refresh.test.ts (exist on main, not introduced by task 1400)

## Merge Status
- Branch fix/1400-pass3 merged to main via no-ff merge commit
- Branch deleted
- TASKS.md updated: Sprint 1400 status → done
