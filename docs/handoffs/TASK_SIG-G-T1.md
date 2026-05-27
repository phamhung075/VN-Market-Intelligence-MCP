# TASK_SIG-G-T1 — Schema + Store (improveCheckStore.ts)

Sprint SELF-IMPROVE-GATE · Phase 2 lane-B proven-gate CODE · Task 1 of 6 dev tasks

**Owner:** dev-mcp-server | **Handoff from:** PM (SIG-IMPL-GATE decomposition) | **Date:** 2026-05-27

---

## Task Summary

Add the `improve_check_log` table to the system schema (SPIKE_1947 §8 verbatim) and write the infrastructure store for snapshot write/read operations.

**Files to create/modify:**
1. `apps/mcp-server/src/infrastructure/db/schema-system.ts` — Modify: add `improve_check_log` table + index to `initSystemTables()`
2. `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts` — NEW file with 4 exported functions + types

**Test file:** `apps/mcp-server/src/__tests__/1948a-improve-check-store.test.ts` — 6 acceptance criteria tests

**Dependencies:** None (this is the serial head of the chain)

**Blocked by:** Nothing

**Blocks:** TASK-2 (degradationRules.ts detection function needs to read baseline from this store)

---

## DDD Layer

- **Database (Infrastructure):** Table DDL lives in `schema-system.ts`, in the existing `initSystemTables()` function
- **Data Access (Infrastructure):** Store functions live in NEW `improveCheckStore.ts` — injectable `db` parameter, no `getDb()` calls inside

**Layer boundary:** `improveCheckStore.ts` has ZERO imports from domain or application layers. Only imports:
- `bun:sqlite` types (`Database`)
- Local type definitions (`ImproveCheckRow`, etc.)
- Infrastructure-level logger (optional, for error logging only)

---

## SQL Schema (SPIKE §8 — do not modify)

```sql
CREATE TABLE IF NOT EXISTS improve_check_log (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_type      TEXT    NOT NULL,
  window_7d_rate   REAL,
  window_30d_rate  REAL,
  sample_count_7d  INTEGER,
  sample_count_30d INTEGER,
  hypothesis       TEXT,
  dispatch_status  TEXT    NOT NULL DEFAULT 'shadow',
  fix_signal_id    TEXT,
  checked_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  rechecked_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_improve_check_log_signal_type
  ON improve_check_log(signal_type, checked_at DESC);
```

**dispatch_status enum values:** `'shadow' | 'dispatched' | 'deferred_wip_cap' | 'improvement_confirmed' | 'no_improvement' | 'worsened'`

---

## TypeScript Interfaces

```typescript
// apps/mcp-server/src/infrastructure/db/improveCheckStore.ts

import type { Database } from 'bun:sqlite';

export type DispatchStatus =
  | 'shadow'
  | 'dispatched'
  | 'deferred_wip_cap'
  | 'improvement_confirmed'
  | 'no_improvement'
  | 'worsened';

export interface ImproveCheckRow {
  id: number;
  signal_type: string;
  window_7d_rate: number | null;
  window_30d_rate: number | null;
  sample_count_7d: number | null;
  sample_count_30d: number | null;
  hypothesis: string | null;
  dispatch_status: DispatchStatus;
  fix_signal_id: string | null;
  checked_at: string;       // ISO-8601 UTC
  rechecked_at: string | null;
}

export interface ImproveCheckInsert {
  signal_type: string;
  window_7d_rate?: number | null;
  window_30d_rate?: number | null;
  sample_count_7d?: number | null;
  sample_count_30d?: number | null;
  hypothesis?: string | null;
  dispatch_status?: DispatchStatus;  // default 'shadow'
  fix_signal_id?: string | null;
}

export interface GetBaselineOpts {
  withinDays?: number;  // default 7
}

export interface UpdateDispatchOpts {
  rechecked_at?: string;
  fix_signal_id?: string;
}

/**
 * Insert a new improve_check_log row with dispatch_status='shadow' by default.
 * Throws if signal_type is empty (fail-loud).
 * Returns the new row id.
 */
export function insertImproveCheckSnapshot(
  db: Database,
  row: ImproveCheckInsert,
): number;

/**
 * Retrieve the most recent row for a given signal_type within the lookback window.
 * Returns null if no row found or if the table does not exist.
 * Returns null-safe (never throws on missing table).
 */
export function getBaselineForSignalType(
  db: Database,
  signal_type: string,
  opts?: GetBaselineOpts,
): ImproveCheckRow | null;

/**
 * Retrieve all rows with dispatch_status='dispatched' and checked_at older than 7 days,
 * where rechecked_at is null (pending recheck).
 * Used by future Phase 3 recheck loop; function exists but is not called by Phase 2.
 */
export function getPendingRecheckRows(
  db: Database,
): ImproveCheckRow[];

/**
 * Update dispatch_status and optional fields for an existing row.
 * Called by orchestrator to transition 'shadow' → 'dispatched' (when kill-switch is true),
 * and by future recheck step.
 */
export function updateDispatchStatus(
  db: Database,
  id: number,
  status: DispatchStatus,
  opts?: UpdateDispatchOpts,
): void;
```

---

## Acceptance Criteria

### AC-T1-1: `initSystemTables()` is idempotent

**Requirement:** Running the extended `initSystemTables()` twice on the same DB must produce no error and no data loss.

**Test:** Call `initSystemTables(db)` twice on an `:memory:` database. Assert the table exists with correct columns + index after both calls. Assert no exceptions thrown.

**Evidence to paste:**
```
Test result: PASS
initSystemTables called twice on :memory: DB
improve_check_log table exists after first call: YES
improve_check_log table exists after second call: YES
Index idx_improve_check_log_signal_type created: YES
No exceptions thrown: YES
```

---

### AC-T1-2: `insertImproveCheckSnapshot` returns valid id

**Requirement:** Inserting two rows must return sequential ids (1, 2).

**Test:** Insert two rows with different signal_types. Assert returned ids are 1 and 2.

**Evidence to paste:**
```
Test result: PASS
Row 1 signal_type='price_confirmation': id returned = 1
Row 2 signal_type='chain_catalyst': id returned = 2
Both rows inserted successfully
```

---

### AC-T1-3: `getBaselineForSignalType` returns null when table is absent

**Requirement:** Calling `getBaselineForSignalType` against a DB that has NOT had `initSystemTables()` called must return `null` (not throw).

**Test:** Create a `:memory:` DB WITHOUT calling `initSystemTables()`. Call `getBaselineForSignalType(db, 'price_confirmation')`. Assert returns `null`.

**Evidence to paste:**
```
Test result: PASS
DB created without initSystemTables()
getBaselineForSignalType('price_confirmation') returns: null
No exception thrown: YES
```

---

### AC-T1-4: `getBaselineForSignalType` returns most recent row (not oldest)

**Requirement:** When multiple rows exist for the same signal_type, the function must return the row with the latest `checked_at`, not the oldest.

**Test:** Insert two rows for `signal_type='volume_spike'` with different `checked_at` timestamps (T1 and T2, where T2 > T1). Call `getBaselineForSignalType`. Assert the returned row has `checked_at=T2`.

**Evidence to paste:**
```
Test result: PASS
Row 1 inserted with checked_at='2026-05-27T09:00:00Z': id=1
Row 2 inserted with checked_at='2026-05-27T10:00:00Z': id=2
getBaselineForSignalType returns: id=2 (most recent)
checked_at returned: '2026-05-27T10:00:00Z'
```

---

### AC-T1-5: `insertImproveCheckSnapshot` throws on missing signal_type

**Requirement:** Fail-loud behavior: if `signal_type` is missing or empty, the function must throw an error with a descriptive message (not silently insert a null-valued row).

**Test:** Call `insertImproveCheckSnapshot(db, { signal_type: '' })`. Assert throws an error containing the word "signal_type".

**Evidence to paste:**
```
Test result: PASS
insertImproveCheckSnapshot with empty signal_type throws: YES
Error message contains 'signal_type': YES
Error message: '[improveCheckStore] invalid signal_type: empty string'
No row inserted: YES
```

---

### AC-T1-6: No regression on existing tables

**Requirement:** Running the extended `initSystemTables()` must not modify or delete existing rows in pre-existing tables.

**Test:** Insert one row into `cron_job_runs` (an existing table). Call `initSystemTables()`. Query `cron_job_runs` and assert the row is still present.

**Evidence to paste:**
```
Test result: PASS
Inserted cron_job_runs row: { job_name='test', status='success' }
Called initSystemTables()
cron_job_runs row still present: YES
Row data unchanged: YES
```

---

## Hardening Notes (from PO spec-gate HN-1, HN-2)

**HN-1 (Cron premise):** The blueprint's rationale mentions `bctcOverdueCheck = '0 9 * * 1-5'` (weekdays), but live `cronConfig.ts:26` is `0 9 * * *` (DAILY). The offset decision to `2 9 * * *` is correct regardless. Do NOT propagate the false premise into the dev task; use `2 9 * * *` and verify the real neighbors in cronConfig.ts at implementation time (TASK-3 concern, not TASK-1).

**HN-2 (Anti-runaway order):** REQ TASK-3 step 8 says `DEGRADED > COVERAGE_GAP > PERSISTENTLY_LOW`; the architect blueprint says `DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP`. The ARCHITECT's order is canonical. This does NOT affect TASK-1 (schema only).

---

## Implementation Notes

1. **Folder structure:** The folder `apps/mcp-server/src/infrastructure/db/` already exists. Create the new file in that folder.

2. **`dispatch_status` validation:** In `insertImproveCheckSnapshot()`, validate that the `dispatch_status` value (if provided) is one of the enum values. Throw a descriptive error if not. This is APPLICATION-LAYER validation (fail-loud-first per protocol).

3. **Missing table fallback:** The `getBaselineForSignalType()` function must catch and handle the case where the table does not exist (e.g., on a DB that has NOT had `initSystemTables()` called yet). Return `null` rather than let the error propagate (AC-T1-3).

4. **Module header comment:** Add a comment block at the top of `improveCheckStore.ts` documenting the module purpose and that the store is injectable (no `getDb()` calls).

5. **No git adds/commits:** Leave all files UNSTAGED for the main terminal to serialize the commit. Do NOT run `git add` or `git commit` yourself.

---

## Files Touched

| File | Change | Lines |
|---|---|---|
| `apps/mcp-server/src/infrastructure/db/schema-system.ts` | Modify: add DDL to `initSystemTables()` | ~15 new |
| `apps/mcp-server/src/infrastructure/db/improveCheckStore.ts` | NEW | ~120 lines |
| `apps/mcp-server/src/__tests__/1948a-improve-check-store.test.ts` | NEW | ~200 lines (6 test suites) |

---

## Submission Checklist

- [ ] `improveCheckStore.ts` created with all 4 functions + types
- [ ] `schema-system.ts` modified with `improve_check_log` DDL + index
- [ ] Test file created with 6 ACs passing
- [ ] AC-T1-1 through AC-T1-6 all PASS in `bun test`
- [ ] No regression: existing table tests still pass
- [ ] No bare `except` / silent swallows in new code (fail-loud-first)
- [ ] Zero `getDb()` calls inside `improveCheckStore.ts`
- [ ] All files UNSTAGED (NOT staged with `git add`, left for main terminal commit)
- [ ] No new branches created (all on `main`)

---

## Next Task

After this task is complete and verified PASS, the next task is **TASK-2 (SIG-G-T2)**: `degradationRules.ts` detection function. TASK-2 depends on TASK-1 (reads baseline via `improveCheckStore.ts`).
