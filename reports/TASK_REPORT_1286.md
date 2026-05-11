# Task Report: 1286 — fix daily_ohlcv missing from test DB setup
date: 2026-04-15
outcome: APPROVED

## Summary

| Item | Detail |
|------|--------|
| Branch | fix/1286-daily-ohlcv-schema |
| Commit | b51bdea |
| Root cause | Tests 172, 179, 1081 build their own in-memory DBs via manual `CREATE TABLE` lists. `daily_ohlcv` was omitted. `positionStore.listOpenPositions()` and `assembleBriefing()` both COALESCE against `daily_ohlcv` as a price fallback, causing `SQLiteError: no such table: daily_ohlcv` on every call. |
| Fix scope | Test files only — schema.ts already had `daily_ohlcv` at line 152. No production code changed. |

## Test Results

| Suite | Pass | Fail |
|-------|------|------|
| 1286-daily-ohlcv-schema.test.ts | 7 | 0 |
| 172-prediction-briefing.test.ts | 18 | 0 |
| 179-position-tracking.test.ts | 13 | 0 |
| 1081-sprint-054-smoke.test.ts | 17 | 0 |
| Combined (4 files) | 55 | 0 |
| Pre-existing failures on main (102, 1007, 1124) | — | 10 (unchanged — confirmed same count on main before merge) |

TypeScript: 0 errors (`bun tsc --noEmit` clean pre- and post-merge).

## Acceptance Criteria

| AC | Description | Result |
|----|-------------|--------|
| AC1 | `initDatabase()` creates `daily_ohlcv` with required columns | PASS |
| AC2 | Composite primary key `(code, date)` enforces uniqueness | PASS |
| AC3 | Tests 172 and 179 pass after fix | PASS |
| Bonus | `INSERT OR REPLACE` on duplicate `(code, date)` updates row | PASS |
| Bonus | `initDatabase()` idempotent — second call does not throw | PASS |
| Bonus | `listOpenPositions` falls back to `daily_ohlcv.close` when `market_prices` has no row | PASS |

## DDD Compliance: PASS

No production source files changed. Domain files untouched. All `import type` from infrastructure in domain are pre-existing and structural (type-only, zero runtime coupling).

## Security: PASS

No `process.env` in non-test source files. All `process.env["DB_PATH"]` usages are in test setup only (`:memory:` override pattern). No parameterized query changes. No credentials.

## Additional Change

`docs/data/code-janitor-known-findings.json` — stale `DomainTypeEnum` finding cleared (construction/energy/pharmaceutical domain values were added to watchlist.ts in sprint 083; janitor finding was not cleaned up at that time).

## Issues Found

### Blocking
None.

### Non-Blocking
Pre-existing failures on main for tests 102, 1007, 1124 (10 total). Tracked as tasks 1287 (cascade rule drift) and 1288 (pollNews shape mismatch). 1288 dependency on 1286 is now unblocked.

## Merge Status

Merged to main via `--no-ff`. Branch deleted (local + remote). `bun tsc --noEmit` clean post-merge.
