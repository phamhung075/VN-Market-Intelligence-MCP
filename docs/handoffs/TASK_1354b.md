# Handoff: Task 1354b — freshnessSlaMonitorJob helper unit tests

**Sprint:** 1354
**Created:** 2026-04-27
**Status:** Ready for Developer

---

## Context

Sprint 1352c added integration coverage for `runFreshnessSlaMonitor` orchestration and `querySignalAges`. The five DB-write helper functions exported from `freshnessSlaMonitorJob.ts` have no unit tests. These functions write to the `sla_breach_audit` table — the audit trail for SLA breaches and recovery. A silent bug here corrupts breach history and causes missed alerts or phantom escalations.

**Pattern reference:** `1353b-price-update-watchdog-job-gaps.test.ts` — in-memory SQLite db, `beforeEach` reset, functional verification against DB state.

---

## Production change required

**None.** All five helpers already accept `db: Database` as their first argument. No DI additions are needed.

---

## Test file to create

**Path:** `apps/mcp-server/src/__tests__/1354b-freshness-sla-monitor-helpers.test.ts`

### File header

```typescript
/**
 * TASK_1354b — freshnessSlaMonitorJob helper unit tests
 *
 * Tests the 5 DB-write helpers in freshnessSlaMonitorJob.ts.
 * All functions accept db: Database — no DI change needed.
 *
 *   SLA-1: getPriorBreaches — empty when no open breaches
 *   SLA-2: getPriorBreaches — returns open breaches, ignores 'recovered' rows
 *   SLA-3: isEscalationCooldownActive — false when no recent escalation
 *   SLA-4: isEscalationCooldownActive — true within 60-min window after markEscalationSent
 *   SLA-5: recordSlaBreach — inserts correct row with status='breach_open'
 *   SLA-6: recordSlaRecovery — updates status to 'recovered' + sets recovered_at
 *   SLA-7: markEscalationSent — sets escalation_callback_sent=1 on most recent open breach
 *   SLA-8: recordSlaRecovery — idempotent, second call does not error
 */

Bun.env["DB_PATH"] = ":memory:";
```

### Imports

```typescript
import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  getPriorBreaches,
  isEscalationCooldownActive,
  recordSlaBreach,
  recordSlaRecovery,
  markEscalationSent,
} from "../scheduler/system/freshnessSlaMonitorJob.js";
```

### Schema setup helper

```typescript
function makeDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE sla_breach_audit (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_type               TEXT    NOT NULL,
      age_minutes               INTEGER NOT NULL,
      threshold_minutes         INTEGER NOT NULL,
      status                    TEXT    NOT NULL DEFAULT 'breach_open',
      severity                  TEXT    NOT NULL,
      breached_at               TEXT    NOT NULL DEFAULT (datetime('now')),
      recovered_at              TEXT,
      escalation_callback_sent  INTEGER NOT NULL DEFAULT 0
    )
  `);
  return db;
}

let db: Database;

beforeEach(() => {
  db = makeDb();
});
```

---

### Test cases

**SLA-1 — getPriorBreaches returns empty when no rows**
```typescript
it("SLA-1: getPriorBreaches returns [] when sla_breach_audit is empty", () => {
  const result = getPriorBreaches(db);
  expect(result).toEqual([]);
});
```

**SLA-2 — getPriorBreaches returns open breaches, ignores recovered**
```typescript
it("SLA-2: getPriorBreaches returns open breaches, does not return recovered rows", () => {
  recordSlaBreach(db, "price", 90, 60, "HIGH");
  recordSlaBreach(db, "bctc", 200, 120, "CRITICAL");
  // Immediately recover bctc
  recordSlaRecovery(db, "bctc");

  const result = getPriorBreaches(db);

  expect(result.length).toBe(1);
  expect(result[0].signalType).toBe("price");
  expect(result[0].status).toBe("breach_open");
});
```

**SLA-3 — isEscalationCooldownActive false when no escalation sent**
```typescript
it("SLA-3: isEscalationCooldownActive returns false when no escalation has been sent", () => {
  recordSlaBreach(db, "news", 90, 60, "HIGH");
  // escalation_callback_sent defaults to 0
  expect(isEscalationCooldownActive(db, "news")).toBe(false);
});
```

**SLA-4 — isEscalationCooldownActive true after markEscalationSent**
```typescript
it("SLA-4: isEscalationCooldownActive returns true immediately after markEscalationSent", () => {
  recordSlaBreach(db, "sbv_fx", 90, 60, "HIGH");
  markEscalationSent(db, "sbv_fx");

  // The row now has escalation_callback_sent=1 AND breached_at within 60 minutes
  expect(isEscalationCooldownActive(db, "sbv_fx")).toBe(true);
});
```

**SLA-5 — recordSlaBreach inserts correct row**
```typescript
it("SLA-5: recordSlaBreach inserts row with correct signalType, age, threshold, severity, status='breach_open'", () => {
  recordSlaBreach(db, "foreign_flow", 75, 60, "CRITICAL");

  interface Row {
    signal_type: string;
    age_minutes: number;
    threshold_minutes: number;
    severity: string;
    status: string;
    escalation_callback_sent: number;
  }

  const row = db.query<Row, []>(
    "SELECT * FROM sla_breach_audit LIMIT 1"
  ).get();

  expect(row).not.toBeNull();
  expect(row!.signal_type).toBe("foreign_flow");
  expect(row!.age_minutes).toBe(75);
  expect(row!.threshold_minutes).toBe(60);
  expect(row!.severity).toBe("CRITICAL");
  expect(row!.status).toBe("breach_open");
  expect(row!.escalation_callback_sent).toBe(0);
});
```

**SLA-6 — recordSlaRecovery updates status and sets recovered_at**
```typescript
it("SLA-6: recordSlaRecovery updates status to 'recovered' and sets recovered_at", () => {
  recordSlaBreach(db, "price", 90, 60, "HIGH");
  recordSlaRecovery(db, "price");

  interface Row { status: string; recovered_at: string | null }
  const row = db.query<Row, []>(
    "SELECT status, recovered_at FROM sla_breach_audit LIMIT 1"
  ).get();

  expect(row!.status).toBe("recovered");
  expect(row!.recovered_at).not.toBeNull();
});
```

**SLA-7 — markEscalationSent sets flag on most recent open breach**
```typescript
it("SLA-7: markEscalationSent sets escalation_callback_sent=1 on the most recent open breach", () => {
  recordSlaBreach(db, "bctc", 130, 120, "CRITICAL");
  markEscalationSent(db, "bctc");

  interface Row { escalation_callback_sent: number; status: string }
  const row = db.query<Row, []>(
    "SELECT escalation_callback_sent, status FROM sla_breach_audit WHERE signal_type = 'bctc' ORDER BY id DESC LIMIT 1"
  ).get();

  expect(row!.escalation_callback_sent).toBe(1);
  expect(row!.status).toBe("breach_open"); // status unchanged
});
```

**SLA-8 — recordSlaRecovery is idempotent**
```typescript
it("SLA-8: recordSlaRecovery is idempotent — second call on already-recovered row does not error", () => {
  recordSlaBreach(db, "news", 90, 60, "HIGH");
  recordSlaRecovery(db, "news"); // first call
  expect(() => recordSlaRecovery(db, "news")).not.toThrow(); // second call

  interface Row { status: string }
  const rows = db.query<Row, []>(
    "SELECT status FROM sla_breach_audit WHERE signal_type = 'news'"
  ).all();

  // Still only one row, status still 'recovered'
  expect(rows.length).toBe(1);
  expect(rows[0].status).toBe("recovered");
});
```

---

## Acceptance criteria

- [ ] `1354b-freshness-sla-monitor-helpers.test.ts` created with 8 tests
- [ ] All 8 tests pass against the existing production file with zero production changes
- [ ] Schema in test file matches the actual `sla_breach_audit` DDL (verify against `apps/mcp-server/src/infrastructure/db/schema.ts` before committing)
- [ ] TypeScript strict: no `any`, no suppressed errors
- [ ] Full suite remains ≥7673 + 8 new passing

---

## Risk flags

- **Schema verification required:** The `makeDb()` helper in the test manually recreates the `sla_breach_audit` table DDL. Developer must cross-check column names and types against the actual schema migration before the tests run. If the DDL diverges, tests will fail with SQL errors.
- **`markEscalationSent` uses `ORDER BY breached_at DESC LIMIT 1`** — the production query targets the single most-recent open breach. SLA-7 inserts only one row so this is unambiguous. If testing multiple open breaches for the same signal type is ever needed, a future test must insert with explicit `breached_at` values.
- **`isEscalationCooldownActive` uses `datetime('now', '-60 minutes')`** — SLA-4 relies on the row's `breached_at` defaulting to `datetime('now')`, which will always be within the 60-minute window immediately after insert. This is correct and deterministic in in-memory SQLite.
