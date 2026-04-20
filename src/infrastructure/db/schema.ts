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
 *   - cron_job_runs         — scheduler job observability (Task 1100)
 *   - insider_transactions  — SSC insider disclosure rows (Task 1141)
 *   - market_messages       — persisted MARKET channel messages for quality review (Sprint 068)
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
  const dbPath = Bun.env["DB_PATH"] ?? DEFAULT_DB_PATH;

  // Ensure data directory exists — skip for the special `:memory:` path
  if (dbPath !== ":memory:") {
    const dir = dirname(dbPath);
    mkdirSync(dir, { recursive: true });
  }

  _db = new Database(dbPath);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA foreign_keys = ON");
  _db.exec("PRAGMA wal_autocheckpoint=4000");
  _db.exec("PRAGMA busy_timeout=5000");
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
export async function initDatabase(dbArg?: import("bun:sqlite").Database): Promise<void> {
  const db = dbArg ?? getDb();

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
      updated_at  TEXT,
      exchange    TEXT DEFAULT 'HOSE'
    );
  `);
  try { db.exec(`ALTER TABLE market_prices ADD COLUMN exchange TEXT DEFAULT 'HOSE'`); } catch {}

  // Sprint 053 / 1021: market_prices_history was created lazily elsewhere
  // (and by hand on prod). Several tests assume it exists right after
  // initDatabase() — canonicalise here so fresh DBs get it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_prices_history (
      code       TEXT NOT NULL,
      price      REAL NOT NULL,
      volume     REAL NOT NULL,
      fetched_at TEXT NOT NULL,
      exchange   TEXT DEFAULT 'HOSE',
      PRIMARY KEY (code, fetched_at)
    );
    CREATE INDEX IF NOT EXISTS idx_mph_code_fetched
      ON market_prices_history(code, fetched_at DESC);
  `);

  // ── Daily OHLCV — 2+ year price history for volatility analysis ────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      open       REAL    NOT NULL DEFAULT 0,
      high       REAL    NOT NULL DEFAULT 0,
      low        REAL    NOT NULL DEFAULT 0,
      close      REAL    NOT NULL,
      volume     REAL    NOT NULL DEFAULT 0,
      updated_at TEXT    NOT NULL DEFAULT '',
      PRIMARY KEY (code, date)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_code_date
      ON daily_ohlcv(code, date DESC);
  `);

  // ── Alerts ─────────────────────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,   -- info | warning | critical | high
      signals_json          TEXT,            -- JSON string[]
      affected_actions_json TEXT,            -- JSON {code, expectedImpact, confidence}[]
      analysis_ids_json     TEXT,            -- JSON string[]
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT,
      notified_telegram     INTEGER NOT NULL DEFAULT 0,   -- 0=pending, 1=sent (task 137)
      resolved_at           TEXT,                          -- ISO 8601 when auto-resolved or acknowledged
      resolution_notes      TEXT                           -- free-form resolution memo
    );

    CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_read      ON alerts(read);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity  ON alerts(severity);
    CREATE INDEX IF NOT EXISTS idx_alerts_notified  ON alerts(notified_telegram, severity);
  `);

  // Idempotent migration for existing DB files created before task 137 /
  // sprint 053 fix: the three columns above were only present as a legacy
  // hand-applied ALTER on prod. A fresh test DB missed them entirely and
  // broke the 137-fix-alert-pipeline schema test. Adding them as optional
  // ALTERs here means both fresh and legacy databases converge to the same
  // shape.
  for (const [col, ddl] of [
    ["notified_telegram", "INTEGER NOT NULL DEFAULT 0"],
    ["resolved_at",       "TEXT"],
    ["resolution_notes",  "TEXT"],
  ] as const) {
    try {
      db.exec(`ALTER TABLE alerts ADD COLUMN ${col} ${ddl}`);
    } catch {
      // Column already exists — CREATE TABLE branch above handled it on a
      // fresh DB, or a previous run already applied the ALTER. Either way,
      // no-op.
    }
  }

  // Task 1110 — sent_by column: identifies whether the alert was inserted by
  // the server scheduler ('server') or by the Alert Commander Cowork agent
  // ('alert-commander'). Existing rows receive 'server' as the column default.
  try {
    db.exec(`ALTER TABLE alerts ADD COLUMN sent_by TEXT NOT NULL DEFAULT 'server'`);
  } catch {
    // Column already exists on fresh DBs (CREATE TABLE DDL) or a previous
    // migration run. No-op.
  }

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

  // ── Agent Signal Outcome Columns (Task 244) — idempotent ALTER ────────────
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN outcome TEXT`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN outcome_at TEXT`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN outcome_detail TEXT`); } catch {}

  // ── Mention Velocity (Task 265) ───────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS mention_velocity (
      code           TEXT    NOT NULL,
      hour           TEXT    NOT NULL,
      mention_count  INTEGER NOT NULL DEFAULT 0,
      negative_count INTEGER NOT NULL DEFAULT 0,
      source_count   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (code, hour)
    );

    CREATE INDEX IF NOT EXISTS idx_mv_code ON mention_velocity(code);
    CREATE INDEX IF NOT EXISTS idx_mv_hour ON mention_velocity(hour);
  `);

  // ── Reputation Scores (Task 265) ───────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS reputation_scores (
      code        TEXT NOT NULL,
      date        TEXT NOT NULL,
      score       REAL NOT NULL,
      trend       TEXT NOT NULL DEFAULT 'stable',
      risk_level  TEXT NOT NULL DEFAULT 'safe',
      computed_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );

    CREATE INDEX IF NOT EXISTS idx_rep_code ON reputation_scores(code);
    CREATE INDEX IF NOT EXISTS idx_rep_date ON reputation_scores(date);
  `);

  // ── Broker Sanctions (Task 915) ────────────────────────────────────────────
  // SSC sanctions against securities brokers. Used by
  // `forecastConfidenceScore` to discount bullish forecasts from sanctioned
  // brokers before they reach the cascade engine.
  db.exec(`
    CREATE TABLE IF NOT EXISTS broker_sanctions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      broker_name    TEXT NOT NULL,
      sanction_start TEXT NOT NULL,
      sanction_end   TEXT,
      severity       TEXT NOT NULL CHECK (severity IN ('warning','suspension')),
      source         TEXT,
      created_at     TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_broker_sanctions_name ON broker_sanctions(broker_name);
    CREATE INDEX IF NOT EXISTS idx_broker_sanctions_start ON broker_sanctions(sanction_start);
  `);

  // ── Financial Reports (BCTC) ───────────────────────────────────────────────
  // DDL imported from bctc-schema.ts — includes financial_reports table,
  // all scalar columns, JSON blobs, indexes, v_chart_timeseries and
  // v_yoy_comparison views.
  db.exec(SQLITE_DDL);

  // ── Migration: add validation_status/validation_notes if missing ───────────
  // Production DBs created before task 132 lack these columns because
  // CREATE TABLE IF NOT EXISTS never re-evaluates a pre-existing table. Probe
  // table_info and ALTER on demand so parseBctcReport can persist reports.
  try {
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(financial_reports)")
      .all();
    const colNames = new Set(cols.map((c) => c.name));
    if (!colNames.has("validation_status")) {
      db.exec(
        "ALTER TABLE financial_reports ADD COLUMN validation_status TEXT DEFAULT 'pending'",
      );
    }
    if (!colNames.has("validation_notes")) {
      db.exec("ALTER TABLE financial_reports ADD COLUMN validation_notes TEXT");
    }
  } catch {
    // If financial_reports doesn't exist yet (very fresh DB), the CREATE
    // TABLE above already added the columns — nothing to migrate.
  }

  // ── Macro Indicators (Task 024 / Task 1495) ────────────────────────────────
  // Stores macro economic data fetched from Trading Economics.
  // UNIQUE(country) enforces upsert semantics via INSERT OR REPLACE.
  db.exec(`
    CREATE TABLE IF NOT EXISTS macro_indicators (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      country             TEXT NOT NULL,
      cpi                 REAL,
      gdp_growth          REAL,
      interest_rate       REAL,
      unemployment_rate   REAL,
      inflation_rate      REAL,
      trade_balance       REAL,
      current_account     REAL,
      government_debt     REAL,
      budget_deficit      REAL,
      manufacturing_pmi   REAL,
      consumer_confidence REAL,
      retail_sales        REAL,
      fetched_at          TEXT NOT NULL,
      UNIQUE(country)
    );
  `);
  // Task 1495: idempotent migration for existing production DBs (adds +9 cols)
  for (const col of [
    "unemployment_rate", "inflation_rate", "trade_balance", "current_account",
    "government_debt", "budget_deficit", "manufacturing_pmi", "consumer_confidence",
    "retail_sales",
  ]) {
    try { db.exec(`ALTER TABLE macro_indicators ADD COLUMN ${col} REAL`); } catch {}
  }

  // ── Commodity Prices (tasks 025, 028) ─────────────────────────────────────
  // `commodity_prices` — latest snapshot per source (upsert via INSERT OR REPLACE).
  // `commodity_prices_history` — append-only time series for σ-based macro thresholds.
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices (
      source            TEXT PRIMARY KEY,
      brent_crude_usd   REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz   REAL NOT NULL DEFAULT 0,
      usd_vnd_rate      REAL NOT NULL DEFAULT 0,
      vix               REAL NOT NULL DEFAULT 0,
      sp500             REAL NOT NULL DEFAULT 0,
      shanghai_comp     REAL NOT NULL DEFAULT 0,
      hang_seng         REAL NOT NULL DEFAULT 0,
      dxy               REAL NOT NULL DEFAULT 0,
      cny_vnd_rate      REAL NOT NULL DEFAULT 0,
      copper_usd        REAL NOT NULL DEFAULT 0,
      silver_usd_per_oz REAL NOT NULL DEFAULT 0,
      jpy_vnd_rate      REAL NOT NULL DEFAULT 0,
      fetched_at        TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices_history (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      source            TEXT NOT NULL,
      brent_crude_usd   REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz   REAL NOT NULL DEFAULT 0,
      usd_vnd_rate      REAL NOT NULL DEFAULT 0,
      vix               REAL NOT NULL DEFAULT 0,
      sp500             REAL NOT NULL DEFAULT 0,
      shanghai_comp     REAL NOT NULL DEFAULT 0,
      hang_seng         REAL NOT NULL DEFAULT 0,
      dxy               REAL NOT NULL DEFAULT 0,
      cny_vnd_rate      REAL NOT NULL DEFAULT 0,
      copper_usd        REAL NOT NULL DEFAULT 0,
      silver_usd_per_oz REAL NOT NULL DEFAULT 0,
      jpy_vnd_rate      REAL NOT NULL DEFAULT 0,
      fetched_at        TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cph_source_fetched ON commodity_prices_history(source, fetched_at DESC)`);

  // FR-6: idempotent migration for existing production DBs that were created
  // before sprint 188. `CREATE TABLE IF NOT EXISTS` above covers new DBs.
  // These ALTERs are no-ops if the column already exists (SQLite ignores "duplicate column").
  const commodity9Cols = [
    "vix", "sp500", "shanghai_comp", "hang_seng", "dxy",
    "cny_vnd_rate", "copper_usd", "silver_usd_per_oz", "jpy_vnd_rate",
  ];
  for (const col of commodity9Cols) {
    try { db.exec(`ALTER TABLE commodity_prices ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE commodity_prices_history ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`); } catch {}
  }

  // ── SBV Rates (task 028, extended task 1497) ─────────────────────────────
  // `sbv_rates` — latest snapshot per source (upsert via INSERT OR REPLACE).
  // `sbv_rates_history` — append-only time series for macro σ analysis.
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbv_rates (
      source                  TEXT PRIMARY KEY,
      overnight_rate_pct      REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct    REAL NOT NULL DEFAULT 0,
      usd_vnd_official        REAL NOT NULL DEFAULT 0,
      discount_rate_pct       REAL NOT NULL DEFAULT 0,
      max_deposit_rate_pct    REAL NOT NULL DEFAULT 0,
      max_lending_rate_pct    REAL NOT NULL DEFAULT 0,
      interbank_overnight_pct REAL NOT NULL DEFAULT 0,
      fetched_at              TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbv_rates_history (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      source                  TEXT NOT NULL,
      overnight_rate_pct      REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct    REAL NOT NULL DEFAULT 0,
      usd_vnd_official        REAL NOT NULL DEFAULT 0,
      discount_rate_pct       REAL NOT NULL DEFAULT 0,
      max_deposit_rate_pct    REAL NOT NULL DEFAULT 0,
      max_lending_rate_pct    REAL NOT NULL DEFAULT 0,
      interbank_overnight_pct REAL NOT NULL DEFAULT 0,
      fetched_at              TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_srh_source_fetched ON sbv_rates_history(source, fetched_at DESC)`);
  // Task 1497 — idempotent migration for existing production DBs
  for (const col of ["discount_rate_pct", "max_deposit_rate_pct", "max_lending_rate_pct", "interbank_overnight_pct"]) {
    try { db.exec(`ALTER TABLE sbv_rates ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE sbv_rates_history ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`); } catch {}
  }

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

  // ── Prediction Signal Outcome Columns (Task 248) — idempotent ALTER ───────
  try { db.exec(`ALTER TABLE prediction_signals ADD COLUMN outcome TEXT`); } catch {}
  try { db.exec(`ALTER TABLE prediction_signals ADD COLUMN outcome_price_change REAL`); } catch {}

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
  // Sprint 053 / backlog 1021: the previous version used `return` to skip the
  // seed block in test mode. That also skipped EVERY table defined after this
  // point (alert_mutes, telegram_reports, system_changelog, user_requests,
  // pdf_extracted_text, daily_ohlcv, market_summaries, …), which caused ~10
  // of the 20 pre-existing per-file flakes. Now we only guard the seed logic
  // itself and continue creating schema after.
  const currentDbPath = Bun.env["DB_PATH"] ?? DEFAULT_DB_PATH;
  const isTestEnv =
    currentDbPath === ":memory:" ||
    Bun.env["BUN_ENV"] === "test" ||
    typeof Bun.env["BUN_TEST"] !== "undefined";
  if (!isTestEnv) {
    try {
      const { mcpConfig } = await import("../config.js");
      const defaultStocks = mcpConfig.market.watchlist;
      if (defaultStocks.length > 0) {
        const existing = db.query("SELECT COUNT(*) as c FROM watchlist").get() as { c: number };
        if (existing.c === 0) {
          // Sprint 053 — single source of truth for ticker → { domain, exchange }:
          // derive from SECTOR_PEERS via getStockProfile() instead of a
          // hand-maintained domainMap. Adding a new ticker now only requires
          // updating SECTOR_PEERS in domain/services/sectorPeers.ts.
          const { getStockProfile } = await import("../../domain/services/sectorPeers.js");
          const ins = db.prepare(
            "INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at, alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new) VALUES (?, ?, ?, datetime('now'), -3, 5, 7, 1)"
          );
          for (const code of defaultStocks) {
            const profile = getStockProfile(code);
            ins.run(
              code,
              profile?.exchange ?? "HOSE",
              profile?.domain ?? "other",
            );
          }
        }
      }
    } catch { /* config not available — skip seeding */ }
  }

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

  // ── User Requests (Task 238) ──────────────────────────────────────────────
  // Async question queue: /ask and /why Telegram commands insert pending rows.
  // Intelligence cycle step F processes them and sends answers back via Telegram.
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_requests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      command     TEXT NOT NULL,
      payload     TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      response    TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      answered_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(status)`);

  // ── Cron Job Runs (Task 1100) ─────────────────────────────────────────────
  // Observability table: one row per scheduler job invocation.
  // Row lifecycle: insert on start (status='running') → update on end (status='success'|'error').
  // Purge policy: rows older than 30 days deleted by cronHealthAlertJob.
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT NOT NULL,
      started_at   TEXT NOT NULL,
      finished_at  TEXT,
      status       TEXT NOT NULL CHECK(status IN ('running','success','error')),
      rows_written  INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_started
      ON cron_job_runs(job_name, started_at DESC)
  `);

  // ── Ask Queue (Task 1072) ─────────────────────────────────────────────────
  // Dedicated FIFO question queue for the /ask Telegram command.
  // Separate from user_requests — different schema and purpose.
  // See TECH_054 section 4.2 for rationale.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ask_queue (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                TEXT    NOT NULL DEFAULT 'default',
      message                TEXT    NOT NULL,
      received_at            TEXT    NOT NULL DEFAULT (datetime('now')),
      status                 TEXT    NOT NULL DEFAULT 'pending',
      answered_at            TEXT,
      answer_text            TEXT,
      processing_started_at  TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ask_queue_status   ON ask_queue(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ask_queue_received ON ask_queue(received_at)`);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_ask_queue_proc_started ON ask_queue(processing_started_at)
       WHERE status = 'processing'`,
  );

  // ── Agent Feedback (Task 1022 / canonical — was inline in telegramCommands + dataAuditJob) ──
  // Problem reports submitted via /report and /fix Telegram commands; also written
  // by analysis agents via submit_feedback; read by dev-team-cron for triage.
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_feedback (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      agent             TEXT NOT NULL,
      category          TEXT NOT NULL,
      title             TEXT NOT NULL,
      detail            TEXT NOT NULL DEFAULT '',
      priority          TEXT NOT NULL DEFAULT 'medium',
      status            TEXT NOT NULL DEFAULT 'new',
      created_at        TEXT NOT NULL,
      reparse_attempts  INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feedback_status ON agent_feedback(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_feedback_agent  ON agent_feedback(agent)`);
  // Idempotent migration for legacy DBs created before reparse_attempts column
  try { db.exec(`ALTER TABLE agent_feedback ADD COLUMN reparse_attempts INTEGER NOT NULL DEFAULT 0`); } catch {}

  // ── Enrichment Chain Columns — idempotent ALTER for existing agent_signals ──
  // These try-catch blocks are safe to run repeatedly — SQLite raises an error
  // if the column already exists (which we silently ignore).
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN cycle_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN finding_data TEXT DEFAULT '{}'`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN causal_ref INTEGER`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN chain_depth INTEGER DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN processed INTEGER DEFAULT 0`); } catch {}

  // ── Task 1105: Causal Root Columns — idempotent ALTER for existing agent_signals ──
  // Allows Alert Commander to group signals that share a common macro root cause
  // (e.g. all signals triggered by the same Fed rate decision or tariff event).
  // NULL = standalone signal (backward compatible with pre-1105 rows).
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN causal_root_id TEXT`); } catch {}
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN causal_root_label TEXT`); } catch {}

  // ── Task 1106: Signal Class Column — idempotent ALTER for existing agent_signals ──
  // Enables Fix B (REQ_056): chain synthesizer applies class-based weight multipliers
  // before averaging conviction scores. Valid values:
  //   'structural_factor' | 'cyclical' | 'technical_signal' | 'one_time_catalyst' | 'sentiment'
  // NULL = unclassified (backward compatible with pre-1106 rows, treated as weight 1.0).
  try { db.exec(`ALTER TABLE agent_signals ADD COLUMN signal_class TEXT`); } catch {}

  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_signals_cycle ON agent_signals(cycle_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_signals_chain ON agent_signals(causal_ref)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_agent_signals_stock ON agent_signals(stock_code, created_at)`);

  // ── System logs (created-lazily elsewhere, canonical here for tests) ─────
  // Sprint 053 / 1021: several modules create this lazily (dataAuditJob,
  // persistLog helper). Tests running against a fresh :memory: DB need it
  // present after initDatabase() so the tests for persistLog / data audit
  // do not need to duplicate the DDL.
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
    CREATE INDEX IF NOT EXISTS idx_system_logs_ts       ON system_logs(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_system_logs_level    ON system_logs(level);
    CREATE INDEX IF NOT EXISTS idx_system_logs_resolved ON system_logs(resolved);
  `);

  // ── Tracked indicators (created lazily by commodityTracker, canonical here) ─
  // Task 1489: hour_bucket column + UNIQUE(indicator, source, hour_bucket) ON CONFLICT REPLACE
  // ensures at most one row per indicator+source per clock-hour (dedup).
  // hour_bucket is populated by an AFTER INSERT trigger so callers need not set it.
  // ON CONFLICT REPLACE: when the trigger's UPDATE causes a unique clash, the old row
  // is silently replaced — net effect is one row per (indicator, source, UTC-hour).
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_indicators (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator    TEXT NOT NULL,
      value        REAL NOT NULL,
      unit         TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT '',
      extracted_at TEXT NOT NULL,
      hour_bucket  TEXT,
      UNIQUE(indicator, source, hour_bucket) ON CONFLICT REPLACE
    );
    CREATE INDEX IF NOT EXISTS idx_tracked_ind_name_time
      ON tracked_indicators(indicator, extracted_at DESC);
    CREATE TRIGGER IF NOT EXISTS trg_tracked_ind_hour_bucket
      AFTER INSERT ON tracked_indicators
      BEGIN
        UPDATE tracked_indicators
          SET hour_bucket = strftime('%Y-%m-%dT%H:00:00', NEW.extracted_at)
          WHERE id = NEW.id AND hour_bucket IS NULL;
      END;
  `);
  // Task 1489: one-time purge of test-contamination rows.
  // source='test' rows are inserted by integration tests that leak into non-memory DBs.
  db.exec(`DELETE FROM tracked_indicators WHERE source = 'test'`);
  // Task 1490: purge known system_logs test-contamination rows (message-exact match).
  db.exec(`DELETE FROM system_logs WHERE message IN ('only this appears', 'error message')`);


  // ── Mention velocity: canonical DDL lives above (Task 265, ~line 271).
  // Duplicate block removed Task 1033 — keep a single source of truth so
  // future column changes only need to be made in one place.

  // ── Market summaries (periodic briefings — Sprint 034 / task 130) ─────────
  // No module owns the DDL — prod DB was created by-hand. Canonicalising here
  // so fresh test DBs pick it up via initDatabase().
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_summaries (
      id                     TEXT PRIMARY KEY,
      period_type            TEXT NOT NULL,
      period_start           TEXT NOT NULL,
      period_end             TEXT NOT NULL,
      created_at             TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at             TEXT NOT NULL DEFAULT (datetime('now')),
      summary_text           TEXT NOT NULL,
      key_events_json        TEXT,
      stock_performance_json TEXT,
      alerts_summary_json    TEXT,
      macro_context_json     TEXT,
      recommendation_json    TEXT,
      news_count             INTEGER DEFAULT 0,
      alert_count            INTEGER DEFAULT 0,
      report_count           INTEGER DEFAULT 0,
      data_sources_json      TEXT,
      UNIQUE(period_type, period_start)
    );
    CREATE INDEX IF NOT EXISTS idx_ms_period  ON market_summaries(period_type, period_start);
    CREATE INDEX IF NOT EXISTS idx_ms_created ON market_summaries(created_at);
  `);

  // ── PDF OCR Cache (Sprint 048 / Task 292) ──────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS pdf_extracted_text (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      filename     TEXT    NOT NULL,
      page_number  INTEGER NOT NULL,
      text_content TEXT    NOT NULL DEFAULT '',
      confidence   REAL    NOT NULL DEFAULT 0,
      extracted_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(filename, page_number)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pet_filename ON pdf_extracted_text(filename, page_number)`);

  // Task 1002 — action_code column for ticker attribution on cached OCR text
  try {
    db.exec(`ALTER TABLE pdf_extracted_text ADD COLUMN action_code TEXT NOT NULL DEFAULT ''`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pet_action_code ON pdf_extracted_text(action_code)`);
  } catch {
    // Column already exists — safe to ignore
  }

  // ── VPS push log (observability for all VPS proxy services) ──────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS vps_push_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      service      TEXT    NOT NULL,
      items_count  INTEGER NOT NULL DEFAULT 0,
      status       TEXT    NOT NULL DEFAULT 'ok',
      error_msg    TEXT,
      duration_ms  INTEGER,
      pushed_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vpl_service_ts ON vps_push_log(service, pushed_at)`);

  // ── Insider Transactions (Task 1141 / Sprint 063) ─────────────────────────
  // Migration: drop legacy insider_transactions if it uses the old schema (missing from_date).
  // The old table had columns: volume, transaction_date, disclosure_date, created_at.
  // The new schema uses: from_date, to_date, fetched_at, registered_volume, executed_volume.
  // Zero production rows — safe to recreate.
  {
    const cols: { name: string }[] = db.query("PRAGMA table_info(insider_transactions)").all() as { name: string }[];
    const hasFromDate = cols.some(c => c.name === "from_date");
    if (cols.length > 0 && !hasFromDate) {
      db.exec("DROP TABLE IF EXISTS insider_transactions");
    }
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS insider_transactions (
      id                  TEXT PRIMARY KEY,
      code                TEXT NOT NULL,
      insider_name        TEXT NOT NULL,
      position            TEXT NOT NULL,
      type                TEXT NOT NULL CHECK(type IN ('buy','sell','other')),
      registered_volume   INTEGER NOT NULL DEFAULT 0,
      executed_volume     INTEGER NOT NULL DEFAULT 0,
      price               REAL NOT NULL DEFAULT 0,
      from_date           TEXT NOT NULL,
      to_date             TEXT NOT NULL,
      fetched_at          TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_it_code_from_date
      ON insider_transactions(code, from_date DESC);
    CREATE INDEX IF NOT EXISTS idx_it_type_from_date
      ON insider_transactions(type, from_date DESC);
  `);

  // ── Task 1112: BCTC VPS proxy queue ──────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code     TEXT    NOT NULL,
      period_year     INTEGER NOT NULL,
      period_quarter  TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending',
      source_url      TEXT,
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_attempt    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bvq_status ON bctc_vps_queue(status)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bvq_code   ON bctc_vps_queue(action_code)`);

  // ── Kinh Dich tables (Task 1047) ──────────────────────────────────────────
  // Previously created via initHexagramTables() called lazily from kinhDichTools.ts
  // and intelligenceCycleJob.ts. Moved here so fresh DBs have both tables on startup.
  // Note: kinhdich_readings.source column (B2 migration) is included in the canonical
  // DDL — no ALTER TABLE needed for fresh installs. Production DBs already have it.
  db.exec(`
    CREATE TABLE IF NOT EXISTS kinhdich_readings (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code       TEXT NOT NULL,
      timestamp        TEXT NOT NULL DEFAULT (datetime('now')),
      hexagram_number  INTEGER NOT NULL,
      ho_que_number    INTEGER NOT NULL,
      bien_que_number  INTEGER NOT NULL,
      hao_states       TEXT NOT NULL,
      raw_scores       TEXT NOT NULL,
      ngu_hanh_dynamic TEXT,
      trading_signal   TEXT,
      confidence       REAL,
      action_note      TEXT,
      source           TEXT DEFAULT 'manual'
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_kd_readings_code_ts ON kinhdich_readings(stock_code, timestamp)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS hexagram_transitions (
      from_hexagram         INTEGER NOT NULL,
      to_hexagram           INTEGER NOT NULL,
      stock_code            TEXT NOT NULL,
      count                 INTEGER DEFAULT 1,
      total_price_change_5d REAL DEFAULT 0,
      win_count             INTEGER DEFAULT 0,
      last_seen             TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (from_hexagram, to_hexagram, stock_code)
    )
  `);

  // ── Bond maturity calendar (Task 1045) ───────────────────────────────────
  // Previously created via ensureBondMaturityTable() called from bondMaturityTools.ts.
  // Moved here so fresh DBs have the table before any tool handler runs.
  db.exec(`
    CREATE TABLE IF NOT EXISTS bond_maturity (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      issuer           TEXT NOT NULL,
      issuer_code      TEXT NOT NULL UNIQUE,
      amount_billion   REAL NOT NULL,
      maturity_date    TEXT NOT NULL,
      coupon_rate      REAL,
      status           TEXT NOT NULL DEFAULT 'upcoming',
      created_at       TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bond_maturity_date ON bond_maturity(maturity_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_bond_maturity_code ON bond_maturity(issuer_code)`);

  // ── Pharma events (Task 1046) ─────────────────────────────────────────────
  // Previously created via initPharmaStore() called from pharmaTools.ts + davPharmacyJob.ts.
  // Moved here so fresh DBs have the table on startup.
  db.exec(`
    CREATE TABLE IF NOT EXISTS pharma_events (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type    TEXT NOT NULL,
      drug_name     TEXT,
      manufacturer  TEXT,
      stock_code    TEXT,
      approval_date TEXT,
      description   TEXT NOT NULL,
      severity      TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pharma_code ON pharma_events(stock_code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pharma_date ON pharma_events(created_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pharma_type ON pharma_events(event_type)`);

  // ── Trade exposures (Task 1043) ───────────────────────────────────────────
  // Previously created lazily via _tableCreated guard in tradeStore.ts:ensureTable().
  // Moved here so fresh DBs have the table before any tradeStore function is called.
  db.exec(`
    CREATE TABLE IF NOT EXISTS trade_exposures (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL,
      market       TEXT NOT NULL,
      revenue_pct  REAL NOT NULL DEFAULT 0,
      type         TEXT NOT NULL DEFAULT 'export',
      products     TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT 'seed',
      updated_at   TEXT NOT NULL,
      UNIQUE(code, market)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trade_code   ON trade_exposures(code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_trade_market ON trade_exposures(market)`);

  // ── Cascade rule hits (Task 1044) ─────────────────────────────────────────
  // Previously created via ensureCascadeHitsTable() called lazily from runImpactChain.ts.
  // Moved here so the table is always present after initDatabase().
  db.exec(`
    CREATE TABLE IF NOT EXISTS cascade_rule_hits (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_key         TEXT NOT NULL,
      matched_text     TEXT NOT NULL DEFAULT '',
      affected_sector  TEXT,
      affected_stocks  TEXT,
      hit_at           TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cascade_hits_rule ON cascade_rule_hits(rule_key)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cascade_hits_at   ON cascade_rule_hits(hit_at)`);

  // Sprint 191 — outcome tracking columns (idempotent: try/catch per column)
  for (const sql of [
    `ALTER TABLE cascade_rule_hits ADD COLUMN source_rag_id   TEXT`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN price_impact_3d REAL`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN price_impact_7d REAL`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN outcome_correct INTEGER`,
    `ALTER TABLE cascade_rule_hits ADD COLUMN confidence      REAL`,
  ]) {
    try { db.exec(sql); } catch { /* column already exists — safe */ }
  }

  // ── Audit state: singleton row for dataAuditJob (Task 1041) ─────────────
  // Previously created inline in src/scheduler/dataAuditJob.ts:ensureAuditDependencies().
  // Moved here so fresh test DBs and new deployments get the table from initDatabase().
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_state (
      id                    INTEGER PRIMARY KEY CHECK (id = 1),
      last_daily_audit_at   TEXT,
      last_weekly_audit_at  TEXT,
      last_daily_findings   TEXT,
      last_weekly_findings  TEXT
    )
  `);

  // ── Briefing log: dedup guard for morningBriefingJob (Task 1040) ─────────
  // Previously created inline in src/scheduler/morningBriefingJob.ts.
  // Moved here so fresh test DBs and new deployments get the table from initDatabase().
  db.exec(`
    CREATE TABLE IF NOT EXISTS briefing_log (
      date    TEXT PRIMARY KEY,
      sent_at TEXT NOT NULL
    )
  `);

  // ── Daily OHLCV (2+ year retention for volatility analysis) ────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      open       REAL    NOT NULL DEFAULT 0,
      high       REAL    NOT NULL DEFAULT 0,
      low        REAL    NOT NULL DEFAULT 0,
      close      REAL    NOT NULL,
      volume           REAL    NOT NULL DEFAULT 0,
      updated_at       TEXT    NOT NULL DEFAULT '',
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_code_date ON daily_ohlcv(code, date DESC)`);

  // ── vnstock tables: financials, trading stats, events, officers, ──────────
  // shareholders, fetch log, balance sheet, cash flow (Task 1042)
  // Previously created lazily by initVnstockTables() in vnstockStore.ts.
  // Moved here so fresh DBs and test DBs get all tables from initDatabase().
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_financials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      year_report INTEGER NOT NULL,
      quarter INTEGER NOT NULL,
      revenue_bn REAL,
      revenue_yoy REAL,
      net_profit_bn REAL,
      net_profit_yoy REAL,
      eps INTEGER,
      pe REAL,
      pb REAL,
      roe REAL,
      roa REAL,
      debt_to_equity REAL,
      net_profit_margin REAL,
      nim REAL,
      npl REAL,
      source TEXT NOT NULL DEFAULT 'vnstock',
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, year_report, quarter, source)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnfin_code ON vnstock_financials(code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnfin_period ON vnstock_financials(year_report, quarter)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '1970-01-01',
      foreign_room INTEGER,
      foreign_volume INTEGER,
      current_holding_ratio REAL,
      max_holding_ratio REAL,
      avg_volume_2w INTEGER,
      high_52w REAL,
      low_52w REAL,
      pct_from_high_52w REAL,
      pct_from_low_52w REAL,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnstats_code_date ON vnstock_trading_stats(code, date)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      event_name TEXT NOT NULL,
      event_date TEXT NOT NULL,
      event_type TEXT NOT NULL,
      description TEXT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, event_name, event_date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnevents_code ON vnstock_events(code)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnevents_date ON vnstock_events(event_date)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_officers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      own_percent REAL,
      quantity INTEGER,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, name)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnofficers_code ON vnstock_officers(code)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_shareholders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER,
      own_percent REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, name)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnshareholders_code ON vnstock_shareholders(code)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_fetch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      data_type TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, data_type)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_balance_sheet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      year_report INTEGER NOT NULL,
      quarter INTEGER NOT NULL,
      total_assets_bn REAL,
      total_liabilities_bn REAL,
      total_equity_bn REAL,
      cash_bn REAL,
      short_term_debt_bn REAL,
      long_term_debt_bn REAL,
      receivables_bn REAL,
      inventory_bn REAL,
      source TEXT NOT NULL DEFAULT 'vnstock',
      fetched_at TEXT NOT NULL,
      UNIQUE(code, year_report, quarter, source)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vnbs_code ON vnstock_balance_sheet(code)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_cash_flow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      year_report INTEGER NOT NULL,
      quarter INTEGER NOT NULL,
      operating_cf_bn REAL,
      investing_cf_bn REAL,
      financing_cf_bn REAL,
      net_cf_bn REAL,
      source TEXT NOT NULL DEFAULT 'vnstock',
      fetched_at TEXT NOT NULL,
      UNIQUE(code, year_report, quarter, source)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_vncf_code ON vnstock_cash_flow(code)`);

  // ── Agent Work Log (Task 1108) ─────────────────────────────────────────────
  // Records agent session lifecycle: start time, end time, summary, findings,
  // and actions taken. Used by the Dev Team cron to audit agent activity and
  // surface patterns (e.g., repeated errors, slow cycles).
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_work_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name   TEXT NOT NULL,
      session_id   TEXT,
      started_at   TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at  TEXT,
      summary      TEXT,
      findings     TEXT,
      actions_json TEXT,
      status       TEXT NOT NULL DEFAULT 'running'
                   CHECK(status IN ('running','completed','error'))
    )
  `);
  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_agent_work_log_agent_started ON agent_work_log(agent_name, started_at DESC)`,
  );

  // ── Evidence Fragments + Evidence Scores (Task 1116, Sprint 057 Phase A) ──────
  // Prediction Engine Phase A: accumulate directional evidence per stock from
  // analysis agents. evidenceAccumulatorJob aggregates into evidence_scores nightly.
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_fragments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      stock          TEXT NOT NULL,
      evidence_type  TEXT NOT NULL,
      direction      TEXT NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      magnitude      REAL NOT NULL CHECK(magnitude BETWEEN 0.0 AND 1.0),
      confidence     REAL NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
      timestamp      TEXT NOT NULL,
      source_agent   TEXT NOT NULL,
      ttl_days       INTEGER NOT NULL DEFAULT 30,
      expires_at     TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ef_stock_ts ON evidence_fragments(stock, timestamp DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ef_expires  ON evidence_fragments(expires_at)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_scores (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      stock          TEXT NOT NULL,
      score_date     TEXT NOT NULL,
      bullish_score  REAL NOT NULL DEFAULT 0.0,
      bearish_score  REAL NOT NULL DEFAULT 0.0,
      neutral_score  REAL NOT NULL DEFAULT 0.0,
      fragment_count INTEGER NOT NULL DEFAULT 0,
      computed_at    TEXT NOT NULL,
      UNIQUE(stock, score_date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_es_stock ON evidence_scores(stock, score_date DESC)`);

  // ── Evidence Likelihood Ratios (Task 1121, Sprint 059 Phase B) ───────────────
  // Per-(evidence_type, direction, horizon_days) likelihood ratios computed by
  // baseRateComputationJob (weekly). UNIQUE constraint allows idempotent upserts.
  // Business rule: likelihood_ratio = 1.0 for rows with sample_size < 10.
  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence_likelihood_ratios (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      evidence_type    TEXT NOT NULL,
      direction        TEXT NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      horizon_days     INTEGER NOT NULL CHECK(horizon_days IN (5, 10, 20)),
      likelihood_ratio REAL NOT NULL DEFAULT 1.0,
      sample_size      INTEGER NOT NULL DEFAULT 0,
      last_updated     TEXT NOT NULL,
      UNIQUE(evidence_type, direction, horizon_days)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_elr_type_dir ON evidence_likelihood_ratios(evidence_type, direction)`);

  // ── Prediction Claims (Task 1123, Sprint 059) ─────────────────────────────
  // Stores agent-generated price/direction claims for forward accountability.
  // resolution_outcome: NULL=pending, 1=correct, 0=incorrect.
  // brier_score: (outcome - confidence)^2 — computed at resolution time.
  // UNIQUE(stock, claim_text, resolution_date) enforces INSERT OR IGNORE dedup.
  // Note: CHECK(resolution_outcome IN (NULL, 0, 1)) is intentional — SQLite
  // evaluates NULL IN (...) as NULL which does NOT violate the constraint.
  db.exec(`
    CREATE TABLE IF NOT EXISTS prediction_claims (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      stock              TEXT    NOT NULL,
      agent_id           TEXT    NOT NULL,
      claim_text         TEXT    NOT NULL,
      direction          TEXT    NOT NULL CHECK(direction IN ('bullish','bearish','neutral')),
      target_price       REAL,
      resolution_date    TEXT    NOT NULL,
      confidence         REAL    NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
      resolution_outcome INTEGER CHECK(resolution_outcome IN (NULL, 0, 1)),
      actual_price       REAL,
      brier_score        REAL,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
      resolved_at        TEXT,
      UNIQUE(stock, claim_text, resolution_date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pc_stock         ON prediction_claims(stock)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pc_agent         ON prediction_claims(agent_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pc_resolution    ON prediction_claims(resolution_date)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pc_outcome       ON prediction_claims(resolution_outcome)`);

  // Sprint 065 / Task 1150: creation_price column — nullable for legacy rows
  try {
    db.exec(`ALTER TABLE prediction_claims ADD COLUMN creation_price REAL`);
  } catch {
    // Column already exists — safe to ignore
  }

  // ── Calibration Snapshots (Task 1127, Sprint 060 Phase D) ─────────────────
  // Materialised weekly calibration statistics over resolved prediction_claims.
  // Written by calibrationReportJob every Sunday 13:00 UTC (20:00 VN).
  // Re-runs on the same Sunday produce a second row — the query layer always
  // uses ORDER BY id DESC LIMIT 1 so no UNIQUE constraint on snapshot_date.
  // JSON columns: avg_brier_by_agent, avg_brier_by_stock, avg_brier_by_direction,
  //               calibration_curve, top_predictions, worst_predictions.
  // avg_brier_score is NULL when total_resolved = 0 or all brier_score rows are NULL.
  // trend_delta is NULL on the first run (no previous snapshot to compare).
  db.exec(`
    CREATE TABLE IF NOT EXISTS calibration_snapshots (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date          TEXT NOT NULL,
      total_resolved         INTEGER NOT NULL,
      avg_brier_score        REAL,
      avg_brier_by_agent     TEXT NOT NULL,
      avg_brier_by_stock     TEXT NOT NULL,
      avg_brier_by_direction TEXT NOT NULL,
      calibration_curve      TEXT NOT NULL,
      trend_delta            REAL,
      top_predictions        TEXT NOT NULL,
      worst_predictions      TEXT NOT NULL,
      computed_at            TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cs_snapshot_date ON calibration_snapshots(snapshot_date DESC)`);

  // ── Sprint 079 / Task 1201+1202: Backfill missing Q4-2025 BCTC queue rows ──────
  // Banking tickers BID/EIB/SHB/VCB + industrial FPT/HPG missed Q4-2025 due to
  // the quarter-detection bug (April was wrongly mapped to Q1). VCB Q1-2025 also
  // needs re-fetch after the Task 1204 startup migration deletes the corrupted record.
  //
  // ON CONFLICT DO UPDATE WHERE status='failed' OR attempts>=5 ensures:
  //   - Stale failed/exhausted rows are reset to pending.
  //   - In-progress pending rows (attempts < 5) are left untouched.
  //   - Rows already 'pending' with low attempt counts are not disrupted.
  // This block is idempotent: safe to run on every server startup.
  {
    const BACKFILL_079 = [
      { code: "BID", year: 2025, quarter: "Q4" },
      { code: "EIB", year: 2025, quarter: "Q4" },
      { code: "SHB", year: 2025, quarter: "Q4" },
      { code: "VCB", year: 2025, quarter: "Q4" },
      { code: "FPT", year: 2025, quarter: "Q4" },
      { code: "HPG", year: 2025, quarter: "Q4" },
      { code: "VCB", year: 2025, quarter: "Q1" }, // Task 1204: re-fetch after deletion of corrupted record
    ];
    const backfillStmt = db.prepare(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, attempts)
      VALUES (?, ?, ?, 'pending', 0)
      ON CONFLICT(action_code, period_year, period_quarter)
      DO UPDATE SET status = 'pending', attempts = 0, last_attempt = NULL
      WHERE status = 'failed' OR attempts >= 5
    `);
    for (const entry of BACKFILL_079) {
      backfillStmt.run(entry.code, entry.year, entry.quarter);
    }
  }

  // ── Sprint 079 / Task 1204: Delete corrupted VCB Q1-2025 record ──────────────
  // VCB Q1-2025 was inserted with all values = 0 due to a failed PDF extraction.
  // extraction_confidence < 0.1 means all 16 key fields were zero — no signal value.
  // Conditional guard: only deletes if confidence < 0.1 so that a valid re-parsed row
  // (confidence >= 0.3 after bctcReparseJob runs) is never accidentally removed.
  // This block is idempotent: after the row is deleted and re-parsed, subsequent
  // server restarts find no row matching extraction_confidence < 0.1 and do nothing.
  db.prepare(`
    DELETE FROM financial_reports
    WHERE action_code = 'VCB'
      AND period_year = 2025
      AND period_type = 'Q1'
      AND extraction_confidence < 0.1
  `).run();

  // ── OHLCV Backfill Queue (Task 1361 / Sprint 123) ─────────────────────────────
  // Tracks pending backfill requests triggered by ohlcvStartupProbe.
  // VPS polls GET /api/ohlcv-backfill-queue; after running backfill it POSTs to
  // /api/ohlcv-backfill-done which sets done=1. Probe deduplicates: it only inserts
  // when no done=0 row already exists.
  db.exec(`
    CREATE TABLE IF NOT EXISTS ohlcv_backfill_queue (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      queued_at  TEXT NOT NULL DEFAULT (datetime('now')),
      done       INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_obq_done ON ohlcv_backfill_queue(done)`);

  // ── Market Messages (Sprint 068) ──────────────────────────────────────────────
  // Persists all MARKET channel Telegram sends for quality review.
  // from_agent identifies the scheduler job or MCP tool that sent the message.
  // verdict / verdict_note / reviewed_at are populated by the review_market_message
  // MCP tool — NULL means unreviewed.
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_messages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      from_agent   TEXT    NOT NULL,
      message_type TEXT    NOT NULL,
      ticker       TEXT,
      content      TEXT    NOT NULL,
      sent_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      verdict      TEXT,
      verdict_note TEXT,
      reviewed_at  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_mm_sent_at    ON market_messages(sent_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mm_from_agent ON market_messages(from_agent);
    CREATE INDEX IF NOT EXISTS idx_mm_verdict    ON market_messages(verdict);
    CREATE INDEX IF NOT EXISTS idx_mm_ticker     ON market_messages(ticker);
  `);

  // Sprint 191 — impact tracking columns (idempotent: try/catch per column)
  for (const sql of [
    `ALTER TABLE market_messages ADD COLUMN impact_score     REAL`,
    `ALTER TABLE market_messages ADD COLUMN price_at_message REAL`,
    `ALTER TABLE market_messages ADD COLUMN price_3d_after   REAL`,
  ]) {
    try { db.exec(sql); } catch { /* column already exists — safe */ }
  }

  // Task 1407 — HUT domain migration: real_estate → construction
  // Safe: WHERE clause makes it a no-op if already correct or HUT not in watchlist.
  db.exec(
    `UPDATE watchlist SET domain = 'construction' WHERE code = 'HUT' AND domain = 'real_estate'`
  );

  // Task 1457 — canonical DDL for scheduler_locks (moved from schedulerLockStore.ts).
  // ensureSchedulerLocksTable() is now a no-op kept for API compat.
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduler_locks (
      job_name     TEXT PRIMARY KEY,
      acquired_at  TEXT NOT NULL DEFAULT (datetime('now')),
      released_at  TEXT
    )
  `);

  // Cleanup: remove stale VCB test fixture rows that leaked before sprint-181 DB isolation fix
  db.exec(`DELETE FROM market_prices WHERE code = 'VCB' AND updated_at < datetime('now', '-7 days')`);
  db.exec(`DELETE FROM market_prices_history WHERE code = 'VCB' AND fetched_at < datetime('now', '-7 days')`);

  // Task 1489: remove tracked_indicators rows inserted by tests (source='test')
  // so test-generated noise never persists into production state.
  db.exec(`DELETE FROM tracked_indicators WHERE source='test'`);

}

// ─────────────────────────────────────────────────────────────────────────────
// Task 1503 — foreign flow column migration
// Run after initDatabase() on existing deployments where daily_ohlcv was created
// without the four foreign flow columns.
// Safe to call on a fresh DB — ALTER TABLE IF NOT EXISTS is a no-op when the col exists.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Add foreign flow columns to daily_ohlcv if they do not already exist.
 * Idempotent — safe to call on fresh and existing databases.
 */
export async function migrateForeignFlowColumns(db: import("bun:sqlite").Database): Promise<void> {
  // SQLite ALTER TABLE does not support IF NOT EXISTS in older versions used by Bun.
  // Detect existing cols via PRAGMA and skip ALTER when already present.
  const cols = db
    .prepare<{ name: string }, []>("PRAGMA table_info(daily_ohlcv)")
    .all()
    .map((r) => r.name);

  const toAdd: Array<[string, string]> = [
    ["foreign_buy_vol",  "REAL"],
    ["foreign_sell_vol", "REAL"],
    ["foreign_net_vol",  "REAL"],
    ["put_through_vol",  "REAL"],
  ];

  for (const [col, type] of toAdd) {
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE daily_ohlcv ADD COLUMN ${col} ${type}`);
    }
  }
}
