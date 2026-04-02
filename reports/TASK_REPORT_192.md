# TASK REPORT 192 — Fix Flaky Test: 164-polymarket-fetcher.test.ts

**Status**: Ready for Review
**Branch**: main (fix applied in-place; no separate task branch existed)
**Date**: 2026-04-02

---

## Summary

Fixed a mock-timing / shared-state flakiness issue in `src/__tests__/164-polymarket-fetcher.test.ts`.
The test file passed reliably when run alone but would fail intermittently in the full 1672-test suite.

---

## Root Cause

The `DB_PATH` environment variable was being set inside `beforeAll()`, which runs **after** ES module imports are resolved. Because `src/infrastructure/db/schema.ts` evaluates `DB_PATH` at module-level import time (as a module-level constant), by the time `beforeAll` set `DB_PATH = ":memory:"`, the singleton DB had already been initialised by an earlier test file in the run — possibly pointing at a real file path or a prior in-memory instance.

Additionally, `beforeAll` did not call `closeDb()` first, so if another test file's `afterAll` had not yet closed the DB singleton, `initDatabase()` would operate on a database object owned by a different test file — causing table-not-found errors or data contamination.

---

## Fix Applied

**File**: `src/__tests__/164-polymarket-fetcher.test.ts`

Two minimal changes:

1. Moved `process.env["DB_PATH"] = ":memory:"` to the **top level of the module** (before any imports), following the same pattern used by `002-db-schema.test.ts` and `163-prediction-schema.test.ts`.

2. Added `closeDb()` call at the start of `beforeAll()` to reset any pre-existing singleton before calling `initDatabase()`.

No production code was modified. No tests were deleted or weakened.

---

## Verification

- `bun test src/__tests__/164-polymarket-fetcher.test.ts` → 16 pass, 0 fail
- `bun test` full suite (3 consecutive runs):
  - Run 1: 1671 pass, 1 fail (unrelated pre-existing flaky test in another file)
  - Run 2: 1672 pass, 0 fail
  - Run 3: 1672 pass, 0 fail
- `bun tsc --noEmit` → 0 errors

The single unrelated failure in Run 1 is a pre-existing flaky test unrelated to task 192 (DB race in a different test file, not in 164-polymarket-fetcher.test.ts).

---

### Fix Log — 2026-04-02

- **Issue**: 164-polymarket-fetcher flaky — DB singleton shared-state contamination in full suite
- **Root cause**: `process.env["DB_PATH"]` set inside `beforeAll` (after ES module import), and no `closeDb()` call to reset singleton before `initDatabase()`
- **Fix**: Moved `process.env["DB_PATH"] = ":memory:"` to top-level before imports; added `closeDb()` at start of `beforeAll` — `src/__tests__/164-polymarket-fetcher.test.ts` lines 10-11 and 122-126
- **Tests added**: None (existing 16 tests now reliably pass)
- **Verified**: `bun test` PASS | `bun tsc --noEmit` PASS
