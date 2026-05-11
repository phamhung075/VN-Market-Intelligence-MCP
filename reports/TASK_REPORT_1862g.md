# Task Report: 1862g — urgent_news 4h dedup
date: 2026-05-10
outcome: APPROVED

## Test Results
- Unit tests (1862g suite): 10 passed / 0 failed
- Full suite: 9137 tests across 822 files — 0 failures, 0 errors (Bun OOM crash after all tests passed is a known Bun v1.3.13 runtime bug, not a test failure)
- TypeScript: pre-existing errors only (regimeConfidenceThreshold.ts, dailyDashboardJob.ts, 1854b/H3 test files) — all confirmed present on main branch before this branch, 0 new errors introduced

## DDD Compliance: PASS
- `src/infrastructure/db/agentSignalStore.ts` is infrastructure layer — correct placement
- No domain layer imports from infrastructure — ZERO violations
- Dedup logic correctly placed in infrastructure store, not in domain

## Security: PASS
- All SQL queries use parameterized `?` placeholders (both JSON_EXTRACT path and LIKE fallback)
- No `process.env` usage — Bun.env standard not applicable here (no env reads in changed file)
- No hardcoded credentials or secrets
- LIKE fallback: `direction` passed as parameter, not string-interpolated — safe

## Logic Review: PASS
- Dedup key: `(stock_code, signal_type, direction)` within configurable time window
- Default window: 240min for `urgent_news`, 0 (disabled) for all other types — backward compatible
- Returns -1 when suppressed, positive ID on insert — clear sentinel contract
- Direction read from `finding_data.direction` with fallback to `finding_data.catalyst_direction`
- Dedup skipped when `stock_code` is NULL or `direction` is absent — prevents over-suppression
- `created_at` column existence guard before dedup check — safe on legacy schemas
- JSON_EXTRACT primary path with LIKE fallback for SQLite < 3.38 — graceful degradation
- `dedupWindowMinutes=0` correctly disables dedup — confirmed by test "signal after 4h window expires"

## Issues Found
### Blocking
None.

### Non-Blocking
- Pre-existing TSC errors in `regimeConfidenceThreshold.ts` and `dailyDashboardJob.ts` — not in scope for 1862g

## Merge Status
MERGED to main. Branch `task/1862g-signal-dedup` deleted.
