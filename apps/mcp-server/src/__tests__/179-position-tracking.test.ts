Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 179 — Position Tracking Tests
 *
 * Tests the positions schema + 3 MCP position tools:
 *   1. set_position   — upsert a position (new or update)
 *   2. get_positions  — list open positions with live P&L
 *   3. close_position — mark a position as closed
 *
 * Uses in-memory SQLite to avoid polluting the real database.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  upsertPosition,
  listOpenPositions,
  closePosition,
  type PositionRow,
} from "../infrastructure/db/positionStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB fixture shared across tests
// ─────────────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  // Create positions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      code        TEXT NOT NULL,
      shares      INTEGER NOT NULL,
      avg_price   REAL NOT NULL,
      opened_at   TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at   TEXT,
      notes       TEXT,
      UNIQUE(code)
    );
  `);
  // Create market_prices table for P&L computation
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT
    );
  `);
  // daily_ohlcv is used as a fallback price source in listOpenPositions
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      open       REAL    NOT NULL,
      high       REAL    NOT NULL,
      low        REAL    NOT NULL,
      close      REAL    NOT NULL,
      volume     REAL    NOT NULL DEFAULT 0,
      updated_at TEXT    NOT NULL,
      PRIMARY KEY (code, date)
    );
  `);
});

afterEach(() => {
  db.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// upsertPosition
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 179 — upsertPosition", () => {
  it("inserts a new position", () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000, notes: "Buy dip" });

    const row = db.query<PositionRow, []>("SELECT * FROM positions WHERE code = 'VCB'").get();
    expect(row).not.toBeNull();
    expect(row!.code).toBe("VCB");
    expect(row!.shares).toBe(1000);
    expect(row!.avg_price).toBe(75000);
    expect(row!.notes).toBe("Buy dip");
    expect(row!.closed_at).toBeNull();
  });

  it("updates shares and avg_price when position already exists", () => {
    upsertPosition(db, { code: "FPT", shares: 500, avgPrice: 120000 });
    upsertPosition(db, { code: "FPT", shares: 800, avgPrice: 118000, notes: "Average down" });

    const rows = db.query<PositionRow, []>("SELECT * FROM positions WHERE code = 'FPT'").all();
    expect(rows.length).toBe(1); // UNIQUE constraint — still one row
    const fptRow = rows[0]!;
    expect(fptRow.shares).toBe(800);
    expect(fptRow.avg_price).toBe(118000);
    expect(fptRow.notes).toBe("Average down");
  });

  it("requires shares > 0", () => {
    expect(() => upsertPosition(db, { code: "VCB", shares: 0, avgPrice: 75000 })).toThrow();
  });

  it("requires avgPrice > 0", () => {
    expect(() => upsertPosition(db, { code: "VCB", shares: 100, avgPrice: -1 })).toThrow();
  });

  it("rejects implausibly small avgPrice (unit mismatch guard — report #1069)", () => {
    // 80.3 almost certainly means "80.3 thousand VND" → caller forgot the
    // unit conversion. VN stocks trade in raw VND, lowest ~1,000.
    expect(() => upsertPosition(db, { code: "FPT", shares: 5000, avgPrice: 80.3 })).toThrow(
      /implausibly small/,
    );
    // 999 still rejected, 1000 accepted.
    expect(() => upsertPosition(db, { code: "FPT", shares: 5000, avgPrice: 999 })).toThrow();
    expect(() => upsertPosition(db, { code: "FPT", shares: 5000, avgPrice: 1000 })).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listOpenPositions
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 179 — listOpenPositions", () => {
  it("returns empty array when no positions", () => {
    const result = listOpenPositions(db);
    expect(result).toEqual([]);
  });

  it("lists open positions with live P&L when market price exists", () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });
    // Seed market price
    db.exec(`INSERT INTO market_prices (code, price) VALUES ('VCB', 85000)`);

    const result = listOpenPositions(db);
    expect(result.length).toBe(1);
    const pos = result[0]!;
    expect(pos.code).toBe("VCB");
    expect(pos.shares).toBe(1000);
    expect(pos.avgPrice).toBe(75000);
    expect(pos.currentPrice).toBe(85000);
    // Cost basis = 1000 * 75000 = 75_000_000
    expect(pos.costBasis).toBe(75_000_000);
    // Current value = 1000 * 85000 = 85_000_000
    expect(pos.currentValue).toBe(85_000_000);
    // Unrealized P&L amount = 85_000_000 - 75_000_000 = 10_000_000
    expect(pos.unrealizedPnl).toBe(10_000_000);
    // Unrealized P&L % = (10_000_000 / 75_000_000) * 100 ≈ 13.33%
    expect(pos.unrealizedPnlPct).toBeCloseTo(13.333, 1);
  });

  it("returns null currentPrice and zero P&L when no market price", () => {
    upsertPosition(db, { code: "HPG", shares: 2000, avgPrice: 30000 });

    const result = listOpenPositions(db);
    expect(result.length).toBe(1);
    const hpgPos = result[0]!;
    expect(hpgPos.currentPrice).toBeNull();
    expect(hpgPos.unrealizedPnl).toBe(0);
    expect(hpgPos.unrealizedPnlPct).toBe(0);
  });

  it("excludes closed positions", () => {
    upsertPosition(db, { code: "VNM", shares: 500, avgPrice: 60000 });
    db.exec(`UPDATE positions SET closed_at = datetime('now') WHERE code = 'VNM'`);

    const result = listOpenPositions(db);
    expect(result.length).toBe(0);
  });

  it("computes aggregate totals correctly", () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });
    upsertPosition(db, { code: "FPT", shares: 500, avgPrice: 120000 });
    db.exec(`INSERT INTO market_prices (code, price) VALUES ('VCB', 85000), ('FPT', 115000)`);

    const result = listOpenPositions(db);
    expect(result.length).toBe(2);

    const vcb = result.find((p) => p.code === "VCB")!;
    const fpt = result.find((p) => p.code === "FPT")!;

    // VCB P&L: +10_000_000
    expect(vcb.unrealizedPnl).toBe(10_000_000);
    // FPT P&L: (115000 - 120000) * 500 = -2_500_000
    expect(fpt.unrealizedPnl).toBe(-2_500_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// closePosition
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 179 — closePosition", () => {
  it("sets closed_at on an open position", () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });

    const success = closePosition(db, "VCB");
    expect(success).toBe(true);

    const row = db.query<PositionRow, []>("SELECT * FROM positions WHERE code = 'VCB'").get();
    expect(row!.closed_at).not.toBeNull();
  });

  it("returns false for non-existent position", () => {
    const success = closePosition(db, "UNKNOWN");
    expect(success).toBe(false);
  });

  it("does not affect other positions when closing one", () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });
    upsertPosition(db, { code: "FPT", shares: 500, avgPrice: 120000 });

    closePosition(db, "VCB");

    const open = listOpenPositions(db);
    expect(open.length).toBe(1);
    expect(open[0]!.code).toBe("FPT");
  });
});
