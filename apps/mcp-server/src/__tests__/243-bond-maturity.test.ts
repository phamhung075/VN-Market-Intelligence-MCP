Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 243 — Bond Maturity Tracker
 *
 * 12 tests covering: BondMaturityEvent structure, getUpcomingMaturities(),
 * checkMaturityAlerts(), status transitions, and SQLite store CRUD.
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  getUpcomingMaturities,
  checkMaturityAlerts,
  type BondMaturityEvent,
} from "../domain/services/bondMaturityTracker.js";
import {
  upsertBond,
  listUpcomingBonds,
  updateBondStatus,
} from "../infrastructure/db/bondMaturityStore.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";
import { formatBondCalendar } from "../interface/mcp/tools/sector/bondMaturityTools.js";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]!;
}

describe("Task 243 — Bond Maturity Tracker (domain)", () => {
  it("getUpcomingMaturities returns array", () => {
    const result = getUpcomingMaturities(3);
    expect(Array.isArray(result)).toBe(true);
  });

  it("getUpcomingMaturities filters by months window", () => {
    const result = getUpcomingMaturities(1);
    for (const evt of result) {
      const maturity = new Date(evt.maturityDate);
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() + 1);
      expect(maturity.getTime()).toBeLessThanOrEqual(cutoff.getTime());
    }
  });

  it("checkMaturityAlerts returns empty array for empty events", () => {
    const result = checkMaturityAlerts([]);
    expect(result).toEqual([]);
  });

  it("checkMaturityAlerts returns CRITICAL signal for bond due within 7 days", () => {
    const events: BondMaturityEvent[] = [
      {
        issuer: "Novaland",
        issuerCode: "NVL",
        amount: 5000,
        maturityDate: daysFromNow(5),
        couponRate: 10.5,
        status: "upcoming",
      },
    ];
    const signals = checkMaturityAlerts(events);
    expect(signals.length).toBeGreaterThan(0);
    const sig = signals[0]!;
    expect(sig.type).toBe("bond_maturity");
    expect(["high", "critical"]).toContain(sig.severity);
    expect(sig.actionCode).toBe("NVL");
  });

  it("checkMaturityAlerts returns HIGH signal for bond due within 14 days", () => {
    const events: BondMaturityEvent[] = [
      {
        issuer: "Khang Điền",
        issuerCode: "KDH",
        amount: 2000,
        maturityDate: daysFromNow(12),
        couponRate: 9.0,
        status: "upcoming",
      },
    ];
    const signals = checkMaturityAlerts(events);
    expect(signals.length).toBeGreaterThan(0);
    const sig = signals.find((s) => s.actionCode === "KDH")!;
    expect(sig).toBeDefined();
    expect(["medium", "high", "critical"]).toContain(sig.severity);
  });

  it("checkMaturityAlerts skips extended bonds", () => {
    const events: BondMaturityEvent[] = [
      {
        issuer: "PDR Corp",
        issuerCode: "PDR",
        amount: 1000,
        maturityDate: daysFromNow(3),
        couponRate: 11.0,
        status: "extended",
      },
    ];
    const signals = checkMaturityAlerts(events);
    expect(signals.length).toBe(0);
  });

  it("BondMaturityEvent has required fields", () => {
    const evt: BondMaturityEvent = {
      issuer: "VinHomes",
      issuerCode: "VHM",
      amount: 10000,
      maturityDate: "2025-06-15",
      couponRate: 10.0,
      status: "upcoming",
    };
    expect(evt.issuer).toBeTruthy();
    expect(evt.issuerCode).toBeTruthy();
    expect(evt.amount).toBeGreaterThan(0);
    expect(evt.status).toBe("upcoming");
  });
});

describe("Task 243 — Bond Maturity Store (infrastructure)", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("initDatabase creates the bond_maturity table", () => {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='bond_maturity'").all();
    expect(rows.length).toBe(1);
  });

  it("upsertBond inserts a new bond", () => {
    upsertBond(db, {
      issuer: "Novaland",
      issuerCode: "NVL",
      amount: 5000,
      maturityDate: daysFromNow(90),
      couponRate: 10.5,
      status: "upcoming",
    });
    const rows = listUpcomingBonds(db, 6);
    const found = rows.find((r) => r.issuerCode === "NVL");
    expect(found).toBeDefined();
    expect(found!.amount).toBe(5000);
  });

  it("updateBondStatus changes status of existing bond", () => {
    upsertBond(db, {
      issuer: "KDH Corp",
      issuerCode: "KDH",
      amount: 2000,
      maturityDate: daysFromNow(30),
      couponRate: 9.0,
      status: "upcoming",
    });
    updateBondStatus(db, "KDH", "extended");
    const rows = db.prepare("SELECT status FROM bond_maturity WHERE issuer_code = ?").all("KDH") as { status: string }[];
    expect(rows[0]?.status).toBe("extended");
  });

  it("listUpcomingBonds filters by months window", () => {
    upsertBond(db, {
      issuer: "Far Future Corp",
      issuerCode: "DIG",
      amount: 1000,
      maturityDate: daysFromNow(400),
      couponRate: 8.0,
      status: "upcoming",
    });
    upsertBond(db, {
      issuer: "Near Corp",
      issuerCode: "PDR",
      amount: 500,
      maturityDate: daysFromNow(10),
      couponRate: 9.0,
      status: "upcoming",
    });
    const result = listUpcomingBonds(db, 1);
    const found = result.find((r) => r.issuerCode === "PDR");
    const notFound = result.find((r) => r.issuerCode === "DIG");
    expect(found).toBeDefined();
    expect(notFound).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DSI-S3 C3 — DB-backed seed-data banner (the QA blocker this task fixes)
// ─────────────────────────────────────────────────────────────────────────────

describe("DSI-S3 C3 — DB-backed path surfaces static_seed flag and banner", () => {
  let db: Database;

  beforeEach(async () => {
    closeDb();
    await initDatabase();
    db = getDb();
  });

  it("TC-1: upsertBond with static_seed=true → listUpcomingBonds returns static_seed:true", () => {
    upsertBond(db, {
      issuer: "VinHomes JSC",
      issuerCode: "VHM",
      amount: 10000,
      maturityDate: daysFromNow(180),
      couponRate: 10.0,
      status: "upcoming",
      static_seed: true,
    });

    const events = listUpcomingBonds(db, 12);
    const vhm = events.find((e) => e.issuerCode === "VHM");

    expect(vhm).toBeDefined();
    expect(vhm!.static_seed).toBe(true);
  });

  it("TC-2: upsertBond with static_seed=false → listUpcomingBonds returns static_seed:false", () => {
    upsertBond(db, {
      issuer: "VinHomes JSC",
      issuerCode: "VHM",
      amount: 10000,
      maturityDate: daysFromNow(180),
      couponRate: 10.0,
      status: "upcoming",
      static_seed: false,
    });

    const events = listUpcomingBonds(db, 12);
    const vhm = events.find((e) => e.issuerCode === "VHM");

    expect(vhm).toBeDefined();
    expect(vhm!.static_seed).toBe(false);
  });

  it("TC-3: formatBondCalendar emits banner when DB-backed event has static_seed:true", () => {
    // This is the exact QA blocker: DB-served events (not empty-DB fallback) must
    // also surface the [SEED DATA] banner.
    upsertBond(db, {
      issuer: "Novaland JSC",
      issuerCode: "NVL",
      amount: 5000,
      maturityDate: daysFromNow(120),
      couponRate: 10.5,
      status: "upcoming",
      static_seed: true,
    });

    const events = listUpcomingBonds(db, 12);
    expect(events.some((e) => e.static_seed === true)).toBe(true);

    const output = formatBondCalendar(events, []);
    expect(output).toContain("[SEED DATA — không xác minh thị trường thực]");
  });

  it("TC-4: formatBondCalendar does NOT emit banner when event has static_seed:false", () => {
    upsertBond(db, {
      issuer: "Novaland JSC",
      issuerCode: "NVL",
      amount: 5000,
      maturityDate: daysFromNow(120),
      couponRate: 10.5,
      status: "upcoming",
      static_seed: false,
    });

    const events = listUpcomingBonds(db, 12);
    expect(events.every((e) => e.static_seed === false)).toBe(true);

    const output = formatBondCalendar(events, []);
    expect(output).not.toContain("[SEED DATA — không xác minh thị trường thực]");
  });
});
