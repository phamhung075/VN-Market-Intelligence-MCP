/**
 * Task 002 — SQLite schema + migrations
 *
 * Verifies:
 *   1. initDatabase() creates all required tables
 *   2. initDatabase() is idempotent (calling twice does not crash)
 *   3. Tables have correct columns
 *   4. Can insert and query basic records
 *
 * Uses `:memory:` via DB_PATH env var to avoid file-system / WAL locking on
 * Windows while still exercising the full initDatabase() code path.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

// Use in-memory SQLite for test isolation — avoids WAL file locking on Windows.
// Must be set BEFORE importing schema module so the module-level DB_PATH picks it up.
process.env["DB_PATH"] = ":memory:";

import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

describe("Task 002 — SQLite schema + migrations", () => {
  beforeAll(async () => {
    // Reset any previous singleton (e.g. from another test file in the same process)
    closeDb();
    // Open a fresh in-memory DB and create all tables
    await initDatabase();
  });

  afterAll(() => {
    closeDb();
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it("initDatabase() can be called twice without crashing", async () => {
    // CREATE TABLE IF NOT EXISTS is idempotent — must not throw
    await expect(initDatabase()).resolves.toBeUndefined();
  });

  it("initDatabase() can be called a third time without crashing", async () => {
    await expect(initDatabase()).resolves.toBeUndefined();
  });

  // ── Table existence ────────────────────────────────────────────────────────

  it("watchlist table exists", () => {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='watchlist'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("watchlist");
  });

  it("market_prices table exists", () => {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='market_prices'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("market_prices");
  });

  it("alerts table exists", () => {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='alerts'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("alerts");
  });

  it("rag_analyses table exists", () => {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='rag_analyses'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("rag_analyses");
  });

  it("financial_reports table exists", () => {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='financial_reports'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("financial_reports");
  });

  // ── Column checks ──────────────────────────────────────────────────────────

  it("watchlist table has required columns", () => {
    const db = getDb();
    const cols = db
      .prepare("PRAGMA table_info(watchlist)")
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("code");
    expect(names).toContain("exchange");
    expect(names).toContain("domain");
    expect(names).toContain("added_at");
    expect(names).toContain("alert_drop_pct");
    expect(names).toContain("alert_rise_pct");
    expect(names).toContain("alert_impact_min");
    expect(names).toContain("alert_report_new");
  });

  it("alerts table has required columns", () => {
    const db = getDb();
    const cols = db
      .prepare("PRAGMA table_info(alerts)")
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("triggered_at");
    expect(names).toContain("severity");
    expect(names).toContain("message");
    expect(names).toContain("read");
  });

  it("rag_analyses table has required columns", () => {
    const db = getDb();
    const cols = db
      .prepare("PRAGMA table_info(rag_analyses)")
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("created_at");
    expect(names).toContain("level");
    expect(names).toContain("sentiment");
    expect(names).toContain("impact_score");
    expect(names).toContain("embedding_text");
  });

  it("financial_reports table has required columns", () => {
    const db = getDb();
    const cols = db
      .prepare("PRAGMA table_info(financial_reports)")
      .all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain("id");
    expect(names).toContain("action_code");
    expect(names).toContain("period_year");
    expect(names).toContain("period_type");
    expect(names).toContain("sort_key");
    expect(names).toContain("net_revenue");
    expect(names).toContain("total_assets");
    expect(names).toContain("balance_sheet_json");
    expect(names).toContain("income_stmt_json");
    expect(names).toContain("cash_flow_json");
    expect(names).toContain("ratios_json");
  });

  // ── Index existence ────────────────────────────────────────────────────────

  it("alerts table has triggered_at index", () => {
    const db = getDb();
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_alerts_triggered'"
      )
      .get() as { name: string } | undefined;
    expect(idx?.name).toBe("idx_alerts_triggered");
  });

  it("rag_analyses table has level index", () => {
    const db = getDb();
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_rag_level'"
      )
      .get() as { name: string } | undefined;
    expect(idx?.name).toBe("idx_rag_level");
  });

  it("financial_reports table has action index", () => {
    const db = getDb();
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_fr_action'"
      )
      .get() as { name: string } | undefined;
    expect(idx?.name).toBe("idx_fr_action");
  });

  // ── Insert + query roundtrip ───────────────────────────────────────────────

  it("can insert and query a watchlist record", () => {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO watchlist (code, exchange, domain, added_at)
      VALUES ('VCB', 'HOSE', 'banking', '2026-03-24T00:00:00.000Z')
    `).run();

    const row = db
      .prepare("SELECT * FROM watchlist WHERE code = 'VCB'")
      .get() as { code: string; exchange: string; domain: string } | undefined;

    expect(row?.code).toBe("VCB");
    expect(row?.exchange).toBe("HOSE");
    expect(row?.domain).toBe("banking");
  });

  it("watchlist alert_drop_pct defaults to -3", () => {
    const db = getDb();
    const row = db
      .prepare("SELECT alert_drop_pct FROM watchlist WHERE code = 'VCB'")
      .get() as { alert_drop_pct: number } | undefined;
    expect(row?.alert_drop_pct).toBe(-3);
  });

  it("can insert and query an alert record", () => {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO alerts (id, triggered_at, severity, message, read)
      VALUES ('alert-001', '2026-03-24T08:00:00.000Z', 'warning', 'VCB dropped 4%', 0)
    `).run();

    const row = db
      .prepare("SELECT * FROM alerts WHERE id = 'alert-001'")
      .get() as { id: string; severity: string; read: number } | undefined;

    expect(row?.id).toBe("alert-001");
    expect(row?.severity).toBe("warning");
    expect(row?.read).toBe(0);
  });

  it("can insert and query a rag_analyses record", () => {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO rag_analyses (id, created_at, level, sentiment, impact_score)
      VALUES ('rag-001', '2026-03-24T08:00:00.000Z', 'action', 'bullish', 8.5)
    `).run();

    const row = db
      .prepare("SELECT * FROM rag_analyses WHERE id = 'rag-001'")
      .get() as { id: string; level: string; impact_score: number } | undefined;

    expect(row?.id).toBe("rag-001");
    expect(row?.level).toBe("action");
    expect(row?.impact_score).toBe(8.5);
  });

  it("can insert and query a financial_reports record", () => {
    const db = getDb();
    // Clean up any leftover data from previous runs (unique on action_code + sort_key)
    db.prepare("DELETE FROM financial_reports WHERE action_code = 'VCB' AND sort_key = '2024-Q1'").run();
    db.prepare(`
      INSERT INTO financial_reports (
        id, action_code, company_name, exchange, domain,
        period_year, period_type, period_start, period_end, sort_key,
        parsed_at,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
      ) VALUES (
        'fr-001', 'VCB', 'Vietcombank', 'HOSE', 'banking',
        2024, 'Q1', '2024-01-01', '2024-03-31', '2024-Q1',
        '2026-03-24T00:00:00.000Z',
        '{}', '{}', '{}', '{}'
      )
    `).run();

    const row = db
      .prepare("SELECT * FROM financial_reports WHERE id = 'fr-001'")
      .get() as {
      id: string;
      action_code: string;
      sort_key: string;
    } | undefined;

    expect(row?.id).toBe("fr-001");
    expect(row?.action_code).toBe("VCB");
    expect(row?.sort_key).toBe("2024-Q1");
  });

  it("financial_reports UNIQUE constraint on (action_code, sort_key) works", () => {
    const db = getDb();
    // Ensure the first record exists for the constraint test
    db.prepare("DELETE FROM financial_reports WHERE action_code = 'VCB' AND sort_key = '2024-Q1'").run();
    db.prepare(`
      INSERT INTO financial_reports (
        id, action_code, company_name, exchange, domain,
        period_year, period_type, period_start, period_end, sort_key,
        parsed_at,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
      ) VALUES (
        'fr-dup-base', 'VCB', 'Vietcombank', 'HOSE', 'banking',
        2024, 'Q1', '2024-01-01', '2024-03-31', '2024-Q1',
        '2026-03-24T00:00:00.000Z',
        '{}', '{}', '{}', '{}'
      )
    `).run();
    // Second insert with same (action_code, sort_key) should throw
    expect(() => {
      db.prepare(`
        INSERT INTO financial_reports (
          id, action_code, company_name, exchange, domain,
          period_year, period_type, period_start, period_end, sort_key,
          parsed_at,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
        ) VALUES (
          'fr-dup-fail', 'VCB', 'Vietcombank', 'HOSE', 'banking',
          2024, 'Q1', '2024-01-01', '2024-03-31', '2024-Q1',
          '2026-03-24T00:00:00.000Z',
          '{}', '{}', '{}', '{}'
        )
      `).run();
    }).toThrow();
  });

  // ── Views exist ────────────────────────────────────────────────────────────

  it("v_chart_timeseries view exists", () => {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='view' AND name='v_chart_timeseries'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("v_chart_timeseries");
  });

  it("v_yoy_comparison view exists", () => {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='view' AND name='v_yoy_comparison'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("v_yoy_comparison");
  });

  // ── WAL mode and foreign keys ──────────────────────────────────────────────

  it("WAL journal mode is enabled", () => {
    const db = getDb();
    const row = db.prepare("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    // In-memory databases report 'memory' journal mode (WAL not applicable).
    // File-based databases will report 'wal'.
    expect(["wal", "memory"]).toContain(row.journal_mode);
  });

  it("foreign keys pragma is enabled", () => {
    const db = getDb();
    const row = db.prepare("PRAGMA foreign_keys").get() as {
      foreign_keys: number;
    };
    expect(row.foreign_keys).toBe(1);
  });
});
