/**
 * Task 209 — Daily P&L snapshot in morning briefing
 *
 * Tests for:
 *   - computePortfolioPnl() domain service (pure logic, no I/O)
 *   - formatPnlSection() formatting helper (Vietnamese output)
 *   - savePnlSnapshot() / getLatestPnlSnapshot() infrastructure helpers
 *   - assembleBriefing() integration: portfolioPnl section present when positions exist
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

import {
  computePortfolioPnl,
  formatPnlSection,
  type PositionPnl,
  type PortfolioPnlResult,
} from "../domain/services/portfolioPnlCalculator.js";
import {
  savePnlSnapshot,
  getLatestPnlSnapshot,
  type PnlSnapshotRow,
} from "../infrastructure/db/pnlSnapshotStore.js";
import { initDatabase } from "../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeInMemoryDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. computePortfolioPnl — pure domain service
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 209 — computePortfolioPnl()", () => {
  it("computes positive P&L when current price > avg price", () => {
    const positions = [{ code: "VCB", shares: 1000, avgPrice: 75_000 }];
    const prices = new Map([["VCB", 85_000]]);
    const result = computePortfolioPnl(positions, prices);

    expect(result.items).toHaveLength(1);
    const item = result.items[0]!;
    expect(item.code).toBe("VCB");
    expect(item.shares).toBe(1000);
    expect(item.avgPrice).toBe(75_000);
    expect(item.currentPrice).toBe(85_000);
    expect(item.pnlAmount).toBe(10_000_000); // (85000 - 75000) * 1000
    expect(item.pnlPct).toBeCloseTo(13.333, 2);
  });

  it("computes negative P&L when current price < avg price", () => {
    const positions = [{ code: "FPT", shares: 500, avgPrice: 120_000 }];
    const prices = new Map([["FPT", 115_000]]);
    const result = computePortfolioPnl(positions, prices);

    const item = result.items[0]!;
    expect(item.pnlAmount).toBe(-2_500_000); // (115000 - 120000) * 500
    expect(item.pnlPct).toBeCloseTo(-4.167, 2);
  });

  it("sets currentPrice to null when price is not available", () => {
    const positions = [{ code: "VNM", shares: 200, avgPrice: 80_000 }];
    const prices = new Map<string, number>(); // empty
    const result = computePortfolioPnl(positions, prices);

    const item = result.items[0]!;
    expect(item.currentPrice).toBeNull();
    expect(item.pnlAmount).toBeNull();
    expect(item.pnlPct).toBeNull();
  });

  it("computes aggregate totals correctly with mixed positions", () => {
    const positions = [
      { code: "VCB", shares: 1000, avgPrice: 75_000 },
      { code: "FPT", shares: 500, avgPrice: 120_000 },
    ];
    const prices = new Map([
      ["VCB", 85_000],
      ["FPT", 115_000],
    ]);
    const result = computePortfolioPnl(positions, prices);

    // VCB: +10,000,000  FPT: -2,500,000  net: +7,500,000
    expect(result.totalPnlAmount).toBe(7_500_000);
    // Total cost: 75000*1000 + 120000*500 = 75,000,000 + 60,000,000 = 135,000,000
    // Total pnl pct: 7,500,000 / 135,000,000 * 100 ≈ 5.556%
    expect(result.totalPnlPct).toBeCloseTo(5.556, 2);
  });

  it("returns empty result for empty positions array", () => {
    const result = computePortfolioPnl([], new Map());
    expect(result.items).toHaveLength(0);
    expect(result.totalPnlAmount).toBe(0);
    expect(result.totalPnlPct).toBe(0);
  });

  it("excludes positions with no price from aggregate totals", () => {
    const positions = [
      { code: "VCB", shares: 1000, avgPrice: 75_000 },
      { code: "VNM", shares: 200, avgPrice: 80_000 }, // no price
    ];
    const prices = new Map([["VCB", 85_000]]);
    const result = computePortfolioPnl(positions, prices);

    // Only VCB is priced
    expect(result.totalPnlAmount).toBe(10_000_000);
    // totalPnlPct based on cost of priced positions only: 10M / 75M * 100 ≈ 13.33%
    expect(result.totalPnlPct).toBeCloseTo(13.333, 2);
  });

  it("handles zero shares gracefully (defensive)", () => {
    const positions = [{ code: "HPG", shares: 0, avgPrice: 25_000 }];
    const prices = new Map([["HPG", 30_000]]);
    const result = computePortfolioPnl(positions, prices);
    const item = result.items[0]!;
    expect(item.pnlAmount).toBe(0);
    expect(item.pnlPct).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. formatPnlSection — Vietnamese output formatting
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 209 — formatPnlSection()", () => {
  it("returns empty string for empty portfolio (no section)", () => {
    const result = computePortfolioPnl([], new Map());
    expect(formatPnlSection(result)).toBe("");
  });

  it("includes DANH MUC header with count", () => {
    const positions = [{ code: "VCB", shares: 1000, avgPrice: 75_000 }];
    const prices = new Map([["VCB", 85_000]]);
    const result = computePortfolioPnl(positions, prices);
    const text = formatPnlSection(result);

    expect(text).toContain("DANH MUC");
    expect(text).toContain("1 vi the");
  });

  it("shows correct P&L sign (+) for gains", () => {
    const positions = [{ code: "VCB", shares: 1000, avgPrice: 75_000 }];
    const prices = new Map([["VCB", 85_000]]);
    const result = computePortfolioPnl(positions, prices);
    const text = formatPnlSection(result);

    expect(text).toContain("+13.3%");
    expect(text).toContain("+10,000,000");
  });

  it("shows correct P&L sign (-) for losses", () => {
    const positions = [{ code: "FPT", shares: 500, avgPrice: 120_000 }];
    const prices = new Map([["FPT", 115_000]]);
    const result = computePortfolioPnl(positions, prices);
    const text = formatPnlSection(result);

    expect(text).toContain("-4.2%");
    expect(text).toContain("-2,500,000");
  });

  it("shows N/A for positions without current price", () => {
    const positions = [{ code: "VNM", shares: 200, avgPrice: 80_000 }];
    const prices = new Map<string, number>();
    const result = computePortfolioPnl(positions, prices);
    const text = formatPnlSection(result);

    expect(text).toContain("N/A");
  });

  it("includes Tong (total) line with aggregate P&L", () => {
    const positions = [
      { code: "VCB", shares: 1000, avgPrice: 75_000 },
      { code: "FPT", shares: 500, avgPrice: 120_000 },
    ];
    const prices = new Map([
      ["VCB", 85_000],
      ["FPT", 115_000],
    ]);
    const result = computePortfolioPnl(positions, prices);
    const text = formatPnlSection(result);

    expect(text).toContain("Tong");
    expect(text).toContain("+7,500,000");
    expect(text).toContain("+5.6%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. savePnlSnapshot() / getLatestPnlSnapshot() — infrastructure layer
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 209 — pnlSnapshotStore", () => {
  let db: Database;

  beforeEach(async () => {
    process.env["DB_PATH"] = ":memory:";
    const { closeDb } = await import("../infrastructure/db/schema.js");
    closeDb();
    db = makeInMemoryDb();
    await initDatabase();
    const { getDb } = await import("../infrastructure/db/schema.js");
    db = getDb();
  });

  afterEach(async () => {
    const { closeDb } = await import("../infrastructure/db/schema.js");
    closeDb();
    delete process.env["DB_PATH"];
  });

  it("saves snapshot and retrieves it", () => {
    const items: PositionPnl[] = [
      {
        code: "VCB",
        shares: 1000,
        avgPrice: 75_000,
        currentPrice: 85_000,
        pnlAmount: 10_000_000,
        pnlPct: 13.333,
      },
    ];
    savePnlSnapshot(db, "2026-04-01", items);

    const rows = getLatestPnlSnapshot(db, "2026-04-01");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toBe("VCB");
    expect(rows[0]!.shares).toBe(1000);
    expect(rows[0]!.avg_price).toBe(75_000);
    expect(rows[0]!.current_price).toBe(85_000);
    expect(rows[0]!.pnl_amount).toBe(10_000_000);
    expect(rows[0]!.pnl_pct).toBeCloseTo(13.333, 2);
  });

  it("upserts on (date, code) — second save overwrites first", () => {
    const items: PositionPnl[] = [
      {
        code: "VCB",
        shares: 1000,
        avgPrice: 75_000,
        currentPrice: 85_000,
        pnlAmount: 10_000_000,
        pnlPct: 13.333,
      },
    ];
    savePnlSnapshot(db, "2026-04-01", items);

    // Update with new price
    const items2: PositionPnl[] = [
      {
        code: "VCB",
        shares: 1000,
        avgPrice: 75_000,
        currentPrice: 90_000,
        pnlAmount: 15_000_000,
        pnlPct: 20.0,
      },
    ];
    savePnlSnapshot(db, "2026-04-01", items2);

    const rows = getLatestPnlSnapshot(db, "2026-04-01");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.current_price).toBe(90_000);
    expect(rows[0]!.pnl_amount).toBe(15_000_000);
  });

  it("returns empty array when no snapshot exists for date", () => {
    const rows = getLatestPnlSnapshot(db, "2099-01-01");
    expect(rows).toHaveLength(0);
  });

  it("handles null currentPrice and null P&L in snapshot", () => {
    const items: PositionPnl[] = [
      {
        code: "VNM",
        shares: 200,
        avgPrice: 80_000,
        currentPrice: null,
        pnlAmount: null,
        pnlPct: null,
      },
    ];
    savePnlSnapshot(db, "2026-04-01", items);
    const rows = getLatestPnlSnapshot(db, "2026-04-01");
    expect(rows[0]!.current_price).toBeNull();
    expect(rows[0]!.pnl_amount).toBeNull();
    expect(rows[0]!.pnl_pct).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. assembleBriefing integration — portfolioPnl section
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 209 — assembleBriefing portfolioPnl integration", () => {
  let db: Database;

  beforeEach(async () => {
    process.env["DB_PATH"] = ":memory:";
    const { closeDb } = await import("../infrastructure/db/schema.js");
    closeDb();
    await initDatabase();
    const { getDb } = await import("../infrastructure/db/schema.js");
    db = getDb();
  });

  afterEach(async () => {
    const { closeDb } = await import("../infrastructure/db/schema.js");
    closeDb();
    delete process.env["DB_PATH"];
  });

  it("briefing has portfolioPnl = null when no open positions", async () => {
    const { assembleBriefing } = await import("../application/usecases/assembleBriefing.js");

    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: "/tmp/test-briefings-209",
    });

    expect(briefing.portfolioPnl).toBeNull();
  });

  it("briefing has portfolioPnl with items when positions exist", async () => {
    // Insert a position
    const { upsertPosition } = await import("../infrastructure/db/positionStore.js");
    upsertPosition(db, { code: "VCB", shares: 1000, avgPrice: 75_000 });

    // Insert current price
    db.prepare(
      `INSERT INTO market_prices (code, price, change_amt, change_pct, volume, updated_at)
       VALUES ('VCB', 85000, 10000, 13.33, 500000, datetime('now'))`,
    ).run();

    const { assembleBriefing } = await import("../application/usecases/assembleBriefing.js");

    const briefing = await assembleBriefing({
      db,
      pollNewsFn: async () => {},
      fetchVnIndexFn: async () => null,
      briefingsDir: "/tmp/test-briefings-209",
    });

    expect(briefing.portfolioPnl).not.toBeNull();
    expect(briefing.portfolioPnl!.items).toHaveLength(1);
    expect(briefing.portfolioPnl!.items[0]!.code).toBe("VCB");
    expect(briefing.portfolioPnl!.items[0]!.pnlAmount).toBe(10_000_000);
  });
});
