/**
 * schema-macro.ts — Sprint 209 schema decomposition
 *
 * Tables:
 *   - macro_indicators          — Trading Economics macro data (Task 024/1495)
 *   - commodity_prices          — latest commodity/FX snapshot
 *   - commodity_prices_history  — append-only commodity time series
 *   - sbv_rates                 — SBV interest rate snapshot (Task 028/1497)
 *   - sbv_rates_history         — append-only SBV rate time series
 *   - prediction_markets        — Polymarket markets (Task 163)
 *   - prediction_signals        — detected prediction signals
 *   - tracked_indicators        — general indicator tracker (Task 1489)
 *   - fred_series_daily         — FRED daily series rows: EFFR + IORB (Task 1879a)
 *   - bond_maturity             — bond maturity calendar (Task 1045)
 *   - pharma_events             — pharma regulatory events (Task 1046)
 *   - kinhdich_readings         — Kinh Dich hexagram readings (Task 1047)
 *   - hexagram_transitions      — hexagram transition statistics
 *
 * NOTE: A table named `credit_data` was classified as a zombie orphan in
 * Sprint 1922 (Task 1922c). Investigation confirmed it has NO CREATE TABLE
 * definition in any schema file and ZERO production writers or readers in
 * any .ts/.js/.sql file. It exists only in the live market.db from code
 * that was subsequently deleted (likely SBV credit growth data, never
 * connected to a live data source). No migration needed.
 * freshnessSlaMonitor: excluded from coverage check (no active writer).
 * DO NOT add new writers. DO NOT query this table.
 */

import type { Database } from "bun:sqlite";

export function initMacroTables(db: Database): void {
  // ── Macro Indicators (Task 024 / 1495) ────────────────────────────────────
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
  // Task 1495: idempotent migration for existing production DBs
  for (const col of [
    "unemployment_rate", "inflation_rate", "trade_balance", "current_account",
    "government_debt", "budget_deficit", "manufacturing_pmi", "consumer_confidence",
    "retail_sales",
  ]) {
    try { db.exec(`ALTER TABLE macro_indicators ADD COLUMN ${col} REAL`); } catch {}
  }
  // Task 239: add column to track last refresh job attempt
  try { db.exec(`ALTER TABLE macro_indicators ADD COLUMN last_refresh_job TEXT`); } catch {}

  // ── IMF Indicators (Task 1296b) ────────────────────────────────────────────
  // Separate table for structured IMF API data (code-keyed, not country-keyed)
  db.exec(`
    CREATE TABLE IF NOT EXISTS imf_indicators (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      code         TEXT NOT NULL,
      name         TEXT NOT NULL,
      value        REAL NOT NULL,
      published_at TEXT NOT NULL,
      age_in_days  INTEGER NOT NULL DEFAULT 0,
      prev_value   REAL,
      yoy_change   REAL,
      source       TEXT NOT NULL DEFAULT 'imf_api',
      confidence   REAL NOT NULL DEFAULT 0.95,
      fetched_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code) ON CONFLICT REPLACE
    );
    CREATE INDEX IF NOT EXISTS idx_imf_indicators_code ON imf_indicators(code);
    CREATE INDEX IF NOT EXISTS idx_imf_indicators_fetched ON imf_indicators(fetched_at DESC);
  `);

  // ── Commodity Prices (Task 025/028) ──────────────────────────────────────
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

  // Sprint 188 migration: +9 cols for existing DBs
  const commodity9Cols = [
    "vix", "sp500", "shanghai_comp", "hang_seng", "dxy",
    "cny_vnd_rate", "copper_usd", "silver_usd_per_oz", "jpy_vnd_rate",
  ];
  for (const col of commodity9Cols) {
    try { db.exec(`ALTER TABLE commodity_prices ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE commodity_prices_history ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`); } catch {}
  }

  // Task 1423a migration: +1 col for US 10-year Treasury yield
  try { db.exec(`ALTER TABLE commodity_prices ADD COLUMN us10y_yield REAL NOT NULL DEFAULT 0`); } catch {}
  try { db.exec(`ALTER TABLE commodity_prices_history ADD COLUMN us10y_yield REAL NOT NULL DEFAULT 0`); } catch {}

  // ── SBV Rates (Task 028/1497) ─────────────────────────────────────────────
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
  for (const col of ["discount_rate_pct", "max_deposit_rate_pct", "max_lending_rate_pct", "interbank_overnight_pct"]) {
    try { db.exec(`ALTER TABLE sbv_rates ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE sbv_rates_history ADD COLUMN ${col} REAL NOT NULL DEFAULT 0`); } catch {}
  }
  // DSI-S1-MACRO FR-MAC-2: add is_estimate column to sbv_rates and sbv_rates_history.
  // DEFAULT 1 = estimate (conservative: existing rows without this column are hardcoded defaults).
  // Set to 0 only when a real SBV portal response is received.
  try { db.exec(`ALTER TABLE sbv_rates ADD COLUMN is_estimate INTEGER NOT NULL DEFAULT 1`); } catch {}
  try { db.exec(`ALTER TABLE sbv_rates_history ADD COLUMN is_estimate INTEGER NOT NULL DEFAULT 1`); } catch {}

  // ── Prediction Markets (Task 163) ─────────────────────────────────────────
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
    );

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
    );

    CREATE INDEX IF NOT EXISTS idx_prediction_signals_detected_at
      ON prediction_signals(detected_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prediction_signals_market
      ON prediction_signals(market_id);
    CREATE INDEX IF NOT EXISTS idx_prediction_signals_severity
      ON prediction_signals(severity);
  `);

  // Task 248 — outcome columns
  try { db.exec(`ALTER TABLE prediction_signals ADD COLUMN outcome TEXT`); } catch {}
  try { db.exec(`ALTER TABLE prediction_signals ADD COLUMN outcome_price_change REAL`); } catch {}

  // ── Tracked Indicators (Task 1489) ────────────────────────────────────────
  // Idempotent migration: add hour_bucket to existing production DBs that were
  // created before the column was introduced. Must run BEFORE the CREATE TABLE
  // statement so that if the table already exists the column is present when
  // the UNIQUE constraint and trigger are evaluated at startup.
  try { db.exec(`ALTER TABLE tracked_indicators ADD COLUMN hour_bucket TEXT`); } catch { /* column already exists */ }

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

  // ── EI-P2-2: data_env column on tracked_indicators ───────────────────────
  // Idempotent: guarded ALTER TABLE (try/catch on column-exists error).
  // Existing rows get NULL. New rows stamped at each of the 4 ingest write sites.
  try { db.exec("ALTER TABLE tracked_indicators ADD COLUMN data_env TEXT"); } catch { /* already exists */ }

  // ── Kinh Dich (Task 1047) ─────────────────────────────────────────────────
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

  // ── FRED Daily Series (Task 1879a) ───────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS fred_series_daily (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      series     TEXT NOT NULL,
      date       TEXT NOT NULL,
      value      REAL NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (series, date)
    );
    CREATE INDEX IF NOT EXISTS idx_fred_series_daily_series_date
      ON fred_series_daily (series, date DESC);
  `);

  // ── Bond Maturity Calendar (Task 1045) ────────────────────────────────────
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

  // DSI-S3 C3: add is_seed_data column to bond_maturity.
  // DEFAULT 1 — on ADD COLUMN SQLite fills existing rows with the DEFAULT value,
  // so all 5 seed rows written on 2026-05-31 are automatically backfilled to 1.
  // Future genuine (non-seed) bonds written by a live fetcher MUST call upsertBond
  // with static_seed=false which writes is_seed_data=0 — see bondMaturityStore.ts.
  // NOTE: while all writer paths remain seed-only (no live fetcher yet), DEFAULT 1
  // is intentionally conservative; it will be revisited once a real fetcher lands.
  try { db.exec(`ALTER TABLE bond_maturity ADD COLUMN is_seed_data INTEGER NOT NULL DEFAULT 1`); } catch { /* already exists */ }

  // ── Pharma Events (Task 1046) ─────────────────────────────────────────────
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
}
