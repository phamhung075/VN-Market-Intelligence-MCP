Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 182 — Portfolio Risk Metrics
 *
 * Tests for:
 *   1. computePortfolioRisk (domain service) — pure calculation
 *   2. registerPortfolioRiskTool (interface) — MCP tool integration
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { closeDb, getDb } from "../infrastructure/db/schema.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  computePortfolioRisk,
  type PositionSnapshot,
  type DailyPriceRow,
} from "../domain/services/portfolioRiskCalculator.js";

// ---------------------------------------------------------------------------
// Test DB helpers
// ---------------------------------------------------------------------------

function setupTestDb(): Database {
  (Bun.env as Record<string, string>)["DB_PATH"] = ":memory:";
  closeDb();
  const db = getDb();
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
    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT
    );
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (code, fetched_at)
    );
    CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
      ON market_prices_history(code, fetched_at DESC);
  `);
  return db;
}

afterEach(() => {
  closeDb();
});

// ---------------------------------------------------------------------------
// Helper: generate daily prices for a stock
// ---------------------------------------------------------------------------

function makePrices(code: string, basePrice: number, dailyReturns: number[]): DailyPriceRow[] {
  let price = basePrice;
  const result: DailyPriceRow[] = [];
  const base = new Date("2026-03-01T09:00:00.000Z");

  // Add the initial price
  result.push({ code, price, fetched_at: base.toISOString() });

  for (let i = 0; i < dailyReturns.length; i++) {
    price = price * (1 + (dailyReturns[i] ?? 0));
    const d = new Date(base.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    result.push({ code, price, fetched_at: d.toISOString() });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Domain service tests
// ---------------------------------------------------------------------------

describe("Task 182 — computePortfolioRisk", () => {
  it("returns zero risk for empty positions", () => {
    const result = computePortfolioRisk([], {}, 30);
    expect(result.totalValue).toBe(0);
    expect(result.var95Pct).toBe(0);
    expect(result.var95Vnd).toBe(0);
    expect(result.maxDrawdownPct).toBe(0);
    expect(result.heatMap).toHaveLength(0);
  });

  it("computes VaR 95% from historical returns (negative 5th percentile)", () => {
    // 20 returns: mostly small gains, one -5% outlier
    const returns = [0.01, 0.02, -0.01, 0.03, -0.05, 0.01, 0.02, -0.02, 0.01, 0.03,
                     0.01, 0.02, -0.01, 0.03, -0.01, 0.01, 0.02, -0.02, 0.01, 0.03];
    const prices = makePrices("VCB", 100000, returns);
    const positions: PositionSnapshot[] = [
      { code: "VCB", shares: 1000, avgPrice: 95000, currentPrice: 100000, costBasis: 95000000, currentValue: 100000000 },
    ];
    const priceHistory: Record<string, DailyPriceRow[]> = { VCB: prices };

    const result = computePortfolioRisk(positions, priceHistory, 30);

    // VaR 95% should be negative (loss scenario)
    expect(result.var95Pct).toBeLessThan(0);
    expect(result.var95Vnd).toBeLessThan(0);
    expect(result.heatMap).toHaveLength(1);
    expect(result.heatMap[0]?.code).toBe("VCB");
  });

  it("computes max drawdown from peak-to-trough", () => {
    // Price path: 100 → 110 → 105 → 95 → 98 → 90 (peak=110, trough=90, drawdown=-18.18%)
    const returns = [0.10, -0.0454545, -0.09523, 0.03157, -0.0816];
    const prices = makePrices("FPT", 100000, returns);
    const positions: PositionSnapshot[] = [
      { code: "FPT", shares: 500, avgPrice: 100000, currentPrice: 90000, costBasis: 50000000, currentValue: 45000000 },
    ];
    const priceHistory: Record<string, DailyPriceRow[]> = { FPT: prices };

    const result = computePortfolioRisk(positions, priceHistory, 30);

    expect(result.maxDrawdownPct).toBeLessThan(-10);
    expect(result.maxDrawdownPct).toBeGreaterThan(-25);
  });

  it("computes per-stock volatility as stddev of daily returns", () => {
    // Flat returns → near-zero volatility
    const flatReturns = Array(20).fill(0.001); // 0.1% daily
    const prices = makePrices("VNM", 80000, flatReturns);
    const positions: PositionSnapshot[] = [
      { code: "VNM", shares: 200, avgPrice: 78000, currentPrice: 80000, costBasis: 15600000, currentValue: 16000000 },
    ];
    const priceHistory: Record<string, DailyPriceRow[]> = { VNM: prices };

    const result = computePortfolioRisk(positions, priceHistory, 30);

    expect(result.heatMap[0]?.volPct).toBeLessThan(0.5); // < 0.5% daily vol
  });

  it("computes weight % per stock (1 stock = 100%)", () => {
    const prices = makePrices("VCB", 100000, [0.01, -0.01, 0.02]);
    const positions: PositionSnapshot[] = [
      { code: "VCB", shares: 1000, avgPrice: 95000, currentPrice: 100000, costBasis: 95000000, currentValue: 100000000 },
    ];
    const priceHistory: Record<string, DailyPriceRow[]> = { VCB: prices };

    const result = computePortfolioRisk(positions, priceHistory, 30);

    expect(result.heatMap[0]?.weightPct).toBe(100);
    expect(result.totalValue).toBe(100000000);
  });

  it("distributes weights proportionally across 2 stocks", () => {
    const pricesVCB = makePrices("VCB", 100000, [0.01, -0.01]);
    const pricesFPT = makePrices("FPT", 200000, [0.02, -0.02]);
    const positions: PositionSnapshot[] = [
      { code: "VCB", shares: 1000, avgPrice: 95000, currentPrice: 100000, costBasis: 95000000, currentValue: 100000000 },
      { code: "FPT", shares: 500, avgPrice: 190000, currentPrice: 200000, costBasis: 95000000, currentValue: 100000000 },
    ];
    const priceHistory: Record<string, DailyPriceRow[]> = { VCB: pricesVCB, FPT: pricesFPT };

    const result = computePortfolioRisk(positions, priceHistory, 30);

    // Equal market value → 50/50 weights
    const totalWeight = result.heatMap.reduce((sum, h) => sum + h.weightPct, 0);
    expect(Math.round(totalWeight)).toBe(100);
    expect(result.heatMap[0]?.weightPct).toBeCloseTo(50, 0);
    expect(result.heatMap[1]?.weightPct).toBeCloseTo(50, 0);
  });

  it("classifies risk status correctly", () => {
    // High-volatility stock
    const highVolReturns = [0.05, -0.07, 0.04, -0.06, 0.08, -0.09, 0.05, -0.06, 0.07, -0.08];
    const highVolPrices = makePrices("HPG", 50000, highVolReturns);

    // Low-volatility stock
    const lowVolReturns = [0.001, -0.001, 0.001, -0.001, 0.001, -0.001, 0.001, -0.001, 0.001, -0.001];
    const lowVolPrices = makePrices("VNM", 80000, lowVolReturns);

    const positions: PositionSnapshot[] = [
      { code: "HPG", shares: 1000, avgPrice: 48000, currentPrice: 50000, costBasis: 48000000, currentValue: 50000000 },
      { code: "VNM", shares: 500, avgPrice: 78000, currentPrice: 80000, costBasis: 39000000, currentValue: 40000000 },
    ];
    const priceHistory: Record<string, DailyPriceRow[]> = { HPG: highVolPrices, VNM: lowVolPrices };

    const result = computePortfolioRisk(positions, priceHistory, 30);

    const hpgRow = result.heatMap.find((h) => h.code === "HPG");
    const vnmRow = result.heatMap.find((h) => h.code === "VNM");
    expect(hpgRow?.status).toBe("Rat cao");
    expect(vnmRow?.status).toBe("Binh thuong");
  });

  it("handles stock with no price history gracefully", () => {
    const positions: PositionSnapshot[] = [
      { code: "VCB", shares: 1000, avgPrice: 95000, currentPrice: 100000, costBasis: 95000000, currentValue: 100000000 },
    ];
    // No price history provided
    const result = computePortfolioRisk(positions, {}, 30);

    expect(result.heatMap).toHaveLength(1);
    expect(result.heatMap[0]?.volPct).toBe(0);
    expect(result.heatMap[0]?.var95Pct).toBe(0);
  });

  it("maxDrawdown handles monotonically increasing prices (no drawdown)", () => {
    const risingReturns = Array(10).fill(0.01); // always going up
    const prices = makePrices("VCB", 100000, risingReturns);
    const positions: PositionSnapshot[] = [
      { code: "VCB", shares: 1000, avgPrice: 95000, currentPrice: 110000, costBasis: 95000000, currentValue: 110000000 },
    ];
    const priceHistory: Record<string, DailyPriceRow[]> = { VCB: prices };

    const result = computePortfolioRisk(positions, priceHistory, 30);
    expect(result.maxDrawdownPct).toBe(0);
  });

  it("returns maxDrawdown start/end dates when drawdown occurs", () => {
    // Peak on day 2, trough on day 5
    const returns = [0.10, 0.05, -0.10, -0.05, -0.08];
    const prices = makePrices("VCB", 100000, returns);
    const positions: PositionSnapshot[] = [
      { code: "VCB", shares: 1000, avgPrice: 100000, currentPrice: 92000, costBasis: 100000000, currentValue: 92000000 },
    ];
    const priceHistory: Record<string, DailyPriceRow[]> = { VCB: prices };

    const result = computePortfolioRisk(positions, priceHistory, 30);
    expect(result.maxDrawdownStart).toBeDefined();
    expect(result.maxDrawdownEnd).toBeDefined();
    // Start must be before or equal to end
    if (result.maxDrawdownStart && result.maxDrawdownEnd) {
      expect(result.maxDrawdownStart <= result.maxDrawdownEnd).toBe(true);
    }
  });
});
