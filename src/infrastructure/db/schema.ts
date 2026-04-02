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

  // Alert resolution lifecycle (task 148) + notified_telegram column
  try {
    const alertCols = db.query<{ name: string }, []>("PRAGMA table_info(alerts)").all();
    const colNames = new Set(alertCols.map((c) => c.name));
    if (!colNames.has("resolved_at")) {
      db.exec("ALTER TABLE alerts ADD COLUMN resolved_at TEXT");
    }
    if (!colNames.has("resolution_notes")) {
      db.exec("ALTER TABLE alerts ADD COLUMN resolution_notes TEXT");
    }
    if (!colNames.has("notified_telegram")) {
      db.exec("ALTER TABLE alerts ADD COLUMN notified_telegram INTEGER NOT NULL DEFAULT 0");
      db.exec("CREATE INDEX IF NOT EXISTS idx_alerts_notified ON alerts(notified_telegram)");
    }
  } catch { /* columns may already exist */ }

  // Conviction history (task 150)
  db.exec(`
    CREATE TABLE IF NOT EXISTS conviction_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol          TEXT NOT NULL,
      date            TEXT NOT NULL,
      peak_score      REAL NOT NULL,
      dominant_signal TEXT,
      created_at      TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conviction_history_symbol_date
      ON conviction_history(symbol, date);
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

  // ── Market Prices History (canonical — task 018) ──────────────────────────
  // Previously created lazily by hose.ts ensureHistoryTable(). Added here to
  // include it in the canonical schema so initDatabase() guarantees its existence.
  db.exec(`
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

  // exchange column migration (same pattern as hose.ts inline guard)
  try {
    db.exec("ALTER TABLE market_prices_history ADD COLUMN exchange TEXT DEFAULT 'HOSE'");
  } catch { /* column already exists — safe to ignore */ }

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

  // ── Task 137: Alert Telegram notification tracking ────────────────────────
  // ALTER TABLE is idempotent-safe via try/catch: SQLite throws if column
  // already exists; we swallow those errors and carry on.
  try {
    db.exec(`ALTER TABLE alerts ADD COLUMN notified_telegram INTEGER NOT NULL DEFAULT 0`);
  } catch (_) { /* column already exists — safe to ignore */ }

  // Index for fast lookup of unnotified HIGH/CRITICAL alerts
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alerts_notified
      ON alerts(notified_telegram, severity);
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

  // ── Migrations (try/catch so re-runs are safe) ─────────────────────────────

  // Task 153: add ssc_doc_id column for SSC scan deduplication.
  // ALTER TABLE is a no-op if the column already exists (caught and ignored).
  try {
    db.exec(
      `ALTER TABLE financial_reports ADD COLUMN ssc_doc_id TEXT`,
    );
  } catch (_) {
    // Column already exists — safe to ignore
  }

  // Task 153: partial index on ssc_doc_id for fast duplicate lookups.
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_fr_ssc_doc_id ON financial_reports(ssc_doc_id) WHERE ssc_doc_id IS NOT NULL`);
  } catch { /* partial index may fail on some SQLite builds */ }

  // ── Prediction Markets (task 163) ──────────────────────────────────────────
  // `prediction_markets` is an upsert target — one row per market, overwritten
  // each poll cycle via INSERT OR REPLACE.
  // `prediction_signals` is append-only — every detected signal is kept for
  // audit and for the `get_prediction_markets` MCP tool's signals_only filter.
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_markets (
      id               TEXT PRIMARY KEY,
      question         TEXT NOT NULL,
      end_date         TEXT NOT NULL,
      yes_price        REAL NOT NULL,
      no_price         REAL NOT NULL,
      volume_24h       REAL NOT NULL DEFAULT 0,
      volume_total     REAL NOT NULL DEFAULT 0,
      liquidity        REAL NOT NULL DEFAULT 0,
      last_trade_price REAL NOT NULL DEFAULT 0,
      unique_wallets   INTEGER NOT NULL DEFAULT 0,
      tags             TEXT NOT NULL DEFAULT '[]',
      fetched_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_signals (
      id              TEXT PRIMARY KEY,
      market_id       TEXT NOT NULL,
      signal_type     TEXT NOT NULL,
      severity        TEXT NOT NULL,
      yes_price_prev  REAL,
      yes_price_curr  REAL NOT NULL,
      volume_24h      REAL NOT NULL DEFAULT 0,
      unique_wallets  INTEGER NOT NULL DEFAULT 0,
      confidence      REAL NOT NULL,
      mapped_sectors  TEXT NOT NULL DEFAULT '[]',
      mapped_stocks   TEXT NOT NULL DEFAULT '[]',
      reasoning       TEXT NOT NULL,
      detected_at     TEXT NOT NULL,
      FOREIGN KEY (market_id) REFERENCES prediction_markets(id)
    )
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

  // ── Seed default watchlist from mcp.config.json (skip in tests) ────────────
  const currentDbPath = process.env["DB_PATH"] ?? Bun.env["DB_PATH"] ?? DEFAULT_DB_PATH;
  if (currentDbPath === ":memory:" || Bun.env["BUN_ENV"] === "test" || typeof Bun.env["BUN_TEST"] !== "undefined") return;
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

  // ── Custom Alert Rules (Task 219) ─────────────────────────────────────────
  ensureCustomAlertRulesTable(db);
}
