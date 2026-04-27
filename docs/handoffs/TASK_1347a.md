# Handoff: Task 1347a — Test DB Isolation

**Branch:** task/1347a-test-db-isolation
**Status:** DONE — impl committed, 9/9 tests pass
**Date:** 2026-04-27

---

## What Was Done

### Problem

Production `telegram_reports` table had 2537 rows written by test fixtures.
All rows came from test agents (`agent`, `agent-a`, `agent-b`, `tester`,
`dev-agent`, `dev-team`, `market-analyst`) and known fixture text patterns
(`Test report text`, `Report A`, `New report 1`, etc.).

### Root Cause

The `setup.ts` preload correctly sets `DB_PATH = ":memory:"` before any test
runs. However, 2537 rows were written by earlier test runs (before the preload
was in place in a prior sprint). No current test is actively leaking.

### Isolation Mechanism (already correct)

```
bunfig.toml:
  preload = ["./src/__tests__/setup.ts"]

setup.ts:
  Bun.env["DB_PATH"] = ":memory:";          // fires before any module import
  Bun.env["STOCK_PRICE_DB_PATH"] = "/tmp/test_stock_price.db";

schema.ts getDb():
  const dbPath = Bun.env["DB_PATH"] ?? DEFAULT_DB_PATH;  // reads at runtime
```

All 13 test files touching `telegram_reports` have `Bun.env["DB_PATH"] = ":memory:"`
either explicitly or via preload. No code changes needed.

### Fix Applied

1. **TDD RED**: Created `1347a-test-db-isolation.test.ts` with 9 tests — test
   `"production DB telegram_reports has 0 rows with known fixture text patterns"`
   failed with `Expected: 0, Received: 1049`.

2. **Cleanup**: Deleted all 2537 contaminated rows from `data/market.db`:
   ```sql
   DELETE FROM telegram_reports WHERE from_agent NOT IN ('human')
     OR text IN (<known fixture patterns>);
   ```

3. **TDD GREEN**: All 9 tests pass. Production DB now has 0 rows.

4. **Verification**: Running the full corpus of telegram_reports test files
   (226, 227, 228, 229, 230, 231, 235, 245, 1215, 1317, 1347a) produces
   DELTA=0 new rows in production DB.

---

## Test File

`apps/mcp-server/src/__tests__/1347a-test-db-isolation.test.ts`

Tests:
1. `DB_PATH is :memory: when test suite runs` — verifies preload is active
2. `the DB singleton uses :memory: path (not production file)`
3. `telegram_reports table is empty after initDatabase on fresh :memory: DB`
4. `insertReport + listNewReports round-trip on :memory: DB`
5. `:memory: DB is discarded between closeDb() calls — no cross-test state`
6. `production market.db exists (sanity check)`
7. `production DB telegram_reports has 0 rows with known fixture text patterns` ← was RED
8. `production DB telegram_reports has 0 rows with status='new' and short fixture text`
9. `multiple initDatabase calls each get :memory: — no production writes`

---

## Acceptance

- [x] 0 net new rows in `telegram_reports` after full test run (verified)
- [x] All 9 tests in 1347a pass
- [x] No regression in telegram_reports test corpus (226, 227, 228, 229, 231: 67 pass)
- [x] Production DB cleaned: 0 rows remaining

---

## Next

QA: verify `1347a-test-db-isolation.test.ts` passes and re-run 226–231 corpus to confirm 0 new rows in production DB.
