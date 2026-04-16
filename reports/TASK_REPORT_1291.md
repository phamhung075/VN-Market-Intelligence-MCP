# TASK REPORT 1291 — fix(schema): systematic initDatabase() audit

| Field | Value |
|---|---|
| Task ID | 1291 |
| Branch | fix/1291-schema-audit (merged to main) |
| Commit | c6be41b |
| Reviewer | QA Agent |
| Date | 2026-04-15 |
| Verdict | **PASS** |

---

## Summary

Systematic audit of `initDatabase()` in `src/infrastructure/db/schema.ts` — added five previously-missing items that caused test suites 103, 125, and 1050 to fail with "no such table / no such column" errors.

---

## Checks

| Check | Result | Notes |
|---|---|---|
| `bun tsc --noEmit` | PASS | No errors |
| `bun test ./src/__tests__/1291-schema-audit.test.ts` | 15/15 PASS | All 5 missing items verified present |
| Regression: `103-job-market-scan.test.ts` | PASS | Was failing pre-fix |
| Regression: `125-test-e2e-briefing.test.ts` | PASS | Was failing pre-fix |
| Regression: `1050-alert-dispatch-fixes.test.ts` | PASS | Was failing pre-fix |
| Combined regression (3 files, 55 tests) | 55/55 PASS | 0 failures |
| DDD layering — domain imports infrastructure | CLEAN | No new violations |
| Security — process.env in src/ | CLEAN | No new violations |

---

## Acceptance Criteria Verification

| AC | Description | Result |
|---|---|---|
| AC-1 | `initDatabase()` creates `market_prices_history.exchange` column | PASS |
| AC-2 | `initDatabase()` creates `alerts.sent_by` column | PASS |
| AC-3 | `initDatabase()` creates `positions` table with full schema | PASS |
| AC-4 | `initDatabase()` creates `insider_transactions` table | PASS |
| AC-5 | `initDatabase()` creates `vnstock_trading_stats` table | PASS |
| Regression | Tests 103, 125, 1050 all pass after fix | PASS |

---

## Changed Files

| File | Change |
|---|---|
| `src/infrastructure/db/schema.ts` | Added `ALTER TABLE market_prices_history ADD COLUMN exchange`, `ALTER TABLE alerts ADD COLUMN sent_by`, `CREATE TABLE IF NOT EXISTS positions`, `CREATE TABLE IF NOT EXISTS insider_transactions`, `CREATE TABLE IF NOT EXISTS vnstock_trading_stats` to `initDatabase()` |
| `src/__tests__/1291-schema-audit.test.ts` | New: 15 tests verifying all 5 missing items are present post-`initDatabase()` |
| `TASKS.md` | Task 1291 moved to Review (now moving to Done) |

---

## Pre-existing Failures

25 pre-existing failures on main confirmed unchanged — none introduced by this task.
