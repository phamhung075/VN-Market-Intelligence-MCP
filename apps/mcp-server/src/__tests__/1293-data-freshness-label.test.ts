/**
 * Task 1293 — fix(freshness): getDataFreshness() 'Cu' label drift
 *
 * Regression guard: test 185 ('shows Cu for market_prices updated 10 hours ago')
 * fails because the "Gia co phieu" query was changed to read vps_push_log but
 * the fallback to market_prices.updated_at was lost.  This test pins the
 * contract: when vps_push_log has no rows the implementation MUST fall back to
 * market_prices.updated_at so that the 'Cu' label still appears in the report.
 *
 * Acceptance criteria:
 *   1. When market_prices has a row updated 10 hours ago and vps_push_log is
 *      absent/empty, the report contains "Cu".
 *   2. When vps_push_log has a row pushed 10 hours ago, the report still
 *      contains "Cu" (primary path still works).
 *   3. When both tables are absent, the row shows "Chua co du lieu" (no crash).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getDataFreshness } from "../interface/mcp/tools/market-data/dataFreshnessTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildMinimalDb(options: {
  withVpsPushLog?: boolean;
  withMarketPrices?: boolean;
}): Database {
  const db = new Database(":memory:");

  if (options.withVpsPushLog) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vps_push_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service TEXT NOT NULL,
        status TEXT NOT NULL,
        pushed_at TEXT NOT NULL
      );
    `);
  }

  if (options.withMarketPrices) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_prices (
        code TEXT PRIMARY KEY,
        price REAL,
        change_amt REAL,
        change_pct REAL,
        volume REAL,
        updated_at TEXT
      );
    `);
  }

  // Other tables present but empty (needed so report runs to completion)
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'global',
      data_env TEXT
,
    source_url TEXT UNIQUE);
    CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY,
      stock_code TEXT,
      parsed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      triggered_at TEXT NOT NULL,
      severity TEXT NOT NULL
    );
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1293 — getDataFreshness() 'Cu' fallback via market_prices", () => {
  let db: Database;

  afterEach(() => {
    db?.close();
  });

  it("shows 'Cu' when market_prices has a row 10 hours old and vps_push_log is absent", async () => {
    // AC-1: fallback path
    db = buildMinimalDb({ withMarketPrices: true });
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    db.exec(`INSERT INTO market_prices (code, price, updated_at) VALUES ('VCB', 100, '${tenHoursAgo}')`);

    const result = await getDataFreshness(db);
    expect(result).toContain("Cũ");
  });

  it("shows 'Cũ' when vps_push_log has a row 10 hours old (primary path)", async () => {
    // AC-2: primary path still works
    db = buildMinimalDb({ withVpsPushLog: true });
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    db.exec(
      `INSERT INTO vps_push_log (service, status, pushed_at) VALUES ('prices', 'ok', '${tenHoursAgo}')`,
    );

    const result = await getDataFreshness(db);
    expect(result).toContain("Cũ");
  });

  it("shows 'Chưa có dữ liệu' for Giá cổ phiếu when both tables are absent", async () => {
    // AC-3: graceful null path — no crash, no phantom status
    db = buildMinimalDb({});
    const result = await getDataFreshness(db);
    // The report must still be generated without throwing
    expect(typeof result).toBe("string");
    expect(result).toContain("Chưa có dữ liệu");
  });

  it("shows 'Tốt' when market_prices has a row updated 5 minutes ago", async () => {
    db = buildMinimalDb({ withMarketPrices: true });
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    db.exec(`INSERT INTO market_prices (code, price, updated_at) VALUES ('VNM', 80, '${fiveMinsAgo}')`);

    const result = await getDataFreshness(db);
    expect(result).toContain("Tốt");
  });
});
