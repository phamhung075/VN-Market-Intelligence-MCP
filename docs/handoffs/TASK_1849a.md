# TASK-1849a — Schema Migration + Store Functions

**Sprint:** 1849
**Type:** SPRINT-S
**Priority:** MEDIUM
**Owner:** dev-mcp-server
**Status:** Todo
**Handoff Created:** 2026-05-07

---

## Objective

Add resolution tracking columns to `telegram_reports` table, create store functions to manage resolution state, and fix SELECT column coverage gap (C-2 constraint from architect).

---

## Acceptance Criteria

### AC-1: Schema Migration (schema-system.ts)

- [ ] File: `apps/mcp-server/src/infrastructure/db/schema-system.ts`
- [ ] Add two ALTER TABLE statements using try/catch pattern (NOT IF NOT EXISTS):
  ```typescript
  try { db.exec(`ALTER TABLE telegram_reports ADD COLUMN resolution TEXT NOT NULL DEFAULT 'none'`); } catch {}
  try { db.exec(`ALTER TABLE telegram_reports ADD COLUMN resolved_at TEXT`); } catch {}
  ```
- [ ] Create compound index on (status, resolution):
  ```typescript
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telegram_reports_resolution ON telegram_reports(status, resolution)`);
  ```
- [ ] No breaking changes to existing DDL

### AC-2: Type Definition (telegramReportStore.ts)

- [ ] File: `apps/mcp-server/src/infrastructure/db/telegramReportStore.ts`
- [ ] Add `ResolutionStatus` type export (5 values only — NO "claimed"):
  ```typescript
  export type ResolutionStatus = "none" | "fixed" | "wontfix" | "duplicate" | "monitoring";
  ```
- [ ] Extend `TelegramReport` interface to include:
  - `resolution: ResolutionStatus`
  - `resolved_at: string | null`
- [ ] Keep `ReportStatus` as `"new" | "processed"` (no changes to status enum)
- [ ] All 10 columns in SELECT list (C-2: full column projection):
  ```typescript
  SELECT id, message_id, text, from_agent, priority, status,
         created_at, claimed_by, claimed_at, resolution, resolved_at
  ```

### AC-3: Fix SELECT Column Coverage (C-2 Constraint)

- [ ] Update `listNewReports()` to project all 10 columns (currently omits claimed_by/claimed_at/resolution/resolved_at)
- [ ] Update `listAllReports()` to project all 10 columns
- [ ] Update `getReport(id)` to project all 10 columns
- [ ] Update `listNewReportsUnclaimed()` to project all 10 columns
- [ ] Verify all other SELECT statements in the file follow the 10-column pattern

### AC-4: Store Functions — markResolved()

- [ ] Signature: `markResolved(db: Database, id: number, resolution: ResolutionStatus, resolvedAt?: string): void`
- [ ] Atomically set resolution + resolved_at on the row with given id
- [ ] If resolvedAt not provided, use `new Date().toISOString()`
- [ ] Use parameterized query (no SQL injection):
  ```typescript
  db.prepare(`UPDATE telegram_reports SET resolution = ?, resolved_at = ? WHERE id = ?`)
    .run(resolution, resolvedAt ?? new Date().toISOString(), id);
  ```
- [ ] Idempotent: calling twice with same id is safe (no error if row doesn't exist)

### AC-5: Store Functions — listUnresolvedReports()

- [ ] Signature: `listUnresolvedReports(db: Database): TelegramReport[]`
- [ ] Returns rows WHERE:
  - `resolution NOT IN ('fixed', 'wontfix', 'duplicate')`
  - `status != 'processed'`
- [ ] Includes `none` and `monitoring` rows (both should remain visible)
- [ ] Ordered by `created_at ASC`
- [ ] Projects all 10 columns

### AC-6: Store Functions — listResolvedReports()

- [ ] Signature: `listResolvedReports(db: Database, limit?: number): TelegramReport[]`
- [ ] Returns rows WHERE `resolution IN ('fixed', 'wontfix', 'duplicate')`
- [ ] Optional limit parameter (default: no limit)
- [ ] Useful for audit/archival queries
- [ ] Projects all 10 columns

### AC-7: Tests (226-telegram-report-store.test.ts)

- [ ] File: `apps/mcp-server/src/__tests__/226-telegram-report-store.test.ts`
- [ ] Add new describe block or inline tests:
  - `markResolved() sets resolution + resolved_at atomically`
  - `markResolved() with unknown id is idempotent (no error)`
  - `listUnresolvedReports() excludes fixed/wontfix/duplicate rows`
  - `listUnresolvedReports() includes monitoring + none rows`
  - `listUnresolvedReports() excludes status=processed rows`
- [ ] At least 5 new test cases
- [ ] All new tests pass: `bun test`
- [ ] Baseline maintained: ≥8804 tests pass, 0 fail

### AC-8: No Regressions

- [ ] Run `bun test` — entire test suite passes
- [ ] No tsc errors or warnings
- [ ] No changes to test baseline (testBaselineFail must remain 0)

---

## Implementation Notes

### Files to Modify

| File | Changes | Estimated Lines |
|------|---------|-----------------|
| `apps/mcp-server/src/infrastructure/db/schema-system.ts` | Add 2 ALTER TABLE + 1 CREATE INDEX | 8 |
| `apps/mcp-server/src/infrastructure/db/telegramReportStore.ts` | Type exports, 3 new functions, fix 4 SELECT statements | 65 |
| `apps/mcp-server/src/__tests__/226-telegram-report-store.test.ts` | Add 5 new test cases | 40 |

**Total: ~113 lines**

### Key Constraints from Architect

- **C-1:** ResolutionStatus must have 5 values only — remove "claimed" if present
- **C-2:** All SELECT statements must project all 10 columns (currently many omit claimed_by/claimed_at)
- **C-4:** Use try/catch pattern for ALTER TABLE, not IF NOT EXISTS (SQLite syntax)

### Backward-Compatibility

- Existing rows default to `resolution = 'none'`
- Existing rows have `resolved_at = NULL`
- All existing queries still work (new columns ignored by old code)
- No breaking changes to TelegramReport interface for old consumers

---

## Definition of Done

- [ ] AC-1..8 all checked
- [ ] Schema migration tested on clean DB
- [ ] SELECT column projection consistent across all functions
- [ ] Tests pass: `bun test` ≥8804 pass, 0 fail
- [ ] No regressions in existing functionality
- [ ] Code review: confirm C-2 fix applied to all SELECT statements
- [ ] Task report created in `reports/TASK_REPORT_1849a.md`

---

## Dependencies

- No external dependencies
- Must complete before 1849b and 1849c
- Parallel with 1849b (no file conflicts)

---

## Rollback Plan

If schema migration fails:
```bash
# Revert schema-system.ts to previous version
git checkout HEAD~ -- apps/mcp-server/src/infrastructure/db/schema-system.ts

# Manually drop columns on test DB (if needed):
# ALTER TABLE telegram_reports DROP COLUMN resolution;
# ALTER TABLE telegram_reports DROP COLUMN resolved_at;
# DROP INDEX IF EXISTS idx_telegram_reports_resolution;
```

