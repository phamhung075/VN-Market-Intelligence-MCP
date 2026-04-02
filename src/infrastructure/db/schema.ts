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

  // ── Agent Signal Bus (Task 242) ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent TEXT NOT NULL,
      to_agent TEXT NOT NULL,
      signal_type TEXT NOT NULL,
      stock_code TEXT,
      payload TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'unread',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_agent_signals_to ON agent_signals(to_agent, status);
    CREATE INDEX IF NOT EXISTS idx_agent_signals_expires ON agent_signals(expires_at);
  `);

  // ── Financial Reports (BCTC) ───────────────────────────────────────────────
  // DDL imported from bctc-schema.ts — includes financial_reports table,
  // all scalar columns, JSON blobs, indexes, v_chart_timeseries and
  // v_yoy_comparison views.
  db.exec(SQLITE_DDL);
}
