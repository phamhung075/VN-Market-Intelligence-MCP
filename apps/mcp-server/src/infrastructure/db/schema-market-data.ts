/**
 * schema-market-data.ts — Sprint 209 schema decomposition
 *
 * Tables:
 *   - watchlist              — user's stock watchlist with alert thresholds
 *   - market_prices          — latest price snapshot per stock
 *   - market_prices_history  — append-only price time series
 *   - daily_ohlcv            — MERGED DDL (base + foreign flow columns)
 *   - ohlcv_backfill_queue   — VPS backfill request tracking
 *
 * IMPORTANT: daily_ohlcv DDL is the canonical merged version combining
 * both original definitions from schema.ts (lines ~154 and ~1122).
 * The union of all columns is: code, date, open, high, low, close,
 * volume, updated_at, foreign_buy_vol, foreign_sell_vol, foreign_net_vol,
 * put_through_vol.
 *
 * NOTE: A table named `vn_index_cache` was classified as a zombie orphan in
 * Sprint 1922 (Task 1922b). Investigation confirmed it has NO CREATE TABLE
 * definition in any schema file and ZERO production writers or readers in
 * any .ts/.js file. It exists only in the live market.db from an abandoned
 * cache design referenced in docs/architecture/1842a-backtesting-engine.md
 * (Phase 2 VNINDEX time-series, never implemented). No migration needed.
 * freshnessSlaMonitor: excluded from coverage check (no active writer).
 * DO NOT add new writers. DO NOT query this table.
 */

import type { Database } from "bun:sqlite";

export function initMarketDataTables(db: Database): void {
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

  // FIX-1327: Schema migration guard — clean up stale market_prices entries
  // Keep only the last 30 days of price data for watchlist stocks
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    db.prepare(`
      DELETE FROM market_prices
      WHERE updated_at < ? AND code IN (SELECT code FROM watchlist)
    `).run(thirtyDaysAgo);
  } catch { /* best effort */ }

  // ── Market Prices History ─────────────────────────────────────────────────
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

  // ── Daily OHLCV — MERGED DDL (both definitions unified) ──────────────────
  // Original definition 1 (line ~154): base columns only
  // Original definition 2 (line ~1122): adds foreign_buy_vol, foreign_sell_vol,
  //   foreign_net_vol, put_through_vol
  // Merged: single CREATE TABLE with all columns.
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code             TEXT NOT NULL,
      date             TEXT NOT NULL,
      open             REAL NOT NULL DEFAULT 0,
      high             REAL NOT NULL DEFAULT 0,
      low              REAL NOT NULL DEFAULT 0,
      close            REAL NOT NULL,
      volume           REAL NOT NULL DEFAULT 0,
      updated_at       TEXT NOT NULL DEFAULT '',
      foreign_buy_vol  REAL,
      foreign_sell_vol REAL,
      foreign_net_vol  REAL,
      put_through_vol  REAL,
      PRIMARY KEY (code, date)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_ohlcv_code_date
      ON daily_ohlcv(code, date DESC);
  `);

  // ── EI-P2-2: data_env column on daily_ohlcv ──────────────────────────────
  // Idempotent: PRAGMA check + guarded ALTER TABLE.
  // Existing rows get NULL (unknown provenance). New rows stamped by write paths.
  {
    const cols = db
      .prepare<{ name: string }, []>("PRAGMA table_info(daily_ohlcv)")
      .all()
      .map((r) => r.name);
    if (!cols.includes("data_env")) {
      db.exec("ALTER TABLE daily_ohlcv ADD COLUMN data_env TEXT");
    }
  }

  // ── OHLCV Backfill Queue (Task 1361 / Sprint 123) ─────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS ohlcv_backfill_queue (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      queued_at  TEXT NOT NULL DEFAULT (datetime('now')),
      done       INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_obq_done ON ohlcv_backfill_queue(done)`);
}
