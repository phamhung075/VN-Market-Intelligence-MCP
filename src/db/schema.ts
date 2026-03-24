/**
 * SQLite database initialisation and singleton accessor
 * Tables: watchlist | market_prices | alerts | rag_analyses | financial_reports
 * (financial_reports DDL is in bctc-schema.ts — imported here)
 */

import Database from 'better-sqlite3'
import path from 'node:path'
import { SQLITE_DDL } from '../../bctc-schema.js'

const DB_PATH = Bun.env.DB_PATH ?? './data/market.db'

let _db: ReturnType<typeof Database> | null = null

export function getDb() {
  if (_db) return _db

  // Ensure data directory exists
  const dir = path.dirname(DB_PATH)
  Bun.spawnSync(['mkdir', '-p', dir])

  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  return _db
}

export async function initDatabase() {
  const db = getDb()

  // ── Watchlist ─────────────────────────────────────────────────────────
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

    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT NOT NULL,
      price       REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT,
      PRIMARY KEY (code)
    );
  `)

  // ── Alerts ────────────────────────────────────────────────────────────
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
  `)

  // ── RAG Analyses ──────────────────────────────────────────────────────
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
      impact_score       REAL,              -- 0-10
      impact_direction   TEXT,              -- up | down | neutral
      confidence         REAL,              -- 0-1
      time_horizon       TEXT,              -- short | medium | long
      summary            TEXT,
      reasoning          TEXT,
      affected_countries TEXT,              -- JSON string[]
      affected_domains   TEXT,              -- JSON string[]
      affected_actions   TEXT,              -- JSON string[]
      parent_ids         TEXT,              -- JSON string[]
      tags               TEXT,              -- JSON string[]
      embedding_text     TEXT
      -- embedding vector stored in LanceDB (indexed separately)
    );

    CREATE INDEX IF NOT EXISTS idx_rag_created  ON rag_analyses(created_at);
    CREATE INDEX IF NOT EXISTS idx_rag_level    ON rag_analyses(level);
    CREATE INDEX IF NOT EXISTS idx_rag_sentiment ON rag_analyses(sentiment);
  `)

  // ── Financial Reports (BCTC) ──────────────────────────────────────────
  db.exec(SQLITE_DDL)
}
