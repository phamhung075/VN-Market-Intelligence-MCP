Bun.env["DB_PATH"] = ":memory:";
// src/__tests__/1389-weekly-portfolio-filler.test.ts
// Task 1389 — TDD RED: weekly-portfolio-filler tests
//
// Tests assert FIXED behavior from task 1390:
//   T1: formatWeeklyReport([], summary) must NOT contain "Chua co"
//   T2: runWeeklyPortfolioReport({ db, sendFn, positionRows=[] }) → sendFn NOT called
//   T3: formatWeeklyReport([row], summary) must NOT contain "Gia dau tuan"
//   T4: formatWeeklyReport([row], summary) must contain "Giá đầu tuần"
//
// T1+T2+T3+T4 are RED until task 1390 applies Change 1 + Change 2 to
// weeklyPortfolioReportJob.ts.

import { describe, it, expect, beforeAll } from "bun:test";
import { Database } from "bun:sqlite";
import {
  formatWeeklyReport,
  runWeeklyPortfolioReport,
} from "../scheduler/portfolio/weeklyPortfolioReportJob.js";
import type { PortfolioRow, WeekSummary } from "../scheduler/portfolio/weeklyPortfolioReportJob.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const zeroSummary: WeekSummary = {
  weekPnlAmount: 0,
  weekPnlPct: 0,
  totalPnlAmount: 0,
  totalPnlPct: 0,
};

const oneRow: PortfolioRow = {
  code: "VCB",
  shares: 1000,
  avgPrice: 80000,
  currentPrice: 85000,
  startOfWeekPrice: 82000,
  weekChangePct: 3.66,
};

// ─────────────────────────────────────────────────────────────────────────────
// Stub DB — empty positions, scheduler_locks present
// ─────────────────────────────────────────────────────────────────────────────

let testDb: Database;

beforeAll(() => {
  testDb = new Database(":memory:");
  initNewsTables(testDb);
  initMarketDataTables(testDb);
  initSystemTables(testDb);
  testDb.exec(`
    CREATE TABLE IF NOT EXISTS positions (
      code TEXT NOT NULL,
      shares REAL NOT NULL,
      avg_price REAL NOT NULL,
      closed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS market_prices (
      code TEXT NOT NULL,
      price REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scheduler_locks (
      job_name TEXT PRIMARY KEY,
      locked_at TEXT NOT NULL,
      lock_window_minutes INTEGER NOT NULL DEFAULT 60
    );
    CREATE TABLE IF NOT EXISTS portfolio_pnl_snapshots (
      code TEXT NOT NULL,
      date TEXT NOT NULL,
      current_price REAL,
      avg_price REAL NOT NULL,
      shares REAL NOT NULL
    );
  `);
  // positions table intentionally empty — no rows inserted
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1389 — weekly-portfolio-filler (RED)", () => {

  // ─────────────────────────────────────────────────────────────────────────
  // T1: formatWeeklyReport([], summary) must NOT contain "Chua co"
  //   RED: current impl emits "(Chua co vi the nao trong danh muc)"
  // ─────────────────────────────────────────────────────────────────────────
  it("T1: formatWeeklyReport([], summary) — no filler 'Chua co' for empty rows", () => {
    const output = formatWeeklyReport([], zeroSummary, { weekStart: "14/04", weekEnd: "20/04" });

    expect(output).not.toContain("Chua co");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // T2: runWeeklyPortfolioReport with empty positions → sendFn NOT called
  //   RED: current impl calls send even when positionRows is empty
  // ─────────────────────────────────────────────────────────────────────────
  it("T2: runWeeklyPortfolioReport with empty positions — sendFn not called", async () => {
    let sendCalled = false;
    const mockSend = async (_text: string): Promise<void> => {
      sendCalled = true;
    };

    await runWeeklyPortfolioReport({
      db: testDb,
      sendFn: mockSend,
      skipDbLock: true,
    });

    expect(sendCalled).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // T3: formatWeeklyReport([row], summary) must NOT contain "Gia dau tuan"
  //   RED: current impl uses unaccented "Gia dau tuan" in table header
  // ─────────────────────────────────────────────────────────────────────────
  it("T3: formatWeeklyReport([row], summary) — no unaccented 'Gia dau tuan' in header", () => {
    const output = formatWeeklyReport([oneRow], zeroSummary, { weekStart: "14/04", weekEnd: "20/04" });

    expect(output).not.toContain("Gia dau tuan");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // T4: formatWeeklyReport([row], summary) must contain "Giá đầu tuần"
  //   RED: current impl lacks Vietnamese diacritics
  // ─────────────────────────────────────────────────────────────────────────
  it("T4: formatWeeklyReport([row], summary) — diacritics 'Giá đầu tuần' present in header", () => {
    const output = formatWeeklyReport([oneRow], zeroSummary, { weekStart: "14/04", weekEnd: "20/04" });

    expect(output).toContain("Giá đầu tuần");
  });

});
