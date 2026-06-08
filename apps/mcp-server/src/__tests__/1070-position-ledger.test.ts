Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1070 — Position Ledger Tests
 *
 * Tests for buyPosition, sellPosition, clearPosition, and applyPositionCommand
 * added to positionStore.ts.
 *
 * All prices in raw VND (not million VND).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  upsertPosition,
  closePosition,
  listOpenPositions,
  buyPosition,
  sellPosition,
  clearPosition,
  applyPositionCommand,
  type PositionRow,
  type PositionCommandResult,
} from "../infrastructure/db/positionStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB fixture
// ─────────────────────────────────────────────────────────────────────────────

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT
    );
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL,
      high       REAL NOT NULL,
      low        REAL NOT NULL,
      close      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );
  `);
});

afterEach(() => {
  db.close();
});

// ─────────────────────────────────────────────────────────────────────────────
// buyPosition
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1070 — buyPosition", () => {
  it("computes weighted avg cost on second buy", () => {
    // Seed: 5100 shares @ 80.3 (using VND-scale values for test)
    upsertPosition(db, { code: "FPT", shares: 5100, avgPrice: 80300 });

    const result = buyPosition(db, "FPT", 82000, 2000);

    expect(result.ok).toBe(true);

    const row = db
      .query<PositionRow, []>("SELECT * FROM positions WHERE code = 'FPT'")
      .get();
    expect(row).not.toBeNull();
    expect(row!.shares).toBe(7100);
    // Weighted avg: (5100*80300 + 2000*82000) / 7100 = (410_530_000 + 164_000_000) / 7100 = 574_530_000 / 7100 = 80_919.7... → 80920
    const expectedAvg = Math.round((5100 * 80300 + 2000 * 82000) / 7100);
    expect(row!.avg_price).toBe(expectedAvg);
    expect(result.message).toContain("Mua thêm 2000");
    expect(result.message).toContain(`${expectedAvg}`);
    expect(result.message).toContain("7100 CP");
  });

  it("uses buy price as avg when starting from zero (first buy)", () => {
    const result = buyPosition(db, "VHM", 45000, 1000);

    expect(result.ok).toBe(true);

    const row = db
      .query<PositionRow, []>("SELECT * FROM positions WHERE code = 'VHM'")
      .get();
    expect(row).not.toBeNull();
    expect(row!.shares).toBe(1000);
    expect(row!.avg_price).toBe(45000);
    expect(result.message).toContain("Mua");
    expect(result.message).toContain("1000");
    expect(result.message).toContain("45000");
  });

  it("reopens a closed position on buy", () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });
    closePosition(db, "VCB");

    const result = buyPosition(db, "VCB", 78000, 500);

    expect(result.ok).toBe(true);
    const row = db
      .query<PositionRow, []>("SELECT * FROM positions WHERE code = 'VCB'")
      .get();
    expect(row!.closed_at).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sellPosition
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1070 — sellPosition", () => {
  it("partial sell: reduces shares, avg_price unchanged", () => {
    upsertPosition(db, { code: "HPG", shares: 5100, avgPrice: 30000 });

    const result = sellPosition(db, "HPG", 32000, 1500);

    expect(result.ok).toBe(true);
    const row = db
      .query<PositionRow, []>("SELECT * FROM positions WHERE code = 'HPG'")
      .get();
    expect(row!.shares).toBe(3600);
    expect(row!.avg_price).toBe(30000); // avg unchanged
    expect(result.message).toContain("Bán 1500");
    expect(result.message).toContain("còn lại 3600 CP");
    expect(result.message).toContain("30000 VND");
  });

  it("clamped sell: tries to sell more than holdings → clamped to full position", () => {
    upsertPosition(db, { code: "FPT", shares: 5100, avgPrice: 80300 });

    const result = sellPosition(db, "FPT", 85000, 6000);

    expect(result.ok).toBe(true);
    // clamped property present
    expect((result as PositionCommandResult & { clamped?: boolean }).clamped).toBe(true);

    const row = db
      .query<PositionRow, []>("SELECT * FROM positions WHERE code = 'FPT'")
      .get();
    // Position closed (shares = 0 → closePosition called)
    expect(row!.closed_at).not.toBeNull();
    expect(result.message).toContain("Chỉ bán được 5100 CP");
  });

  it("exact sell: sell exact holdings → position closed", () => {
    upsertPosition(db, { code: "VNM", shares: 5100, avgPrice: 60000 });

    const result = sellPosition(db, "VNM", 62000, 5100);

    expect(result.ok).toBe(true);
    const row = db
      .query<PositionRow, []>("SELECT * FROM positions WHERE code = 'VNM'")
      .get();
    expect(row!.closed_at).not.toBeNull();
    expect(result.message).not.toContain("Chỉ bán được"); // exact, not clamped
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clearPosition
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1070 — clearPosition", () => {
  it("sets closed_at and returns Vietnamese message", () => {
    upsertPosition(db, { code: "HPG", shares: 3000, avgPrice: 28000 });

    const result = clearPosition(db, "HPG");

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Đã xóa toàn bộ vị thế HPG");

    const row = db
      .query<PositionRow, []>("SELECT * FROM positions WHERE code = 'HPG'")
      .get();
    expect(row!.closed_at).not.toBeNull();
  });

  it("returns ok=true even when no position exists (idempotent)", () => {
    const result = clearPosition(db, "NONEXISTENT");
    expect(result.ok).toBe(true);
    expect(result.message).toBe("Đã xóa toàn bộ vị thế NONEXISTENT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// applyPositionCommand — dispatcher
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1070 — applyPositionCommand dispatcher", () => {
  it("qty > 0 routes to buyPosition", () => {
    const result = applyPositionCommand(db, { ticker: "VHM", price: 45000, qty: 1000 });

    expect(result.ok).toBe(true);
    const row = db
      .query<PositionRow, []>("SELECT * FROM positions WHERE code = 'VHM'")
      .get();
    expect(row).not.toBeNull();
    expect(row!.shares).toBe(1000);
    expect(row!.avg_price).toBe(45000);
    expect(result.message).toContain("45000");
  });

  it("qty < 0 routes to sellPosition", () => {
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });

    const result = applyPositionCommand(db, { ticker: "VCB", price: 80000, qty: -300 });

    expect(result.ok).toBe(true);
    const row = db
      .query<PositionRow, []>("SELECT * FROM positions WHERE code = 'VCB'")
      .get();
    expect(row!.shares).toBe(700);
    expect(result.message).toContain("Bán 300");
  });

  it("price=0 && qty=0 routes to clearPosition", () => {
    upsertPosition(db, { code: "HPG", shares: 3000, avgPrice: 28000 });

    const result = applyPositionCommand(db, { ticker: "HPG", price: 0, qty: 0 });

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Đã xóa toàn bộ vị thế HPG");

    const row = db
      .query<PositionRow, []>("SELECT * FROM positions WHERE code = 'HPG'")
      .get();
    expect(row!.closed_at).not.toBeNull();
  });

  it("qty=0 && price>0 returns error: invalid input", () => {
    const result = applyPositionCommand(db, { ticker: "FPT", price: 80000, qty: 0 });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Không hợp lệ");
  });

  it("Vietnamese messages: buy from zero contains correct format", () => {
    const result = applyPositionCommand(db, { ticker: "VEA", price: 12000, qty: 2000 });
    expect(result.ok).toBe(true);
    expect(result.message).toContain("VND");
  });

  it("Vietnamese messages: sell normal includes 'còn lại'", () => {
    upsertPosition(db, { code: "VNM", shares: 1000, avgPrice: 60000 });

    const result = applyPositionCommand(db, { ticker: "VNM", price: 62000, qty: -200 });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("còn lại");
  });

  it("Vietnamese messages: clamped sell includes 'Chỉ bán được'", () => {
    upsertPosition(db, { code: "FPT", shares: 200, avgPrice: 80000 });

    const result = applyPositionCommand(db, { ticker: "FPT", price: 90000, qty: -500 });

    expect(result.ok).toBe(true);
    expect(result.message).toContain("Chỉ bán được 200 CP");
  });

  it("AC-E1-1: buy 500 more on existing VCB position → correct weighted avg", () => {
    // Given VCB: 1000 shares @ 75000 VND
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75000 });

    // When buy 500 more @ 80000
    const buyResult = applyPositionCommand(db, { ticker: "VCB", price: 80000, qty: 500 });
    expect(buyResult.ok).toBe(true);

    const row = db
      .query<PositionRow, []>("SELECT * FROM positions WHERE code = 'VCB'")
      .get();
    // avg_price = (1000*75000 + 500*80000) / 1500 = (75_000_000 + 40_000_000) / 1500 = 115_000_000 / 1500 = 76666.67 → 76667
    expect(row!.avg_price).toBe(76667);
    expect(row!.shares).toBe(1500);

    // When sell -300 @ 82000
    const sellResult = applyPositionCommand(db, { ticker: "VCB", price: 82000, qty: -300 });
    expect(sellResult.ok).toBe(true);

    const rowAfterSell = db
      .query<PositionRow, []>("SELECT * FROM positions WHERE code = 'VCB'")
      .get();
    expect(rowAfterSell!.shares).toBe(1200);
    expect(rowAfterSell!.avg_price).toBe(76667); // unchanged on partial sell
    expect(sellResult.message).toContain("còn lại 1200 CP");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration: roundtrip via DB
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1070 — Integration roundtrip", () => {
  it("buy → sell → check → clear", () => {
    // Buy
    const buyResult = applyPositionCommand(db, { ticker: "VCB", price: 75000, qty: 1000 });
    expect(buyResult.ok).toBe(true);

    // Buy more
    const buyResult2 = applyPositionCommand(db, { ticker: "VCB", price: 80000, qty: 500 });
    expect(buyResult2.ok).toBe(true);

    // Check position via listOpenPositions
    const positions = listOpenPositions(db);
    expect(positions.length).toBe(1);
    const vcb = positions[0]!;
    expect(vcb.shares).toBe(1500);
    expect(vcb.avgPrice).toBe(76667);

    // Partial sell
    const sellResult = applyPositionCommand(db, { ticker: "VCB", price: 82000, qty: -200 });
    expect(sellResult.ok).toBe(true);
    expect(sellResult.message).toContain("còn lại 1300 CP");

    // Clear
    const clearResult = applyPositionCommand(db, { ticker: "VCB", price: 0, qty: 0 });
    expect(clearResult.ok).toBe(true);
    expect(clearResult.message).toBe("Đã xóa toàn bộ vị thế VCB");

    // After clear: no open positions
    const after = listOpenPositions(db);
    expect(after.length).toBe(0);
  });
});
