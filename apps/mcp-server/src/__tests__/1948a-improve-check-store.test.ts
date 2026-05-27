/**
 * 1948a-improve-check-store.test.ts
 *
 * Acceptance criteria TASK-1: schema + improveCheckStore.ts
 * AC-T1-1 through AC-T1-6
 *
 * All tests use :memory: DB — zero network, zero real DB.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  insertImproveCheckSnapshot,
  getBaselineForSignalType,
  getPendingRecheckRows,
  updateDispatchStatus,
  type ImproveCheckRow,
} from "../infrastructure/db/improveCheckStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: create a fresh :memory: DB with system tables
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-T1-1: initSystemTables() is idempotent
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T1-1: initSystemTables idempotent", () => {
  test("calling initSystemTables twice creates the table and index without error", () => {
    const db = new Database(":memory:");

    // First call
    expect(() => initSystemTables(db)).not.toThrow();

    // Second call — must not throw
    expect(() => initSystemTables(db)).not.toThrow();

    // Table exists after both calls
    const tableRow = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='improve_check_log'",
      )
      .get() as { name: string } | undefined;
    expect(tableRow?.name).toBe("improve_check_log");

    // Index exists
    const idxRow = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_improve_check_log_signal_type'",
      )
      .get() as { name: string } | undefined;
    expect(idxRow?.name).toBe("idx_improve_check_log_signal_type");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T1-2: insertImproveCheckSnapshot returns valid sequential ids
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T1-2: insertImproveCheckSnapshot returns sequential ids", () => {
  test("two inserts return ids 1 and 2", () => {
    const db = makeDb();

    const id1 = insertImproveCheckSnapshot(db, {
      signal_type: "price_confirmation",
    });
    const id2 = insertImproveCheckSnapshot(db, {
      signal_type: "chain_catalyst",
    });

    expect(id1).toBe(1);
    expect(id2).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T1-3: getBaselineForSignalType returns null when table is absent
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T1-3: getBaselineForSignalType null-safe on missing table", () => {
  test("returns null (not throw) when table does not exist", () => {
    const db = new Database(":memory:");
    // Deliberately do NOT call initSystemTables

    let result: ImproveCheckRow | null = undefined as unknown as ImproveCheckRow | null;
    expect(() => {
      result = getBaselineForSignalType(db, "price_confirmation");
    }).not.toThrow();

    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T1-4: getBaselineForSignalType returns most recent row
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T1-4: getBaselineForSignalType returns most recent row", () => {
  test("returns the row with the latest checked_at", () => {
    const db = makeDb();

    // Insert row with earlier checked_at by overriding via direct SQL
    db.prepare(
      `INSERT INTO improve_check_log (signal_type, dispatch_status, checked_at)
       VALUES ('volume_spike', 'shadow', '2026-05-27T09:00:00Z')`,
    ).run();

    db.prepare(
      `INSERT INTO improve_check_log (signal_type, dispatch_status, checked_at)
       VALUES ('volume_spike', 'shadow', '2026-05-27T10:00:00Z')`,
    ).run();

    const result = getBaselineForSignalType(db, "volume_spike", {
      withinDays: 30,
    });

    expect(result).not.toBeNull();
    expect(result!.checked_at).toBe("2026-05-27T10:00:00Z");
    expect(result!.id).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T1-5: insertImproveCheckSnapshot throws on missing signal_type
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T1-5: insertImproveCheckSnapshot throws on empty signal_type", () => {
  test("throws with 'signal_type' in the error message", () => {
    const db = makeDb();

    expect(() =>
      insertImproveCheckSnapshot(db, { signal_type: "" }),
    ).toThrow(/signal_type/);
  });

  test("no row is inserted when signal_type is empty", () => {
    const db = makeDb();

    try {
      insertImproveCheckSnapshot(db, { signal_type: "" });
    } catch {
      // expected
    }

    const count = (
      db.prepare("SELECT COUNT(*) AS cnt FROM improve_check_log").get() as {
        cnt: number;
      }
    ).cnt;
    expect(count).toBe(0);
  });

  test("throws on whitespace-only signal_type", () => {
    const db = makeDb();
    expect(() =>
      insertImproveCheckSnapshot(db, { signal_type: "   " }),
    ).toThrow(/signal_type/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T1-6: No regression on existing tables
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T1-6: initSystemTables does not destroy existing rows", () => {
  test("cron_job_runs row survives a second call to initSystemTables", () => {
    const db = makeDb();

    // Insert a row into cron_job_runs (pre-existing table)
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status)
       VALUES ('test', datetime('now'), 'success')`,
    ).run();

    // Call initSystemTables again
    initSystemTables(db);

    // Row still present
    const row = db
      .prepare("SELECT job_name, status FROM cron_job_runs WHERE job_name='test'")
      .get() as { job_name: string; status: string } | undefined;

    expect(row).toBeDefined();
    expect(row!.job_name).toBe("test");
    expect(row!.status).toBe("success");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional coverage: dispatch_status validation + updateDispatchStatus
// ─────────────────────────────────────────────────────────────────────────────

describe("Extra: dispatch_status validation and updateDispatchStatus", () => {
  test("insertImproveCheckSnapshot accepts valid dispatch_status 'dispatched'", () => {
    const db = makeDb();
    const id = insertImproveCheckSnapshot(db, {
      signal_type: "volume_spike",
      dispatch_status: "dispatched",
    });
    expect(id).toBe(1);
  });

  test("insertImproveCheckSnapshot throws on invalid dispatch_status", () => {
    const db = makeDb();
    expect(() =>
      insertImproveCheckSnapshot(db, {
        signal_type: "volume_spike",
        dispatch_status: "invalid_status" as never,
      }),
    ).toThrow(/dispatch_status/);
  });

  test("updateDispatchStatus transitions shadow to dispatched", () => {
    const db = makeDb();
    const id = insertImproveCheckSnapshot(db, {
      signal_type: "price_confirmation",
      dispatch_status: "shadow",
    });

    updateDispatchStatus(db, id, "dispatched");

    const row = db
      .prepare("SELECT dispatch_status FROM improve_check_log WHERE id = ?")
      .get(id) as { dispatch_status: string };
    expect(row.dispatch_status).toBe("dispatched");
  });

  test("getPendingRecheckRows returns empty array on fresh DB", () => {
    const db = makeDb();
    const rows = getPendingRecheckRows(db);
    expect(rows).toEqual([]);
  });
});
