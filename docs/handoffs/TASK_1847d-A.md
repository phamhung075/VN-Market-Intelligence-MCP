# TASK-1847d-A — Infrastructure: Schema Migration + Alert Store Methods

**Task:** 1847d-A | **Status:** READY FOR DEVELOPER
**Sprint:** 1847
**Owner:** dev-alert-engine
**Arch Design:** docs/handoffs/ARCH_1847d.md (sections 2, 4)

---

## Summary

Add 3 new columns to `alerts` table (outcome, outcome_at, outcome_detail) via idempotent migration. Implement 2 new store methods for querying pending alerts and writing outcomes.

**Files to create/modify: 2**
**Files to create: 0**
**Files to modify: 2**
**Tests: 5 (3 migration + 2 store)**

---

## Files

### 1. MODIFY: `apps/mcp-server/src/infrastructure/db/schema-alerts.ts`

**Change:** Append 3 idempotent ALTER TABLE commands + 1 index to existing migration loop

```typescript
// In initAlertsTables() function, append to existing for-loop:

for (const [col, ddl] of [
  // ... existing entries ...
  ["outcome",        "TEXT"],
  ["outcome_at",     "TEXT"],
  ["outcome_detail", "TEXT"],
] as const) {
  try { db.exec(`ALTER TABLE alerts ADD COLUMN ${col} ${ddl}`); } catch {}
}

// Index for job query performance
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_outcome ON alerts(outcome)`);
} catch {}
```

**Pattern:** Exact same idempotent try/catch as 6 existing columns (notified_telegram, resolved_at, etc.)
**Rationale:** No migration file needed — schema module runs at startup, aligns with existing pattern

**Test requirements (AC-1, AC-2):**
- [ ] After migration, `alerts` table has 3 new columns (SELECT info schema)
- [ ] Migration is idempotent (re-run schema.ts → no error)

---

### 2. MODIFY: `apps/mcp-server/src/infrastructure/db/alertStore.ts`

**Change:** Add 2 new functions

#### 2a. `readPendingOutcomeAlerts(db: Database, minEvalWindowDays: number): AlertOutcomeRow[]`

```typescript
export interface AlertOutcomeRow {
  id: string;
  triggered_at: string;
  signals_json: string | null;
  affected_actions_json: string | null;
  message: string | null;
}

export function readPendingOutcomeAlerts(
  db: Database,
  minEvalWindowDays: number = 3,
): AlertOutcomeRow[] {
  const stmt = db.prepare(`
    SELECT
      id,
      triggered_at,
      signals_json,
      affected_actions_json,
      message
    FROM alerts
    WHERE outcome IS NULL
      AND triggered_at <= datetime('now', '-' || ? || ' days')
    ORDER BY triggered_at ASC
    LIMIT 500
  `);
  return stmt.all(minEvalWindowDays) as AlertOutcomeRow[];
}
```

**Rationale:**
- WHERE outcome IS NULL — only unscored alerts
- triggered_at <= NOW - minEvalWindowDays — enforces eval window elapsed (NFR-4)
- LIMIT 500 — performance target <5s per job run (NFR-1)
- ORDER BY triggered_at ASC — oldest first (FIFO)

#### 2b. `writeAlertOutcome(db: Database, alertId: string, outcome: AlertOutcome, outcomeAt: string, detail: string): void`

```typescript
export function writeAlertOutcome(
  db: Database,
  alertId: string,
  outcome: 'hit' | 'miss' | 'unknown',
  outcomeAt: string, // ISO 8601
  detail: string,
): void {
  const stmt = db.prepare(`
    UPDATE alerts
    SET outcome = ?, outcome_at = ?, outcome_detail = ?
    WHERE id = ? AND outcome IS NULL
  `);
  stmt.run(outcome, outcomeAt, alertId);
}
```

**Rationale:**
- WHERE outcome IS NULL — enforces idempotency (NFR-2). Re-run never overwrites existing outcome.
- Called within transaction batch in alertOutcomeJob (not per-row)

**Test requirements (AC-3, AC-4, AC-5):**
- [ ] readPendingOutcomeAlerts() returns alerts with outcome=NULL, triggered_at >= cutoff, ≤500 results
- [ ] readPendingOutcomeAlerts() ignores alerts with outcome!=NULL
- [ ] writeAlertOutcome() updates outcome, outcome_at, outcome_detail in DB
- [ ] writeAlertOutcome() with WHERE outcome IS NULL guards against double-write (rerun doesn't overwrite)
- [ ] Schema index idx_alerts_outcome exists (explain plan FASTER than full table scan)

---

## Acceptance Criteria

| ID | Criterion | Test |
|----|-----------|------|
| AC-1 | `alerts` table has `outcome TEXT`, `outcome_at TEXT`, `outcome_detail TEXT` after migration | SELECT info schema |
| AC-2 | Migration is idempotent; re-run schema.ts does not error | Re-run, no throw |
| AC-3 | `readPendingOutcomeAlerts()` returns alerts WHERE outcome IS NULL AND triggered_at old enough | Unit test |
| AC-4 | `readPendingOutcomeAlerts()` respects LIMIT 500 (batch cap) | Unit test |
| AC-5 | `writeAlertOutcome()` with WHERE outcome IS NULL guard prevents double-write | Unit test re-write same alert |
| AC-6 | Index `idx_alerts_outcome` created and usable in query plan | sqlite EXPLAIN QUERY PLAN |
| AC-7 | `bun test` passes all 5 tests (3 migration + 2 store) | bun test 1847d-alert-infra |

---

## Dependencies

**Blocks:** 1847d-B (domain scorer needs alertOutcomeRow type), 1847d-C (job needs these store methods), 1847d-D (mark_alert_outcome tool needs writeAlertOutcome)

**No blockers.** Can start immediately.

---

## Notes

- NO changes to `market_prices_history` table — job queries it directly (existing pattern)
- NO changes to alert firing logic — this task is read-only on triggered_at, signals_json, message
- Import `AlertOutcome` type from domain (to be created in 1847d-B) or define locally if needed first
