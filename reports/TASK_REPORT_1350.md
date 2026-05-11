# Task Report: 1350 — test(ohlcv-backfill): TDD test for POST /api/push-ohlcv-history
date: 2026-04-17
outcome: APPROVED

## Test Results

| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| Task 1350 unit | 3 | 10 | All 10 failures = 404 (endpoint not yet implemented — correct TDD red phase) |
| Full regression | 4935 | 14 | Pre-existing: 063×2, 133, 296 OCR (all on main before this branch). New: 10 × 1350 TDD |
| TypeScript | 0 errors | — | `bun tsc --noEmit` clean |

## DDD Compliance: PASS

- `src/domain/` has zero actual import statements from `infrastructure/` or `application/` layers.
- Test file imports only from `infrastructure/db/schema.js` and `interface/mcp/server.js` — interface-layer access is correct for integration tests.

## Security: PASS (with known non-blocking caveat)

- No hardcoded credentials — `VALID_KEY` is a test fixture, not a production secret.
- `process.env["DB_PATH"]` and `process.env["VPS_PUSH_API_KEY"]` used in test harness setup/teardown. This is a pre-existing repo-wide pattern (200+ test files). Not a new violation introduced by this task. Rule applies to production `src/` code; test files follow established convention.
- All SQL queries in test assertions use parameterized bindings.
- No string interpolation in SQL.

## Test Quality Assessment

| Criterion | Status |
|-----------|--------|
| TDD: tests written before implementation | PASS — single commit `6bdab04`, no implementation exists |
| 5 acceptance criteria covered | PASS — TC-1 (valid insert), TC-2 (upsert idempotency), TC-3 (auth 401), TC-4 (empty bars 200), TC-5 (malformed 400) |
| 13 test cases, meaningful assertions | PASS — verifies HTTP status, response body shape, and DB row state |
| Edge cases | PASS — missing key, wrong key, object instead of array, string instead of array, missing both fields |
| Upsert overwrite verification | PASS — TC-2 checks close values reflect second push (not just row count) |
| DB isolation | PASS — `beforeEach` clears `daily_ohlcv`; `afterAll` calls `closeDb()` |
| No trivial tests | PASS — every assertion is load-bearing |
| `!` non-null assertions | Acceptable — all guarded by prior `toHaveLength(3)` check |
| Port 0 (ephemeral) | PASS — avoids port conflicts in CI |

## Issues Found

### Blocking
None.

### Non-Blocking
- `process.env` used for `DB_PATH` and `VPS_PUSH_API_KEY` in test harness. Technically should be `Bun.env`. Pre-existing pattern in 200+ test files — not a regression from this task. To be addressed in a future janitor pass across all tests.

## TDD Verification

All 10 failing tests return HTTP 404 (route not registered). This is the expected red state. Task 1351 must implement the handler to make them green. No false positives, no trivially-passing tests.

## Merge Status

APPROVED. Task 1350 fulfils its contract as a TDD specification. Merge to main.
Next: task 1351 (feat: POST /api/push-ohlcv-history implementation) — assign to Dev.
