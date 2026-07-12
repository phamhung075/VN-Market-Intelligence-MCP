/**
 * schema-market-data.ts — Sprint 209 schema decomposition
 *
 * Tables:
 *   - watchlist              — user's stock watchlist with alert thresholds
 *   - market_prices          — latest price snapshot per stock
 *   - market_prices_history  — append-only price time series
 *   - daily_ohlcv            — MERGED DDL (base + foreign flow columns)
 *   - daily_foreign_flow     — new authoritative foreign-flow table (ARCH-DAILY-FOREIGN-FLOW-TABLE
 *                              SUBTASK-DAILY-FF-1); additive, PK (code,date), see
 *                              daily_ohlcv_with_flow view below for the read-compat join
 *   - ohlcv_backfill_queue   — VPS backfill request tracking
 *   - vn_index_cache         — latest VNINDEX snapshot; writer: vnIndexRefreshJob (every 5 min, market hours)
 *
 * Views:
 *   - daily_ohlcv_with_flow  — daily_ohlcv LEFT JOIN daily_foreign_flow, COALESCE-preferring the
 *                              new table over the frozen legacy daily_ohlcv.foreign_* columns
 *
 * IMPORTANT: daily_ohlcv DDL is the canonical merged version combining
 * both original definitions from schema.ts (lines ~154 and ~1122).
 * The union of all columns is: code, date, open, high, low, close,
 * volume, updated_at, foreign_buy_vol, foreign_sell_vol, foreign_net_vol,
 * put_through_vol.
 *
 * FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (2026-06-20): vn_index_cache was previously
 * classified as a zombie orphan (Sprint 1922/Task 1922b) because no writer existed.
 * This fix adds the authoritative DDL and wires vnIndexRefreshJob as the writer.
 * The table stores the latest VNINDEX snapshot so DB integrity checks have a real
 * source of truth for freshness (SLA: <= 10 min stale during 02:00-08:59 UTC Mon-Fri).
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

  // ── Daily Foreign Flow (SUBTASK-DAILY-FF-1, ARCH-DAILY-FOREIGN-FLOW-TABLE) ──
  // Additive-only new table — eliminates R-1 (foreign-flow write dropped when
  // no daily_ohlcv row exists yet, since none of these columns are coupled to
  // price data / NOT NULL constraints). See
  // docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md § Change 1/3.
  //
  // This subtask ships ONLY the table + index + compatibility view. It does
  // NOT touch daily_ohlcv, does NOT change the writer (still merge-only
  // UPDATE in ohlcvForeignFlowStore.ts — cutover is SUBTASK-DAILY-FF-3), and
  // does NOT backfill historical rows (SUBTASK-DAILY-FF-2). The view's
  // COALESCE falls back to the frozen legacy daily_ohlcv.foreign_* columns
  // for any (code,date) not yet present in the new table, so it is safe to
  // ship standalone ahead of the writer cutover.
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_foreign_flow (
      code               TEXT NOT NULL,
      date               TEXT NOT NULL,
      foreign_buy_vol    REAL,
      foreign_sell_vol   REAL,
      foreign_net_vol    REAL,
      put_through_vol    REAL,
      foreign_buy_value  REAL,
      foreign_sell_value REAL,
      updated_at         TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (code, date)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_foreign_flow_code_date
      ON daily_foreign_flow(code, date DESC);
  `);

  // Backward-compatible read view: same column names as today's daily_ohlcv
  // foreign columns so every existing read site can migrate via a one-line
  // `FROM daily_ohlcv` -> `FROM daily_ohlcv_with_flow` rename (no query-shape
  // change, existing tests stay green). Placed after the data_env ALTER
  // migration above so o.data_env always resolves on first-boot view creation.
  db.exec(`
    CREATE VIEW IF NOT EXISTS daily_ohlcv_with_flow AS
    SELECT
      o.code, o.date, o.open, o.high, o.low, o.close, o.volume, o.updated_at, o.data_env,
      COALESCE(f.foreign_buy_vol,    o.foreign_buy_vol)    AS foreign_buy_vol,
      COALESCE(f.foreign_sell_vol,   o.foreign_sell_vol)   AS foreign_sell_vol,
      COALESCE(f.foreign_net_vol,    o.foreign_net_vol)    AS foreign_net_vol,
      COALESCE(f.put_through_vol,    o.put_through_vol)    AS put_through_vol,
      COALESCE(f.foreign_buy_value,  o.foreign_buy_value)  AS foreign_buy_value,
      COALESCE(f.foreign_sell_value, o.foreign_sell_value) AS foreign_sell_value
    FROM daily_ohlcv o
    LEFT JOIN daily_foreign_flow f ON f.code = o.code AND f.date = o.date;
  `);

  // ── OHLCV Backfill Queue (Task 1361 / Sprint 123) ─────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS ohlcv_backfill_queue (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      queued_at   TEXT NOT NULL DEFAULT (datetime('now')),
      done        INTEGER NOT NULL DEFAULT 0,
      retry_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_obq_done ON ohlcv_backfill_queue(done)`);

  // Migration: add retry_count column if missing (SUBTASK-B FIX-OHLCV-DEPTH-PERSIST)
  {
    const obqCols = db
      .prepare<{ name: string }, []>("PRAGMA table_info(ohlcv_backfill_queue)")
      .all()
      .map((r) => r.name);
    if (!obqCols.includes("retry_count")) {
      db.exec(
        "ALTER TABLE ohlcv_backfill_queue ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0"
      );
    }
  }

  // ── VN-Index Cache (FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH) ────────────────
  // Single-row cache for the latest VNINDEX snapshot. code is PRIMARY KEY so
  // INSERT OR REPLACE acts as an upsert — only ever 1 row per index code.
  // Writer: vnIndexRefreshJob (*/5 during 02:00–08:59 UTC Mon–Fri).
  // Freshness SLA: <= 10 min during market hours.
  db.exec(`
    CREATE TABLE IF NOT EXISTS vn_index_cache (
      code         TEXT PRIMARY KEY,
      price        REAL NOT NULL,
      prev_price   REAL NOT NULL DEFAULT 0,
      change_pct   REAL NOT NULL DEFAULT 0,
      volume       REAL NOT NULL DEFAULT 0,
      fetched_at   TEXT NOT NULL
    )
  `);

  // ── Market Breadth History (BREADTH-TIME-SERIES, Sprint MARKET-INDICATOR-DEPTH-P0) ──
  // Append-only forward-accruing daily breadth table.
  // FORWARD-ACCRUING ONLY — no backfill, no synthetic rows (NFR-BR-1).
  // ON CONFLICT IGNORE: first write wins (idempotency, NFR-BR-2).
  // McClellan warmup: ~40 sessions for EMA39 to stabilize.
  // Zweig warmup: 14 sessions for thrust window.
  // Writer: breadthHistoryPersisterJob (cron 37 8 * * 1-5 UTC = 15:37 VN, post-close).
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_breadth_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT    NOT NULL UNIQUE,
      advancing    INTEGER NOT NULL,
      declining    INTEGER NOT NULL,
      unchanged    INTEGER NOT NULL,
      ceiling      INTEGER NOT NULL,
      floor        INTEGER NOT NULL,
      total        INTEGER NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mbh_date ON market_breadth_history(session_date DESC);
  `);

  // ── Money Radar Score History (MONEY-RADAR-P0-T2-COMPOSITE) ──────────────
  // Append-only forward-accruing daily composite-score table.
  // FORWARD-ACCRUING ONLY — no backfill, no synthetic rows (same discipline as
  // market_breadth_history NFR-BR-1). ON CONFLICT IGNORE: first write per
  // session_date wins (idempotency, NFR-BR-2 pattern).
  // Purpose: delta_5d = score(t) - score(t-5) per §4 output schema — null when
  // <6 accrued rows (honest, no fabricated trend on cold start).
  // Writer: getMoneyRadarComposite usecase (best-effort write on every call).
  db.exec(`
    CREATE TABLE IF NOT EXISTS money_radar_score_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_date TEXT    NOT NULL UNIQUE,
      score        REAL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_mrsh_date ON money_radar_score_history(session_date DESC);
  `);
}
