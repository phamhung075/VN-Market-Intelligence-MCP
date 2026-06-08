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

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  getPriorBreaches,
  isEscalationCooldownActive,
  recordSlaBreach,
  recordSlaRecovery,
  markEscalationSent,
} from "../scheduler/system/freshnessSlaMonitorJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema helper — mirrors schema-system.ts DDL exactly
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS sla_breach_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      signal_type TEXT NOT NULL CHECK(
        signal_type IN ('price', 'bctc', 'news', 'sbv_fx', 'foreign_flow')
      ),
      breached_at TEXT NOT NULL DEFAULT (datetime('now')),
      age_minutes INTEGER NOT NULL,
      threshold_minutes INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'breach_open' CHECK(
        status IN ('breach_open', 'recovered')
      ),
      severity TEXT NOT NULL CHECK(
        severity IN ('HIGH', 'CRITICAL')
      ),
      escalation_callback_sent INTEGER DEFAULT 0,
      recovered_at TEXT,
      UNIQUE(signal_type, breached_at)
    )
  `);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

let db: Database;

beforeEach(() => {
  db = makeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("1354b — freshnessSlaMonitorJob helper unit tests", () => {
  it("SLA-1: getPriorBreaches returns [] when sla_breach_audit is empty", () => {
    const result = getPriorBreaches(db);
    expect(result).toEqual([]);
  });

  it("SLA-2: getPriorBreaches returns open breaches, does not return recovered rows", () => {
    recordSlaBreach(db, "price", 90, 60, "HIGH");
    // Insert bctc breach with distinct breached_at to avoid UNIQUE collision
    db.run(`
      INSERT INTO sla_breach_audit (signal_type, breached_at, age_minutes, threshold_minutes, status, severity)
      VALUES ('bctc', datetime('now', '+1 second'), 200, 120, 'breach_open', 'CRITICAL')
    `);
    recordSlaRecovery(db, "bctc");

    const result = getPriorBreaches(db);

    expect(result.length).toBe(1);
    const first = result[0];
    expect(first).toBeDefined();
    expect(first!.signalType).toBe("price");
    expect(first!.status).toBe("breach_open");
  });

  it("SLA-3: isEscalationCooldownActive returns false when no escalation has been sent", () => {
    recordSlaBreach(db, "news", 90, 60, "HIGH");
    // escalation_callback_sent defaults to 0
    expect(isEscalationCooldownActive(db, "news")).toBe(false);
  });

  it("SLA-4: isEscalationCooldownActive returns true immediately after markEscalationSent", () => {
    recordSlaBreach(db, "sbv_fx", 90, 60, "HIGH");
    markEscalationSent(db, "sbv_fx");

    // Row has escalation_callback_sent=1 AND breached_at within 60 minutes
    expect(isEscalationCooldownActive(db, "sbv_fx")).toBe(true);
  });

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

  it("SLA-8: recordSlaRecovery is idempotent — second call on already-recovered row does not error", () => {
    recordSlaBreach(db, "news", 90, 60, "HIGH");
    recordSlaRecovery(db, "news"); // first call
    expect(() => recordSlaRecovery(db, "news")).not.toThrow(); // second call — WHERE status='breach_open' matches nothing, no-op

    interface Row { status: string }
    const rows = db.query<Row, []>(
      "SELECT status FROM sla_breach_audit WHERE signal_type = 'news'"
    ).all();

    // Still only one row, status still 'recovered'
    expect(rows.length).toBe(1);
    const firstRow = rows[0];
    expect(firstRow).toBeDefined();
    expect(firstRow!.status).toBe("recovered");
  });
});
