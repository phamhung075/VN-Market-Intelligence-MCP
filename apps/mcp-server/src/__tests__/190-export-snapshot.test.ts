/**
 * Task 190 — Portfolio Snapshot Export
 *
 * Tests for:
 *   - Exported JSON has all 9 top-level keys: exported_at, schema_version,
 *     watchlist, positions, alerts, analysis_entries, financial_reports,
 *     market_prices, summary
 *   - summary.watchlist_count matches actual row count in watchlist table
 *   - summary.open_positions counts only rows WHERE closed_at IS NULL
 *   - File written to data/exports/snapshot_<YYYYMMDD_HHmmss>.json
 *   - File size reported in MB correct to 1 decimal place
 *   - When export directory cannot be written, output contains "(khong the ghi file)"
 *   - All tables export as empty arrays when 0 rows
 *   - Alerts filtered to last 30 days only
 *   - prediction_markets exported as all rows
 *   - prediction_signals filtered to last 7 days
 *   - summary counts are consistent with actual exported arrays
 *   - MCP tool export_portfolio_snapshot is registered on server
 *   - MCP tool handler returns text with file path
 *   - File name format matches snapshot_YYYYMMDD_HHmmss.json
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory / temp DB setup
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL DEFAULT 'HOSE',
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS positions (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      code      TEXT NOT NULL,
      shares    INTEGER NOT NULL,
      avg_price REAL NOT NULL,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      notes     TEXT
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL DEFAULT 'medium',
      signals_json          TEXT,
      affected_actions_json TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rag_analyses (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      level        TEXT NOT NULL DEFAULT 'country',
      summary      TEXT,
      source_title TEXT
    );

    CREATE TABLE IF NOT EXISTS financial_reports (
      id         TEXT PRIMARY KEY,
      stock_code TEXT NOT NULL,
      period     TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS market_prices (
      code       TEXT PRIMARY KEY,
      price      REAL,
      change_pct REAL,
      volume     REAL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS prediction_markets (
      id               TEXT PRIMARY KEY,
      question         TEXT NOT NULL,
      end_date         TEXT NOT NULL,
      yes_price        REAL NOT NULL DEFAULT 0.5,
      no_price         REAL NOT NULL DEFAULT 0.5,
      volume_24h       REAL NOT NULL DEFAULT 0,
      fetched_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prediction_signals (
      id          TEXT PRIMARY KEY,
      market_id   TEXT NOT NULL,
      signal_type TEXT NOT NULL DEFAULT 'spike',
      severity    TEXT NOT NULL DEFAULT 'medium',
      confidence  REAL NOT NULL DEFAULT 0.5,
      detected_at TEXT NOT NULL DEFAULT (datetime('now')),
      reasoning   TEXT NOT NULL DEFAULT ''
    );
  `);

  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

let _id = 0;
function freshId(): string { return `id-${Date.now()}-${++_id}`; }

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

function seedWatchlist(db: Database, code: string) {
  db.prepare("INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at) VALUES (?, 'HOSE', 'other', datetime('now'))").run(code);
}

function seedPosition(db: Database, code: string, closed = false) {
  db.prepare("INSERT INTO positions (code, shares, avg_price, closed_at) VALUES (?, 100, 50000, ?)").run(code, closed ? new Date().toISOString() : null);
}

function seedAlert(db: Database, daysBack = 0) {
  db.prepare("INSERT OR IGNORE INTO alerts (id, triggered_at, severity, message) VALUES (?, ?, 'medium', 'test alert')").run(freshId(), daysAgo(daysBack));
}

function seedAnalysis(db: Database) {
  db.prepare("INSERT OR IGNORE INTO rag_analyses (id, created_at, level, summary) VALUES (?, datetime('now'), 'country', 'test')").run(freshId());
}

function seedFinancialReport(db: Database, code: string) {
  db.prepare("INSERT OR IGNORE INTO financial_reports (id, stock_code, period) VALUES (?, ?, 'Q1-2026')").run(freshId(), code);
}

function seedMarketPrice(db: Database, code: string) {
  db.prepare("INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, updated_at) VALUES (?, 50000, 1.5, 100000, datetime('now'))").run(code);
}

function seedPredictionMarket(db: Database, id: string) {
  db.prepare("INSERT OR IGNORE INTO prediction_markets (id, question, end_date, yes_price, no_price, fetched_at, updated_at) VALUES (?, 'Test?', '2026-12-31', 0.6, 0.4, datetime('now'), datetime('now'))").run(id);
}

function seedPredictionSignal(db: Database, marketId: string, daysBack = 0) {
  db.prepare("INSERT OR IGNORE INTO prediction_signals (id, market_id, detected_at, reasoning) VALUES (?, ?, ?, 'test')").run(freshId(), marketId, daysAgo(daysBack));
}

// ─────────────────────────────────────────────────────────────────────────────
// Imports under test
// ─────────────────────────────────────────────────────────────────────────────

import {
  exportPortfolioSnapshot,
  type SnapshotResult,
} from "../application/usecases/exportPortfolioSnapshot.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 190 — Portfolio Snapshot Export", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = setupTestDb();
    tmpDir = mkdtempSync(join(tmpdir(), "snap-test-"));
  });

  afterEach(() => {
    db.close();
    try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  // ── 1: All 9 top-level keys present ───────────────────────────────────────
  it("exported JSON has all required top-level keys", async () => {
    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });

    expect(result.snapshot).toHaveProperty("exported_at");
    expect(result.snapshot).toHaveProperty("schema_version");
    expect(result.snapshot).toHaveProperty("watchlist");
    expect(result.snapshot).toHaveProperty("positions");
    expect(result.snapshot).toHaveProperty("alerts");
    expect(result.snapshot).toHaveProperty("analysis_entries");
    expect(result.snapshot).toHaveProperty("financial_reports");
    expect(result.snapshot).toHaveProperty("market_prices");
    expect(result.snapshot).toHaveProperty("summary");
  });

  // ── 2: summary.watchlist_count matches actual row count ───────────────────
  it("summary.watchlist_count matches actual watchlist row count", async () => {
    seedWatchlist(db, "VCB");
    seedWatchlist(db, "FPT");
    seedWatchlist(db, "VNM");

    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });

    expect(result.snapshot.summary.watchlist_count).toBe(3);
    expect(result.snapshot.watchlist.length).toBe(3);
  });

  // ── 3: summary.open_positions only counts rows WHERE closed_at IS NULL ────
  it("summary.open_positions counts only open positions (closed_at IS NULL)", async () => {
    seedPosition(db, "VCB", false);   // open
    seedPosition(db, "FPT", false);   // open
    seedPosition(db, "VNM", true);    // closed

    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });

    expect(result.snapshot.summary.open_positions).toBe(2);
  });

  // ── 4: File written to exportDir/snapshot_YYYYMMDD_HHmmss.json ────────────
  it("writes file to exportDir with correct naming pattern", async () => {
    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });

    expect(result.filePath).toBeTruthy();
    expect(result.filePath).toContain("snapshot_");
    expect(result.filePath).toMatch(/snapshot_\d{8}_\d{6}\.json$/);
    expect(existsSync(result.filePath)).toBe(true);
  });

  // ── 5: File size reported in MB ───────────────────────────────────────────
  it("reports file size in MB to 1 decimal place", async () => {
    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });

    expect(typeof result.fileSizeMb).toBe("number");
    expect(result.fileSizeMb).toBeGreaterThanOrEqual(0);
    // Check it's rounded to 1 decimal
    const str = result.fileSizeMb.toString();
    const parts = str.split(".");
    expect(parts.length).toBeLessThanOrEqual(2);
    if (parts.length === 2) {
      expect(parts[1]!.length).toBeLessThanOrEqual(1);
    }
  });

  // ── 6: Unwritable dir → error flag / message ─────────────────────────────
  it("when export directory cannot be written, result contains error indicator", async () => {
    const badDir = "/root/no-permission-dir-that-should-not-exist-xyz";
    const result = await exportPortfolioSnapshot({ db, exportDir: badDir });

    expect(result.error).toBeTruthy();
    expect(result.error).toContain("không thể ghi file");
  });

  // ── 7: All tables export as empty arrays when 0 rows ──────────────────────
  it("all tables export as empty arrays on empty DB", async () => {
    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });

    expect(Array.isArray(result.snapshot.watchlist)).toBe(true);
    expect(result.snapshot.watchlist.length).toBe(0);

    expect(Array.isArray(result.snapshot.positions)).toBe(true);
    expect(result.snapshot.positions.length).toBe(0);

    expect(Array.isArray(result.snapshot.alerts)).toBe(true);
    expect(result.snapshot.alerts.length).toBe(0);

    expect(Array.isArray(result.snapshot.analysis_entries)).toBe(true);
    expect(result.snapshot.analysis_entries.length).toBe(0);

    expect(Array.isArray(result.snapshot.financial_reports)).toBe(true);
    expect(result.snapshot.financial_reports.length).toBe(0);

    expect(Array.isArray(result.snapshot.market_prices)).toBe(true);
    expect(result.snapshot.market_prices.length).toBe(0);
  });

  // ── 8: Alerts filtered to last 30 days ────────────────────────────────────
  it("alerts filtered to last 30 days only", async () => {
    seedAlert(db, 5);   // 5 days ago — included
    seedAlert(db, 20);  // 20 days ago — included
    seedAlert(db, 31);  // 31 days ago — excluded
    seedAlert(db, 40);  // 40 days ago — excluded

    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });

    expect(result.snapshot.alerts.length).toBe(2);
  });

  // ── 9: prediction_markets exported all rows ───────────────────────────────
  it("prediction_markets key exists and contains all rows", async () => {
    seedPredictionMarket(db, "pm-001");
    seedPredictionMarket(db, "pm-002");

    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });

    expect(result.snapshot).toHaveProperty("prediction_markets");
    expect(Array.isArray(result.snapshot.prediction_markets)).toBe(true);
    expect(result.snapshot.prediction_markets.length).toBe(2);
  });

  // ── 10: prediction_signals filtered to last 7 days ────────────────────────
  it("prediction_signals filtered to last 7 days", async () => {
    seedPredictionMarket(db, "pm-100");
    seedPredictionSignal(db, "pm-100", 3);  // 3 days ago — included
    seedPredictionSignal(db, "pm-100", 6);  // 6 days ago — included
    seedPredictionSignal(db, "pm-100", 8);  // 8 days ago — excluded

    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });

    expect(result.snapshot).toHaveProperty("prediction_signals");
    expect(Array.isArray(result.snapshot.prediction_signals)).toBe(true);
    expect(result.snapshot.prediction_signals.length).toBe(2);
  });

  // ── 11: summary counts consistent with exported arrays ────────────────────
  it("summary counts are consistent with exported array lengths", async () => {
    seedWatchlist(db, "VCB");
    seedWatchlist(db, "FPT");
    seedAlert(db, 1);
    seedAlert(db, 2);
    seedAlert(db, 3);
    seedMarketPrice(db, "VCB");
    seedPredictionMarket(db, "pm-x");

    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });

    const s = result.snapshot;
    expect(s.summary.watchlist_count).toBe(s.watchlist.length);
    expect(s.summary.alert_count).toBe(s.alerts.length);
    expect(s.summary.market_prices_count).toBe(s.market_prices.length);
    expect(s.summary.prediction_markets_count).toBe(s.prediction_markets.length);
  });

  // ── 12: MCP tool removed — sprint-036 task 230 ───────────────────────────
  it("export_portfolio_snapshot is NOT registered as an MCP tool (removed in task 230)", () => {
    const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerExportTools } = require("../interface/mcp/tools/portfolio/exportTools.js");

    const server = new McpServer(
      { name: "test-190", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );

    expect(() => registerExportTools(server)).not.toThrow();

    const registeredTools = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    expect(registeredTools).not.toHaveProperty("export_portfolio_snapshot"); // removed in task 230
  });

  // ── 13: MCP tool handler removed — sprint-036 task 230 ───────────────────
  it.skip("MCP tool handler returns text content (tool removed in task 230)", async () => {
    // export_portfolio_snapshot is no longer registered as an MCP tool.
    // The exportPortfolioSnapshot use case is still available internally.
  });

  // ── 14: snapshot_<YYYYMMDD_HHmmss>.json filename format ──────────────────
  it("filename is snapshot_YYYYMMDD_HHmmss.json", async () => {
    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });

    const filename = result.filePath.split("/").pop()!;
    expect(filename).toMatch(/^snapshot_\d{8}_\d{6}\.json$/);
  });

  // ── 15: exported_at is ISO 8601 string ───────────────────────────────────
  it("exported_at field is a valid ISO 8601 date string", async () => {
    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });

    expect(typeof result.snapshot.exported_at).toBe("string");
    const parsed = new Date(result.snapshot.exported_at);
    expect(isNaN(parsed.getTime())).toBe(false);
  });

  // ── 16: schema_version is a string ───────────────────────────────────────
  it("schema_version is '1.0'", async () => {
    const result = await exportPortfolioSnapshot({ db, exportDir: tmpDir });
    expect(result.snapshot.schema_version).toBe("1.0");
  });
});
