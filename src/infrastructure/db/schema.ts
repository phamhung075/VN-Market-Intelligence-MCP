/**
 * SQLite database initialisation and singleton accessor.
 *
 * Uses Bun's built-in `bun:sqlite` — no native compilation required.
 *
 * Tables created:
 *   - watchlist        — user's stock watchlist with alert thresholds
 *   - market_prices    — latest price snapshot per stock
 *   - alerts           — triggered alert records
 *   - rag_analyses     — structured RAG memory entries (vector stored in LanceDB)
 *   - financial_reports — BCTC financial report data (see bctc-schema.ts for DDL)
 *
 * `initDatabase()` is idempotent: uses CREATE TABLE IF NOT EXISTS and
 * CREATE INDEX IF NOT EXISTS throughout, so calling it multiple times is safe.
 *
 * Numbers stored in million VND unless explicitly noted otherwise.
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SQLITE_DDL } from "../../../bctc-schema.js";

/** Resolved DB path — can be overridden via DB_PATH env var (useful in tests) */
const DB_PATH: string = Bun.env["DB_PATH"] ?? "./data/market.db";

let _db: Database | null = null;

/**
 * Returns the singleton `bun:sqlite` Database instance.
 * Opens the database on first call and creates the data directory if needed.
 */
export function getDb(): Database {
  if (_db) return _db;

  // Ensure data directory exists — skip for the special `:memory:` path
  if (DB_PATH !== ":memory:") {
    const dir = dirname(DB_PATH);
    mkdirSync(dir, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");
  return _db;
}

/**
 * Closes and resets the singleton database connection.
 *
 * Intended for use in tests only — allows a fresh connection after the
 * underlying DB file has been deleted or replaced.
 */
export function closeDb(): void {
  if (_db) {
    try {
      _db.close();
    } catch (_) {
      // ignore errors on close (e.g. already closed)
    }
    _db = null;
  }
}

/**
 * Creates all application tables and indexes (idempotent).
 *
 * Safe to call at startup and in tests — every statement uses
 * CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
 */
export async function initDatabase(): Promise<void> {
  const db = getDb();

  // ── Watchlist ──────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL,
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL,
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
    );
  `);

  // ── Market Prices ──────────────────────────────────────────────────────────
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

  // ── Alerts ─────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,   -- info | warning | critical
      signals_json          TEXT,            -- JSON string[]
      affected_actions_json TEXT,            -- JSON {code, expectedImpact, confidence}[]
      analysis_ids_json     TEXT,            -- JSON string[]
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_read      ON alerts(read);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity  ON alerts(severity);
  `);

  // ── RAG Analyses ────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id                 TEXT PRIMARY KEY,
      created_at         TEXT NOT NULL,
      level              TEXT NOT NULL,      -- global | country | domain | action
      source_url         TEXT,
      source_title       TEXT,
      source_type        TEXT,               -- news | market_data | financial_report | macro
      published_at       TEXT,
      sentiment          TEXT,               -- bullish | bearish | neutral
      impact_score       REAL,               -- 0-10
      impact_direction   TEXT,               -- up | down | neutral
      confidence         REAL,               -- 0-1
      time_horizon       TEXT,               -- short | medium | long
      summary            TEXT,
      reasoning          TEXT,
      affected_countries TEXT,               -- JSON string[]
      affected_domains   TEXT,               -- JSON string[]
      affected_actions   TEXT,               -- JSON string[]
      parent_ids         TEXT,               -- JSON string[]
      tags               TEXT,               -- JSON string[]
      embedding_text     TEXT
      -- embedding vector stored in LanceDB (indexed separately)
    );

    CREATE INDEX IF NOT EXISTS idx_rag_created   ON rag_analyses(created_at);
    CREATE INDEX IF NOT EXISTS idx_rag_level     ON rag_analyses(level);
    CREATE INDEX IF NOT EXISTS idx_rag_sentiment ON rag_analyses(sentiment);
  `);

  // Task 102: dedup news by source_url — partial unique index excludes NULL + empty string rows
  // (articles with missing URLs bypass the constraint and may generate duplicates — acceptable per REQ-005)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url
      ON rag_analyses(source_url)
      WHERE source_url IS NOT NULL AND source_url != '';
  `);

  // ── Financial Reports (BCTC) ───────────────────────────────────────────────
  // DDL imported from bctc-schema.ts — includes financial_reports table,
  // all scalar columns, JSON blobs, indexes, v_chart_timeseries and
  // v_yoy_comparison views.
  db.exec(SQLITE_DDL);

  // ── Macro Indicators (Task 024) ────────────────────────────────────────────
  // Stores macro economic data fetched from Trading Economics.
  // UNIQUE(country) enforces upsert semantics via INSERT OR REPLACE.
  db.exec(`
    CREATE TABLE IF NOT EXISTS macro_indicators (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      country       TEXT NOT NULL,
      cpi           REAL,
      gdp_growth    REAL,
      interest_rate REAL,
      fetched_at    TEXT NOT NULL,
      UNIQUE(country)
    );
  `);

  // ── Commodity Prices (Task 025 — Yahoo Finance) ────────────────────────────
  // commodity_prices: latest snapshot per source (upsert target, PRIMARY KEY = source)
  // commodity_prices_history: append-only audit log for trend queries
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices (
      source           TEXT PRIMARY KEY,
      brent_crude_usd  REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz  REAL NOT NULL DEFAULT 0,
      usd_vnd_rate     REAL NOT NULL DEFAULT 0,
      fetched_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS commodity_prices_history (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      source           TEXT NOT NULL,
      brent_crude_usd  REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz  REAL NOT NULL DEFAULT 0,
      usd_vnd_rate     REAL NOT NULL DEFAULT 0,
      fetched_at       TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_commodity_history_source_time
      ON commodity_prices_history(source, fetched_at DESC);
  `);

  // ── SBV (State Bank of Vietnam) Rates — Task 028 ──────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbv_rates (
      source               TEXT PRIMARY KEY,
      overnight_rate_pct   REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct REAL NOT NULL DEFAULT 0,
      usd_vnd_official     REAL NOT NULL DEFAULT 0,
      fetched_at           TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sbv_rates_history (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      source               TEXT NOT NULL,
      overnight_rate_pct   REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct REAL NOT NULL DEFAULT 0,
      usd_vnd_official     REAL NOT NULL DEFAULT 0,
      fetched_at           TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sbv_history_source_time
      ON sbv_rates_history(source, fetched_at DESC);
  `);

  // ── Market Summaries (Task 130) ────────────────────────────────────────────
  // Stores periodic intelligence summaries (daily / weekly / monthly / quarterly / yearly).
  // Upsert target: unique on (period_type, period_start).
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_summaries (
      id                    TEXT PRIMARY KEY,
      period_type           TEXT NOT NULL,
      period_start          TEXT NOT NULL,
      period_end            TEXT NOT NULL,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
      summary_text          TEXT NOT NULL,
      key_events_json       TEXT,
      stock_performance_json TEXT,
      alerts_summary_json   TEXT,
      macro_context_json    TEXT,
      recommendation_json   TEXT,
      news_count            INTEGER DEFAULT 0,
      alert_count           INTEGER DEFAULT 0,
      report_count          INTEGER DEFAULT 0,
      data_sources_json     TEXT,
      UNIQUE(period_type, period_start)
    );

    CREATE INDEX IF NOT EXISTS idx_ms_period  ON market_summaries(period_type, period_start);
    CREATE INDEX IF NOT EXISTS idx_ms_created ON market_summaries(created_at);
  `);

  // ── Task 132: BCTC Validator columns ──────────────────────────────────────
  // ALTER TABLE is idempotent-safe via try/catch: SQLite throws if column
  // already exists; we swallow those errors and carry on.
  try {
    db.exec(`ALTER TABLE financial_reports ADD COLUMN validation_status TEXT DEFAULT 'pending'`);
  } catch (_) { /* column already exists — safe to ignore */ }
  try {
    db.exec(`ALTER TABLE financial_reports ADD COLUMN validation_notes TEXT`);
  } catch (_) { /* column already exists — safe to ignore */ }

  // ── System Logs (Task 130) ─────────────────────────────────────────────────
  // Persistent log table for warn/error entries.
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp    TEXT NOT NULL DEFAULT (datetime('now')),
      level        TEXT NOT NULL,
      source       TEXT NOT NULL,
      message      TEXT NOT NULL,
      details_json TEXT,
      resolved     INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_syslog_level  ON system_logs(level, timestamp);
    CREATE INDEX IF NOT EXISTS idx_syslog_source ON system_logs(source, timestamp);
  `);

  // ── PDF Extracted Text (OCR cache) ──────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS pdf_extracted_text (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      filename      TEXT NOT NULL,
      page_number   INTEGER NOT NULL,
      text_content  TEXT NOT NULL,
      confidence    REAL DEFAULT 0,
      extracted_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(filename, page_number)
    );
    CREATE INDEX IF NOT EXISTS idx_pdf_filename ON pdf_extracted_text(filename);
  `);

  // ── Seed default watchlist from mcp.config.json ───────────────────────────
  try {
    const { mcpConfig } = await import("../config.js");
    const defaultStocks = mcpConfig.market.watchlist;
    if (defaultStocks.length > 0) {
      const existing = db.query("SELECT COUNT(*) as c FROM watchlist").get() as { c: number };
      if (existing.c === 0) {
        const domainMap: Record<string, string> = { VNM: "retail", FPT: "tech", VCB: "banking", VEA: "aviation" };
        const ins = db.prepare(
          "INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new) VALUES (?, 'HOSE', ?, datetime('now'), -3, 5, 7, 1)"
        );
        for (const code of defaultStocks) {
          ins.run(code, domainMap[code] ?? "other");
        }
      }
    }
  } catch { /* config not available — skip seeding */ }
}
