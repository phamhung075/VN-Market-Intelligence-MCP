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
      open       REAL    NOT NULL,
      high       REAL    NOT NULL,
      low        REAL    NOT NULL,
      close      REAL    NOT NULL,
      volume     REAL    NOT NULL DEFAULT 0,
      updated_at TEXT    NOT NULL,
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

  // ── Commodity Prices (tasks 025, 028) ─────────────────────────────────────
  // `commodity_prices` — latest snapshot per source (upsert via INSERT OR REPLACE).
  // `commodity_prices_history` — append-only time series for σ-based macro thresholds.
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices (
      source          TEXT PRIMARY KEY,
      brent_crude_usd REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz REAL NOT NULL DEFAULT 0,
      usd_vnd_rate    REAL NOT NULL DEFAULT 0,
      fetched_at      TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS commodity_prices_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      source          TEXT NOT NULL,
      brent_crude_usd REAL NOT NULL DEFAULT 0,
      gold_usd_per_oz REAL NOT NULL DEFAULT 0,
      usd_vnd_rate    REAL NOT NULL DEFAULT 0,
      fetched_at      TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_cph_source_fetched ON commodity_prices_history(source, fetched_at DESC)`);

  // ── SBV Rates (task 028) ──────────────────────────────────────────────────
  // `sbv_rates` — latest snapshot per source (upsert via INSERT OR REPLACE).
  // `sbv_rates_history` — append-only time series for macro σ analysis.
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbv_rates (
      source               TEXT PRIMARY KEY,
      overnight_rate_pct   REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct REAL NOT NULL DEFAULT 0,
      usd_vnd_official     REAL NOT NULL DEFAULT 0,
      fetched_at           TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sbv_rates_history (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      source               TEXT NOT NULL,
      overnight_rate_pct   REAL NOT NULL DEFAULT 0,
      refinancing_rate_pct REAL NOT NULL DEFAULT 0,
      usd_vnd_official     REAL NOT NULL DEFAULT 0,
      fetched_at           TEXT NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_srh_source_fetched ON sbv_rates_history(source, fetched_at DESC)`);

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
  const currentDbPath = process.env["DB_PATH"] ?? Bun.env["DB_PATH"] ?? DEFAULT_DB_PATH;
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
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracked_indicators (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      indicator    TEXT NOT NULL,
      value        REAL NOT NULL,
      unit         TEXT NOT NULL DEFAULT '',
      source       TEXT NOT NULL DEFAULT '',
      extracted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tracked_ind_name_time
      ON tracked_indicators(indicator, extracted_at DESC);
  `);

  // ── Mention velocity (Sprint 031 / 265) ────────────────────────────────
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

  // ── Daily OHLCV (2+ year retention for volatility analysis) ────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT    NOT NULL,
      date       TEXT    NOT NULL,
      open       REAL    NOT NULL,
      high       REAL    NOT NULL,
      low        REAL    NOT NULL,
      close      REAL    NOT NULL,
      volume     REAL    NOT NULL DEFAULT 0,
      updated_at TEXT    NOT NULL,
      PRIMARY KEY (code, date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_code_date ON daily_ohlcv(code, date DESC)`);
}
