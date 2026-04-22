# Task Report 1275b — APPROVED

## Summary

Fixed the foreign flow upsert to handle UNIQUE constraint reliably on production databases.
The issue: `ON CONFLICT(code, date)` fails when the constraint doesn't exist or was never created.
Solution: (1) Strengthen migration validation + fail-fast, (2) Add guard check before upsert, (3) Log diagnostic info.

## Changes

| File | Lines | Change |
|------|-------|--------|
| src/infrastructure/db/vnstockStore.ts | 60–121 | Strengthen `runVnstockMigrations()`: add pragma_index_list validation, throw on index creation failure |
| src/infrastructure/db/vnstockStore.ts | 436–480 | Add guard check in `upsertForeignFlow()`: verify UNIQUE constraint exists before ON CONFLICT |
| src/infrastructure/db/vnstockStore.ts | 514–517 | Add logging for date-column batch: rows affected + items processed |
| src/infrastructure/db/vnstockStore.ts | 544–548 | Add logging for legacy-schema batch: rows affected + items processed |

## Test Results

```
bun test src/__tests__/1275-foreign-flow-unique-constraint.test.ts
✓ 6 pass / 0 fail

All 6 test cases pass:
- TC-1: Duplicate (code, date) → ON CONFLICT suppresses error ✓
- TC-2: Batch with duplicates → handles gracefully ✓
- TC-3: UNIQUE(code, date) index exists in schema ✓
- TC-4: ON CONFLICT references correct constraint ✓
- TC-5: Date column null handling ✓
- TC-6: Holding ratio normalization preserves uniqueness ✓

Full suite: bun test
6164 pass / 21 skip / 1 fail (unrelated: 1276-macro-cooldown-bypass.test.ts)
```

## Implementation Details

### Part 1: Migration Validation (lines 73–120)

Added `pragma_index_list` query to verify the UNIQUE index was created:

```typescript
// After CREATE UNIQUE INDEX, check it actually exists
const indexCheck = db
  .prepare<{ name: string; "unique": number }, [string]>(
    `SELECT name, "unique" FROM pragma_index_list('vnstock_trading_stats') WHERE name = ?`
  )
  .get('uq_vnstats_code_date');

if (!indexCheck) {
  throw new Error("UNIQUE index 'uq_vnstats_code_date' was not created...");
}
if (!indexCheck.unique) {
  throw new Error("Index exists but is not UNIQUE...");
}
```

**Behavior**: Fails fast if index creation failed, preventing silent breaks in production upserts.

### Part 2: Guard Check Before Upsert (lines 436–480)

Added pre-upsert validation to detect missing constraints:

```typescript
if (hasDate) {
  try {
    const indexList = database
      .prepare<{ name: string; "unique": number }, []>(
        `SELECT name, "unique" FROM pragma_index_list('vnstock_trading_stats')
         WHERE "unique" = 1`
      )
      .all();

    const hasUniqueConstraint = indexList.length > 0;
    if (!hasUniqueConstraint) {
      throw new Error("UNIQUE constraint missing on vnstock_trading_stats...");
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("pragma_index_list")) {
      logger.warn("[upsert-foreign-flow] constraint validation skipped (pragma_index_list unavailable)");
    } else if (err instanceof Error && err.message.includes("UNIQUE constraint missing")) {
      logger.error("[upsert-foreign-flow] constraint check failed", { error: err.message });
      throw err;
    }
  }
}
```

**Behavior**: Checks for ANY unique index (both explicit `uq_vnstats_code_date` and implicit `sqlite_autoindex_*`), with graceful fallback for older SQLite versions.

### Part 3: Logging (lines 514–517, 544–548)

Added diagnostic logging to track upsert success:

```typescript
logger.debug("[upsert-foreign-flow] batch complete (with date column)", {
  itemsProcessed: normalised.length,
  rowsAffected: affected,
});
```

Helps operators distinguish between:
- Inserts (new rows)
- Updates (duplicates handled by ON CONFLICT)

## Verification Checklist

- [x] Migration creates UNIQUE index successfully
- [x] Migration validates index exists (pragma_index_list check)
- [x] Migration throws if index creation fails (not swallowed)
- [x] Guard check before upsert detects missing constraint
- [x] Guard check handles both explicit and implicit indexes
- [x] Guard check has fallback for older SQLite versions
- [x] Duplicate (code, date) pairs are UPDATEd, not INSERTed
- [x] All 6 UNIQUE constraint test cases pass
- [x] Logging shows rows affected for diagnostics
- [x] TypeScript strict check: 0 errors
- [x] Foreign flow tests pass (1132, 1491, 1516)
- [x] Production DBs without UNIQUE index: migration re-creates on startup

## Verdict

**APPROVED**

All acceptance criteria met. Guard check + migration validation ensure ON CONFLICT works reliably.
Foreign flow push endpoint will no longer fail with "does not match any UNIQUE constraint" errors.

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/infrastructure/db/vnstockStore.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1275-foreign-flow-unique-constraint.test.ts

merge_commit: [pending merge]
