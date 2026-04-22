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

- [ ] runVnstockMigrations() throws if UNIQUE index validation fails
- [ ] Guard check in upsertForeignFlow() detects missing constraint before attempting upsert
- [ ] Duplicate (code, date) pairs are UPDATEd, not INSERTed (ON CONFLICT works)
- [ ] All 6 tests from TASK 1275a pass
- [ ] VPS push-foreign-flow endpoint logs clearly show rows affected + constraint state
- [ ] Old production DBs without UNIQUE index: migration re-creates it on next startup
- [ ] No UNIQUE constraint errors logged in subsequent test runs

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
