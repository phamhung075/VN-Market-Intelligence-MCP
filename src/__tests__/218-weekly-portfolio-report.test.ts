/**
 * Task 218 — Weekly Portfolio Report Job (Sunday 23:00 GMT+7)
 *
 * Tests for:
 *   1. formatWeeklyReport() — returns valid Vietnamese text on empty positions
 *   2. formatWeeklyReport() — formats single position with week change
 *   3. formatWeeklyReport() — formats multiple positions in table rows
 *   4. formatWeeklyReport() — week P&L positive total shows "+"
 *   5. formatWeeklyReport() — week P&L negative total shows "-"
 *   6. formatWeeklyReport() — date range header matches start/end of week
 *   7. computeWeekSummary() — week_pnl_amount computed from snapshots
 *   8. computeWeekSummary() — week_pnl_pct computed correctly
 *   9. computeWeekSummary() — no snapshots → zeroed deltas
 *  10. runWeeklyPortfolioReport() — concurrency guard skips second call
 *  11. runWeeklyPortfolioReport() — calls sendFn with non-empty text on populated DB
 *  12. runWeeklyPortfolioReport() — does not throw when sendFn rejects
 *  13. runWeeklyPortfolioReport() — does not throw on empty positions table
 *  14. CRONS.weeklyPortfolioReport — registered at Sunday 23:00 pattern
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Test DB helpers
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

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

    CREATE TABLE IF NOT EXISTS portfolio_pnl_snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      date          TEXT NOT NULL,
      code          TEXT NOT NULL,
      shares        INTEGER NOT NULL,
      avg_price     REAL NOT NULL,
      current_price REAL,
      pnl_pct       REAL,
      pnl_amount    REAL,
      snapshot_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(date, code)
    );
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

function seedPosition(
  db: Database,
  code: string,
  shares: number,
  avgPrice: number,
) {
  db.prepare(`
    INSERT OR IGNORE INTO positions (code, shares, avg_price, opened_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(code, shares, avgPrice);
}

function seedMarketPrice(db: Database, code: string, price: number) {
  db.prepare(`
    INSERT OR REPLACE INTO market_prices (code, price, change_pct, updated_at)
    VALUES (?, ?, 0, datetime('now'))
  `).run(code, price);
}

function seedPnlSnapshot(
  db: Database,
  code: string,
  date: string,
  currentPrice: number,
  shares: number,
  avgPrice: number,
) {
  const pnlAmount = (currentPrice - avgPrice) * shares;
  const pnlPct = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0;
  db.prepare(`
    INSERT OR IGNORE INTO portfolio_pnl_snapshots
      (date, code, shares, avg_price, current_price, pnl_pct, pnl_amount, snapshot_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(date, code, shares, avgPrice, currentPrice, pnlPct, pnlAmount);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: date math
// ─────────────────────────────────────────────────────────────────────────────

function isoDate(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 218 — Weekly Portfolio Report", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    db.close();
  });

  // ── 1. formatWeeklyReport: valid output on empty positions ─────────────────
  it("formatWeeklyReport returns non-empty string on empty positions", async () => {
    const { formatWeeklyReport } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );
    const result = formatWeeklyReport([], { weekPnlAmount: 0, weekPnlPct: 0, totalPnlAmount: 0, totalPnlPct: 0 });
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Should contain the header keyword
    expect(result).toContain("BÁO CÁO");
  });

  // ── 2. formatWeeklyReport: single position formatted correctly ─────────────
  it("formatWeeklyReport includes stock code in the report text", async () => {
    const { formatWeeklyReport } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    const rows = [
      {
        code: "VCB",
        shares: 100,
        avgPrice: 80000,
        currentPrice: 85000,
        startOfWeekPrice: 83000,
        weekChangePct: 2.41,
      },
    ];

    const result = formatWeeklyReport(rows, {
      weekPnlAmount: 200000,
      weekPnlPct: 2.41,
      totalPnlAmount: 500000,
      totalPnlPct: 6.25,
    });

    expect(result).toContain("VCB");
    expect(result).toContain("85");  // current price (at least partial)
    expect(result).toContain("+");   // positive change
  });

  // ── 3. formatWeeklyReport: multiple positions in table ────────────────────
  it("formatWeeklyReport includes all stock codes when multiple positions", async () => {
    const { formatWeeklyReport } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    const rows = [
      { code: "VCB", shares: 100, avgPrice: 80000, currentPrice: 85000, startOfWeekPrice: 83000, weekChangePct: 2.41 },
      { code: "FPT", shares: 50, avgPrice: 110000, currentPrice: 108000, startOfWeekPrice: 112000, weekChangePct: -3.57 },
      { code: "VNM", shares: 200, avgPrice: 70000, currentPrice: 72000, startOfWeekPrice: 71000, weekChangePct: 1.41 },
    ];

    const result = formatWeeklyReport(rows, {
      weekPnlAmount: 180000,
      weekPnlPct: 1.2,
      totalPnlAmount: 1000000,
      totalPnlPct: 3.5,
    });

    expect(result).toContain("VCB");
    expect(result).toContain("FPT");
    expect(result).toContain("VNM");
  });

  // ── 4. formatWeeklyReport: positive total shows "+" ─────────────────────
  it("formatWeeklyReport shows + sign for positive week P&L", async () => {
    const { formatWeeklyReport } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    const result = formatWeeklyReport([], {
      weekPnlAmount: 1500000,
      weekPnlPct: 1.2,
      totalPnlAmount: 7500000,
      totalPnlPct: 5.6,
    });

    // The summary should contain "+1.2" or "+1,500,000" indicating positive
    expect(result).toContain("+");
  });

  // ── 5. formatWeeklyReport: negative total shows "-" ─────────────────────
  it("formatWeeklyReport shows minus sign for negative week P&L", async () => {
    const { formatWeeklyReport } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    const result = formatWeeklyReport([], {
      weekPnlAmount: -800000,
      weekPnlPct: -0.8,
      totalPnlAmount: -800000,
      totalPnlPct: -0.8,
    });

    expect(result).toContain("-");
  });

  // ── 6. formatWeeklyReport: date range header ─────────────────────────────
  it("formatWeeklyReport includes a date range in the header", async () => {
    const { formatWeeklyReport } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    const result = formatWeeklyReport([], {
      weekPnlAmount: 0,
      weekPnlPct: 0,
      totalPnlAmount: 0,
      totalPnlPct: 0,
    }, { weekStart: "29/03", weekEnd: "04/04" });

    expect(result).toContain("29/03");
    expect(result).toContain("04/04");
  });

  // ── 7. computeWeekSummary: week_pnl_amount from snapshots ────────────────
  it("computeWeekSummary computes weekPnlAmount from earliest vs latest snapshot", async () => {
    const { computeWeekSummary } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    const today = isoDate(0);
    const sevenDaysAgo = isoDate(7);

    // VCB: 100 shares, start of week price 83000, end of week 85000 → +200000
    seedPnlSnapshot(db, "VCB", sevenDaysAgo, 83000, 100, 80000);
    seedPnlSnapshot(db, "VCB", today, 85000, 100, 80000);

    const result = computeWeekSummary(db, ["VCB"]);

    // weekPnlAmount should be (85000 - 83000) * 100 = 200000
    expect(result.weekPnlAmount).toBeCloseTo(200000, 0);
  });

  // ── 8. computeWeekSummary: weekPnlPct computed ───────────────────────────
  it("computeWeekSummary computes weekPnlPct as percent of cost basis", async () => {
    const { computeWeekSummary } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    const today = isoDate(0);
    const sevenDaysAgo = isoDate(7);

    // VCB: 100 shares @ avg 80000, start-of-week 83000, end 85000
    // week gain = 200000, cost basis = 100 * 80000 = 8000000
    // week pct = 200000 / 8000000 * 100 = 2.5%
    seedPnlSnapshot(db, "VCB", sevenDaysAgo, 83000, 100, 80000);
    seedPnlSnapshot(db, "VCB", today, 85000, 100, 80000);

    const result = computeWeekSummary(db, ["VCB"]);

    expect(result.weekPnlPct).toBeCloseTo(2.5, 1);
  });

  // ── 9. computeWeekSummary: no snapshots → zeroed deltas ──────────────────
  it("computeWeekSummary returns zeros when no snapshots exist", async () => {
    const { computeWeekSummary } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    const result = computeWeekSummary(db, ["VCB", "FPT"]);

    expect(result.weekPnlAmount).toBe(0);
    expect(result.weekPnlPct).toBe(0);
    expect(result.totalPnlAmount).toBe(0);
    expect(result.totalPnlPct).toBe(0);
  });

  // ── 10. runWeeklyPortfolioReport: concurrency guard ──────────────────────
  it("runWeeklyPortfolioReport skips second concurrent call", async () => {
    const { runWeeklyPortfolioReport } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    let callCount = 0;
    const slowReport = async () => {
      callCount++;
      await new Promise<void>((r) => setTimeout(r, 30));
    };

    const p1 = runWeeklyPortfolioReport({ db, reportFn: slowReport });
    const p2 = runWeeklyPortfolioReport({ db, reportFn: slowReport });

    await Promise.all([p1, p2]);

    // Only one invocation should have run
    expect(callCount).toBe(1);
  });

  // ── 11. runWeeklyPortfolioReport: calls sendFn with text on populated DB ─
  it("runWeeklyPortfolioReport calls sendFn with a non-empty string when positions exist", async () => {
    const { runWeeklyPortfolioReport } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    seedPosition(db, "VCB", 100, 80000);
    seedMarketPrice(db, "VCB", 85000);

    let capturedMessage = "";
    const sendFn = async (text: string) => {
      capturedMessage = text;
    };

    await runWeeklyPortfolioReport({ db, sendFn });

    expect(capturedMessage.length).toBeGreaterThan(0);
    expect(capturedMessage).toContain("VCB");
  });

  // ── 12. runWeeklyPortfolioReport: tolerates sendFn rejection ─────────────
  it("runWeeklyPortfolioReport does not throw when sendFn rejects", async () => {
    const { runWeeklyPortfolioReport } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    seedPosition(db, "VCB", 100, 80000);
    seedMarketPrice(db, "VCB", 85000);

    const failingSendFn = async (_text: string) => {
      throw new Error("Telegram API timeout");
    };

    // Should not throw
    await expect(
      runWeeklyPortfolioReport({ db, sendFn: failingSendFn }),
    ).resolves.toBeUndefined();
  });

  // ── 13. runWeeklyPortfolioReport: works on empty positions table ──────────
  it("runWeeklyPortfolioReport does not throw on empty positions table", async () => {
    const { runWeeklyPortfolioReport } = await import(
      "../scheduler/portfolio/weeklyPortfolioReportJob.js"
    );

    let capturedMessage = "";
    const sendFn = async (text: string) => {
      capturedMessage = text;
    };

    await expect(
      runWeeklyPortfolioReport({ db, sendFn }),
    ).resolves.toBeUndefined();

    // Empty portfolio triggers silent-skip — sendFn must not be called
    expect(capturedMessage.length).toBe(0);
  });

  // ── 14. CRONS.weeklyPortfolioReport registered at Sunday 23:00 ───────────
  it("CRONS.weeklyPortfolioReport is registered at Sunday 23:00 pattern", async () => {
    const { CRONS } = await import("../scheduler/jobs.js");
    expect(typeof (CRONS as Record<string, string>)["weeklyPortfolioReport"]).toBe("string");
    // Should target Sunday (0) at 23:00
    expect((CRONS as Record<string, string>)["weeklyPortfolioReport"]).toMatch(/0 23 \* \* 0/);
  });
});
