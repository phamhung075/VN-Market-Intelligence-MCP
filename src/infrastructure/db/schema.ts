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
import { dirname, resolve } from "node:path";
import { SQLITE_DDL } from "../../../bctc-schema.js";

/**
 * Default DB path — resolved to absolute path at module load time.
 */
const PROJECT_ROOT = resolve(import.meta.dir, "..", "..", "..");
const DEFAULT_DB_PATH = resolve(PROJECT_ROOT, "data", "market.db");

// ── Custom Alert Rules DDL (Task 219) ────────────────────────────────────────
const CUSTOM_ALERT_RULES_DDL = `
  CREATE TABLE IF NOT EXISTS custom_alert_rules (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    code         TEXT NOT NULL,
    predicate    TEXT NOT NULL,
    threshold    REAL NOT NULL,
    status       TEXT NOT NULL DEFAULT 'active',
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    triggered_at TEXT,
    notes        TEXT
  )
`;

export function ensureCustomAlertRulesTable(db: Database): void {
  db.exec(CUSTOM_ALERT_RULES_DDL);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_custom_alert_rules_code ON custom_alert_rules(code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_custom_alert_rules_status ON custom_alert_rules(status)`);
}

let _db: Database | null = null;

/**
 * Returns the singleton `bun:sqlite` Database instance.
 * Opens the database on first call and creates the data directory if needed.
 * Re-reads DB_PATH env var on each new connection so tests can override it.
 */
export function getDb(): Database {
  if (_db) return _db;

  // Re-read env var each time — tests may set it after module load
  const dbPath = process.env["DB_PATH"] ?? Bun.env["DB_PATH"] ?? DEFAULT_DB_PATH;

  // Ensure data directory exists — skip for the special `:memory:` path
  if (dbPath !== ":memory:") {
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true });
  }

  _db = new Database(dbPath);
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

  // ── Prediction Markets (task 163) ──────────────────────────────────────────
  // `prediction_markets` is an upsert target — one row per market, overwritten
  // each poll cycle via INSERT OR REPLACE.
  // `prediction_signals` is append-only — every detected signal is kept for
  // audit and for the `get_prediction_markets` MCP tool's signals_only filter.
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_markets (
      id               TEXT PRIMARY KEY,   -- Polymarket condition_id
      question         TEXT NOT NULL,
      end_date         TEXT NOT NULL,      -- ISO 8601
      yes_price        REAL NOT NULL,      -- 0.0–1.0
      no_price         REAL NOT NULL,
      volume_24h       REAL NOT NULL DEFAULT 0,
      volume_total     REAL NOT NULL DEFAULT 0,
      liquidity        REAL NOT NULL DEFAULT 0,
      last_trade_price REAL NOT NULL DEFAULT 0,
      unique_wallets   INTEGER NOT NULL DEFAULT 0,
      tags             TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
      fetched_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prediction_signals (
      id              TEXT PRIMARY KEY,         -- UUID
      market_id       TEXT NOT NULL,            -- FK → prediction_markets.id
      signal_type     TEXT NOT NULL,            -- volume_spike|probability_shift|insider_timing|sentiment_divergence
      severity        TEXT NOT NULL,            -- low|medium|high|critical
      yes_price_prev  REAL,                     -- NULL for volume_spike signals with no prior snapshot
      yes_price_curr  REAL NOT NULL,
      volume_24h      REAL NOT NULL DEFAULT 0,
      unique_wallets  INTEGER NOT NULL DEFAULT 0,
      confidence      REAL NOT NULL,
      mapped_sectors  TEXT NOT NULL DEFAULT '[]',  -- JSON DomainType[]
      mapped_stocks   TEXT NOT NULL DEFAULT '[]',  -- JSON string[]
      reasoning       TEXT NOT NULL,
      detected_at     TEXT NOT NULL,
      FOREIGN KEY (market_id) REFERENCES prediction_markets(id)
    );

    CREATE INDEX IF NOT EXISTS idx_prediction_signals_detected_at
      ON prediction_signals(detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prediction_signals_market
      ON prediction_signals(market_id);
    CREATE INDEX IF NOT EXISTS idx_prediction_signals_severity
      ON prediction_signals(severity);
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_prediction_signals_detected_at ON prediction_signals(detected_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prediction_signals_market ON prediction_signals(market_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prediction_signals_severity ON prediction_signals(severity)`);

  // ── Price Alerts (Task 206) ────────────────────────────────────────────────
  // Stores user-defined stop-loss / take-profit price thresholds.
  // status: 'active' | 'triggered' | 'cancelled'
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_alerts (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL,
      alert_type   TEXT NOT NULL,
      threshold    REAL NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      triggered_at TEXT,
      notes        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_price_alerts_code   ON price_alerts(code);
    CREATE INDEX IF NOT EXISTS idx_price_alerts_status ON price_alerts(status);
  `);

  // ── Positions (Task 179) ───────────────────────────────────────────────────
  // One open position per stock (UNIQUE on code).
  // closed_at IS NULL = open; closed_at IS NOT NULL = closed.
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
    CREATE INDEX IF NOT EXISTS idx_positions_code ON positions(code);
  `);

  // ── Portfolio P&L Snapshots (Task 209) ────────────────────────────────────
  // Daily snapshot of per-position P&L stored after the morning briefing.
  // UNIQUE(date, code) allows idempotent upserts via INSERT OR REPLACE.
  db.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_pnl_snapshots_date ON portfolio_pnl_snapshots(date);
  `);

  // ── Portfolio Target Allocation (Task 223) ────────────────────────────────
  // Persistent target weights for rebalancing — avoids manual input on each run.
  // code is PRIMARY KEY so INSERT OR REPLACE is idempotent.
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_targets (
      code          TEXT PRIMARY KEY,
      target_weight REAL NOT NULL,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Seed default watchlist from mcp.config.json (skip in tests) ────────────
  const currentDbPath = process.env["DB_PATH"] ?? Bun.env["DB_PATH"] ?? DEFAULT_DB_PATH;
  if (currentDbPath === ":memory:" || Bun.env["BUN_ENV"] === "test" || typeof Bun.env["BUN_TEST"] !== "undefined") return;
  try {
    const { mcpConfig } = await import("../config.js");
    const defaultStocks = mcpConfig.market.watchlist;
    if (defaultStocks.length > 0) {
      const existing = db.query("SELECT COUNT(*) as c FROM watchlist").get() as { c: number };
      if (existing.c === 0) {
        const domainMap: Record<string, string> = { VNM: "retail", FPT: "tech", VCB: "banking", VEA: "automotive" };
        const ins = db.prepare(
          "INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new) VALUES (?, 'HOSE', ?, datetime('now'), -3, 5, 7, 1)"
        );
        for (const code of defaultStocks) {
          ins.run(code, domainMap[code] ?? "other");
        }
      }
    }
  } catch { /* config not available — skip seeding */ }

  // ── Custom Alert Rules (Task 219) ─────────────────────────────────────────
  ensureCustomAlertRulesTable(db);

  // ── Alert Mutes (Task 222) ────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS alert_mutes (
      code        TEXT PRIMARY KEY,
      muted_until TEXT NOT NULL,
      reason      TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_alert_mutes_until ON alert_mutes(muted_until)`);

  // ── Telegram Reports (Task 226) ───────────────────────────────────────────
  // Persists all Report Channel messages for the Dev Team autonomous loop.
  // message_id = 0 means the row was inserted without a Telegram API send.
  db.exec(`
    CREATE TABLE IF NOT EXISTS telegram_reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id  INTEGER NOT NULL DEFAULT 0,
      text        TEXT    NOT NULL,
      from_agent  TEXT    NOT NULL DEFAULT 'unknown',
      priority    TEXT    NOT NULL DEFAULT 'normal',
      status      TEXT    NOT NULL DEFAULT 'new',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telegram_reports_status  ON telegram_reports(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_telegram_reports_created ON telegram_reports(created_at)`);

  // Task 231 — ownership lock columns (idempotent ALTER TABLE for existing DBs)
  try { db.exec(`ALTER TABLE telegram_reports ADD COLUMN claimed_by TEXT`); } catch (_) { /* already exists */ }
  try { db.exec(`ALTER TABLE telegram_reports ADD COLUMN claimed_at TEXT`); } catch (_) { /* already exists */ }

  // ── System Changelog (Task 233) ───────────────────────────────────────────
  // Dev Team logs every fix here so Analysis Team agents can check before
  // re-reporting an already-fixed issue (Gap 2 communication fix).
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_changelog (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      fix_type            TEXT    NOT NULL DEFAULT 'bugfix',
      title               TEXT    NOT NULL,
      detail              TEXT    NOT NULL DEFAULT '',
      files               TEXT    NOT NULL DEFAULT '[]',
      commit_hash         TEXT,
      fixed_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      related_feedback_id INTEGER
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_changelog_fixed_at ON system_changelog(fixed_at)`);
}
