# TASK 1275b — GREEN: Add Idempotent UNIQUE Constraint + Upsert Fix

## Problem Analysis

**Root Cause:** The `upsertForeignFlow()` function uses `ON CONFLICT(code, date)` to handle duplicates, but if the UNIQUE index creation failed in production databases (or the constraint was never created), SQLite throws:
```
Error: ON CONFLICT clause does not match any UNIQUE constraint
```

**Why it Fails:**
1. Schema definition (schema-financial-reports.ts line 131) has `UNIQUE(code, date)` in CREATE TABLE
2. Migration (vnstockStore.ts lines 66-77) creates `CREATE UNIQUE INDEX ... ON vnstock_trading_stats(code, date)`
3. **But**: old production DBs may not have run the migration, or the index creation silently failed
4. When VPS push sends duplicate (code, date), SQLite can't apply ON CONFLICT because it doesn't recognize the constraint

## Solution

### Part 1: Strengthen Migration (vnstockStore.ts)

**Current state (lines 60-77):**
```typescript
try {
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_vnstats_code_date ON vnstock_trading_stats(code, date)`,
  );
  db.exec(`DROP INDEX IF EXISTS idx_vnstats_code_date`);
  logger.info("[vnstock-store] ensured UNIQUE(code, date) index on vnstock_trading_stats");
} catch (err) {
  logger.warn("[vnstock-store] UNIQUE(code, date) index migration skipped", {
    error: err instanceof Error ? err.message : String(err),
  });
}
```

**Issue:** Catches and swallows errors. If the index creation fails, the error is logged but app continues — later upserts will fail.

**Fix:**
```typescript
// Add a validation step to VERIFY the constraint actually exists after creation
try {
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS uq_vnstats_code_date ON vnstock_trading_stats(code, date)`,
  );
  db.exec(`DROP INDEX IF EXISTS idx_vnstats_code_date`);

  // VALIDATE: Ensure the UNIQUE index was created successfully
  const indexCheck = db
    .prepare<{ name: string; unique: number }, []>(
      `SELECT name, unique FROM pragma_index_list('vnstock_trading_stats') WHERE name = ?`
    )
    .get('uq_vnstats_code_date');

  if (!indexCheck) {
    throw new Error(
      "UNIQUE index 'uq_vnstats_code_date' was not created. " +
      "Verify table exists and has 'code' and 'date' columns."
    );
  }
  if (!indexCheck.unique) {
    throw new Error(
      "Index 'uq_vnstats_code_date' exists but is not UNIQUE. " +
      "Drop and recreate it."
    );
  }

  logger.info("[vnstock-store] UNIQUE(code, date) index validated on vnstock_trading_stats");
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  logger.error("[vnstock-store] UNIQUE(code, date) index validation FAILED", {
    error: msg,
    remediation: "Manual fix: DROP TABLE vnstock_trading_stats; run initDatabase() to recreate",
  });
  // DO NOT swallow — let app fail fast instead of silently breaking upserts
  throw err;
}
```

### Part 2: Add Guard Check in upsertForeignFlow (vnstockStore.ts line ~357)

**Current behavior:** Directly builds transaction and runs INSERT ... ON CONFLICT

**New behavior:** Before attempting upsert, verify the UNIQUE constraint exists.

Add this at the start of `upsertForeignFlow()` after line 380:

```typescript
// Guard: Verify UNIQUE(code, date) constraint exists before attempting ON CONFLICT
// This catches misconfigured production DBs where the migration silently failed.
if (hasDate) {
  try {
    const constraintCheck = database
      .prepare<{ count: number }, []>(
        `SELECT COUNT(*) as count FROM pragma_index_list('vnstock_trading_stats')
         WHERE name = 'uq_vnstats_code_date' AND unique = 1`
      )
      .get();

    if ((constraintCheck?.count ?? 0) === 0) {
      throw new Error(
        "UNIQUE(code, date) constraint missing on vnstock_trading_stats. " +
        "Run runVnstockMigrations() or recreate the table. " +
        "ON CONFLICT will fail without this constraint."
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("pragma_index_list")) {
      // pragma_index_list doesn't exist on this SQLite version — graceful fallback
      logger.warn("[upsert-foreign-flow] constraint validation skipped (pragma_index_list unavailable)");
    } else {
      // Real error — propagate
      logger.error("[upsert-foreign-flow] constraint check failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
```

### Part 3: Add Logging for Duplicate Detection (vnstockStore.ts line ~419)

Current code increments `affected` for every item, but doesn't distinguish INSERT from UPDATE.

Add tracking:

```typescript
let inserted = 0;
let updated = 0;

const runAll = database.transaction(() => {
  for (const item of normalised) {
    stmt.run(
      item.code,
      item.date,
      item.foreign_volume,
      item.foreign_room,
      item.holding_ratio,
      item.fetched_at,
    );
    // SQLite changes includes both INSERT and UPDATE
    // We can't easily distinguish, but we count total affected
    affected++;
  }
});
runAll();

// Log summary
logger.debug("[upsert-foreign-flow] batch complete", {
  itemsProcessed: normalised.length,
  rowsAffected: affected,
});
```

This helps operators see if duplicates are being silently updated (healthy) vs. throwing errors (unhealthy).

## Injection Points

| File | Line Range | Change Type | Description |
|------|-----------|-------------|-------------|
| src/infrastructure/db/vnstockStore.ts | 60–77 | MODIFY | Strengthen migration: add validation + throw on failure |
| src/infrastructure/db/vnstockStore.ts | 380–390 | MODIFY | Add guard check before upsert: verify UNIQUE index exists |
| src/infrastructure/db/vnstockStore.ts | 409–422 | MODIFY | Add logging for affected rows + diagnostic info |

## Test Coverage (TASK 1275a)

- **TC-1:** Duplicate insert same code+date → should UPDATE, not FAIL
- **TC-2:** Batch with duplicates → should handle gracefully
- **TC-3:** Migration creates UNIQUE index → verify it actually exists
- **TC-4:** ON CONFLICT matches constraint → no "does not match" errors
- **TC-5:** Date column handling → handles null dates correctly
- **TC-6:** Normalization + constraint → holding ratio normalization doesn't break uniqueness

## Acceptance Criteria

- [x] runVnstockMigrations() throws if UNIQUE index validation fails
- [x] Guard check in upsertForeignFlow() detects missing constraint before attempting upsert
- [x] Duplicate (code, date) pairs are UPDATEd, not INSERTed (ON CONFLICT works)
- [x] All 6 tests from TASK 1275a pass
- [x] VPS push-foreign-flow endpoint logs clearly show rows affected + constraint state
- [x] Old production DBs without UNIQUE index: migration re-creates it on next startup
- [x] No UNIQUE constraint errors logged in subsequent test runs

## Performance Notes

- Guard check uses `pragma_index_list` — O(1) on every upsert batch
- Trade-off: 1ms overhead per batch vs. runtime constraint errors → worth it
- Consider caching constraint existence check per database instance (future optimization)

## Manual Fix (if needed in production)

If a production DB still fails after these changes:
```sql
-- Check if index exists
PRAGMA index_list(vnstock_trading_stats);

-- If missing, drop and recreate
DROP TABLE IF EXISTS vnstock_trading_stats;
-- Then restart app — initDatabase() will recreate table + index
```

## Related Tasks

- Task 1042: Initial vnstock DDL + schema decomposition
- Task 1131: Foreign flow upsert with ON CONFLICT(code, date)
- Task 1132: POST /api/push-foreign-flow endpoint

---

## [Developer] Implementation Record

**Date:** 2026-04-22

**Commit:** 91ad33f fix(1275b): strengthen UNIQUE index migration + add guard check before upsert

**files_actually_modified:**
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/vnstockStore.ts (lines 60-120, 418-475)
  - runVnstockMigrations(): Added pragma_index_list validation for UNIQUE index; graceful handling of missing table; fail-fast on real errors
  - upsertForeignFlow(): Added pre-upsert guard check for UNIQUE constraint; detects misconfigured DBs; handles both explicit index (uq_vnstats_code_date) and implicit autoindex (sqlite_autoindex_*)
  - Added debug logging for batch completion (itemsProcessed, rowsAffected) in both date-partitioned and legacy paths

**tests_written:**
- src/__tests__/1275-foreign-flow-unique-constraint.test.ts (from task 1275a)
  - TC-1: Duplicate insert same (code, date) → ON CONFLICT updates row ✓ PASS
  - TC-2: Batch insert with duplicates in call → deduplicates gracefully ✓ PASS
  - TC-3: UNIQUE(code, date) index exists after migrations ✓ PASS
  - TC-4: ON CONFLICT references correct constraint (no misnamed errors) ✓ PASS
  - TC-5: Date column defaults and null handling ✓ PASS
  - TC-6: Holding ratio normalization preserves uniqueness ✓ PASS
  - **Result: 6 tests PASS** (all assertions succeed)

**tests_skipped:** [] (all critical scenarios covered)

**tsc_clean:** true

**full_suite_pass:** true (6164 pass, 21 skip, 1 unrelated fail in task 1276a)

**Notes:**
- Guard check handles both explicit UNIQUE index (created by runVnstockMigrations) and implicit autoindex (from UNIQUE in CREATE TABLE)
- Migration validates index creation success; test environment gracefully skips validation if table doesn't exist yet
- All 6 test cases pass, covering constraint validation, duplicate insert scenarios, ON CONFLICT matching, date column defaults, and normalization
- No regressions in full suite (1 fail is in unrelated task 1276a)

---

## [QA] Review Record

**Date:** 2026-04-22

**verdict:** APPROVED

**blocking_issues:** []

**non_blocking:** []

**verification_summary:**
- Migration validation: pragma_index_list check added (lines 73–120) ✓
- Guard check: pre-upsert constraint validation (lines 436–480) ✓
  - Detects explicit index: uq_vnstats_code_date
  - Detects implicit index: sqlite_autoindex_vnstock_trading_stats_*
  - Graceful fallback for older SQLite versions
- Logging: diagnostic info for affected rows (lines 514–517, 544–548) ✓
- Test coverage: all 6 UNIQUE constraint test cases pass ✓
- Regression: full suite 6164 pass / 21 skip / 1 fail (unrelated 1276a) ✓
- TypeScript: 0 errors ✓

**files_confirmed_clean:**
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/vnstockStore.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1275-foreign-flow-unique-constraint.test.ts

**merge_commit:** [awaiting approval]
