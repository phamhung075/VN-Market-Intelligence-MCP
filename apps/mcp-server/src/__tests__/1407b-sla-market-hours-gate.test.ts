/**
 * TASK 1407b — SLA Monitor: Skip price+foreign_flow Escalations Outside Market Hours
 *
 * Tests the market-hours gate added to runFreshnessSlaMonitor().
 *
 * All tests inject:
 *   - db: in-memory SQLite with full schema applied
 *   - escalateToCommander: spy (records calls, never throws)
 *   - isVnMarketHours mock: controlled via fakeNow Date argument passed through
 *
 * Strategy: runFreshnessSlaMonitor() passes `now` to checkDataFreshnessSla() already.
 * The market-hours gate uses isVnMarketHours(now) from the same domain service.
 * We exercise the gate by passing a fake `now` that is either inside or outside
 * VN market hours (02:00–08:59 UTC Mon–Fri).
 *
 * Covered cases:
 *   MH-1: Off-hours + price breach    → escalation NOT called, breach IS recorded
 *   MH-2: Off-hours + foreign_flow    → escalation NOT called, breach IS recorded
 *   MH-3: Off-hours + bctc breach     → escalation IS called (24/7 source)
 *   MH-4: Off-hours + news breach     → escalation IS called (24/7 source)
 *   MH-5: Off-hours + sbv_fx breach   → escalation IS called (24/7 source)
 *   MH-6: Market hours + price        → escalation IS called
 *   MH-7: Market hours + foreign_flow → escalation IS called
 *   MH-8: Off-hours gate does not affect recovery tracking (recoveries still recorded)
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  runFreshnessSlaMonitor,
  type EscalationCallback,
} from "../scheduler/system/freshnessSlaMonitorJob.js";
import type { SignalType } from "../domain/services/freshnessSlaChecker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants — reference times
// ─────────────────────────────────────────────────────────────────────────────

// Monday 2026-04-27 00:30 UTC = off-hours (before 02:00 UTC)
const OFF_HOURS_DATE = new Date("2026-04-27T00:30:00.000Z");

// Monday 2026-04-27 04:00 UTC = market hours (02:00–08:59 UTC)
const MARKET_HOURS_DATE = new Date("2026-04-27T04:00:00.000Z");

// ─────────────────────────────────────────────────────────────────────────────
// Schema helper — mirrors sla_breach_audit DDL from schema-system.ts exactly
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
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: build a signalAges map with exactly one stale signal
// ─────────────────────────────────────────────────────────────────────────────

type SignalAges = Record<SignalType, number>;

function freshAges(): SignalAges {
  return { price: 0, bctc: 0, news: 0, sbv_fx: 0, foreign_flow: 0 };
}

function staleAges(signalType: SignalType, ageMinutes: number): SignalAges {
  const ages = freshAges();
  ages[signalType] = ageMinutes;
  return ages;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: spy escalation callback
// ─────────────────────────────────────────────────────────────────────────────

function makeEscalateSpy(): {
  spy: EscalationCallback;
  calls: Array<{ signalType: SignalType; ageMinutes: number }>;
} {
  const calls: Array<{ signalType: SignalType; ageMinutes: number }> = [];
  const spy: EscalationCallback = async (signalType, ageMinutes) => {
    calls.push({ signalType, ageMinutes });
  };
  return { spy, calls };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: count audit rows for a signal type
// ─────────────────────────────────────────────────────────────────────────────

interface CountRow { cnt: number }

function auditCount(db: Database, signalType: SignalType): number {
  const row = db
    .query<CountRow, [string]>(
      "SELECT COUNT(*) as cnt FROM sla_breach_audit WHERE signal_type = ?"
    )
    .get(signalType);
  return row?.cnt ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
  db = makeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("1407b — SLA monitor market-hours gate", () => {
  // ───────────────────────────────────────────────────────────────────────────
  // MH-1: Off-hours + price breach → escalation suppressed, breach recorded
  // ───────────────────────────────────────────────────────────────────────────

  it("MH-1: off-hours + price stale 15 min → escalation NOT called, breach IS recorded", async () => {
    const { spy, calls } = makeEscalateSpy();

    const result = await runFreshnessSlaMonitor(
      db,
      spy,
      staleAges("price", 15),
      OFF_HOURS_DATE
    );

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(0);
    expect(calls.length).toBe(0);
    // Audit row still written for offline breach audit trail
    expect(auditCount(db, "price")).toBe(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MH-2: Off-hours + foreign_flow breach → escalation suppressed, breach recorded
  // ───────────────────────────────────────────────────────────────────────────

  it("MH-2: off-hours + foreign_flow stale 15 min → escalation NOT called, breach IS recorded", async () => {
    const { spy, calls } = makeEscalateSpy();

    const result = await runFreshnessSlaMonitor(
      db,
      spy,
      staleAges("foreign_flow", 15),
      OFF_HOURS_DATE
    );

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(0);
    expect(calls.length).toBe(0);
    expect(auditCount(db, "foreign_flow")).toBe(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MH-3: Off-hours + bctc breach → escalation IS called (24/7 source)
  // ───────────────────────────────────────────────────────────────────────────

  it("MH-3: off-hours + bctc stale 400 min → escalation IS called (24/7 source)", async () => {
    const { spy, calls } = makeEscalateSpy();

    // bctc off-hours threshold = 360 min; 400 > 360 → breach
    const result = await runFreshnessSlaMonitor(
      db,
      spy,
      staleAges("bctc", 400),
      OFF_HOURS_DATE
    );

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0]!.signalType).toBe("bctc");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MH-4: Off-hours + news breach → escalation IS called (24/7 source)
  // ───────────────────────────────────────────────────────────────────────────

  it("MH-4: off-hours + news stale 35 min → escalation IS called (24/7 source)", async () => {
    const { spy, calls } = makeEscalateSpy();

    // news threshold = 30 min; 35 > 30 → breach
    const result = await runFreshnessSlaMonitor(
      db,
      spy,
      staleAges("news", 35),
      OFF_HOURS_DATE
    );

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0]!.signalType).toBe("news");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MH-5: Off-hours + sbv_fx breach → escalation IS called (24/7 source)
  // ───────────────────────────────────────────────────────────────────────────

  it("MH-5: off-hours + sbv_fx stale 35 min → escalation IS called (24/7 source)", async () => {
    const { spy, calls } = makeEscalateSpy();

    // sbv_fx threshold = 30 min; 35 > 30 → breach
    const result = await runFreshnessSlaMonitor(
      db,
      spy,
      staleAges("sbv_fx", 35),
      OFF_HOURS_DATE
    );

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0]!.signalType).toBe("sbv_fx");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MH-6: Market hours + price breach → escalation IS called
  // ───────────────────────────────────────────────────────────────────────────

  it("MH-6: market hours + price stale 15 min → escalation IS called", async () => {
    const { spy, calls } = makeEscalateSpy();

    const result = await runFreshnessSlaMonitor(
      db,
      spy,
      staleAges("price", 15),
      MARKET_HOURS_DATE
    );

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0]!.signalType).toBe("price");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MH-7: Market hours + foreign_flow breach → escalation IS called
  // ───────────────────────────────────────────────────────────────────────────

  it("MH-7: market hours + foreign_flow stale 15 min → escalation IS called", async () => {
    const { spy, calls } = makeEscalateSpy();

    const result = await runFreshnessSlaMonitor(
      db,
      spy,
      staleAges("foreign_flow", 15),
      MARKET_HOURS_DATE
    );

    expect(result.breaches).toBe(1);
    expect(result.escalations).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0]!.signalType).toBe("foreign_flow");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // MH-8: Off-hours gate does not affect recovery tracking
  // Recovery = signal was breach_open, now fresh → still recorded as recovered
  // ───────────────────────────────────────────────────────────────────────────

  it("MH-8: off-hours gate does not suppress recovery tracking for price", async () => {
    // Pre-insert an open breach for price
    db.run(`
      INSERT INTO sla_breach_audit
        (signal_type, age_minutes, threshold_minutes, status, severity, breached_at)
      VALUES ('price', 15, 10, 'breach_open', 'HIGH', datetime('now', '-40 minutes'))
    `);

    const { spy, calls } = makeEscalateSpy();

    // price is now fresh (age = 0, well below 10 min threshold)
    const result = await runFreshnessSlaMonitor(
      db,
      spy,
      freshAges(),
      OFF_HOURS_DATE
    );

    expect(result.recoveries).toBe(1);
    expect(result.breaches).toBe(0);
    expect(calls.length).toBe(0);

    // Audit row updated to recovered
    interface AuditRow { status: string; recovered_at: string | null }
    const row = db
      .query<AuditRow, []>(
        "SELECT status, recovered_at FROM sla_breach_audit WHERE signal_type = 'price'"
      )
      .get();
    expect(row!.status).toBe("recovered");
    expect(row!.recovered_at).not.toBeNull();
  });
});
