/**
 * Task 1091 — Test-only DDL helper for 8 vnstock tables
 *
 * `initVnstockTables()` DDL was removed from
 * `src/infrastructure/db/vnstockStore.ts` because it duplicated
 * `schema.ts:initDatabase()`. Tests that use the singleton DB (via getDb())
 * should call `initDatabase()` instead. Tests that use an explicit in-memory
 * DB can call this helper.
 *
 * Keep mirrored with `schema.ts:928+` (the vnstock blocks in `initDatabase`).
 */

import type { Database } from "bun:sqlite";

export function initVnstockTables(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_financials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      year_report INTEGER NOT NULL,
      quarter INTEGER NOT NULL,
      revenue_bn REAL, revenue_yoy REAL, net_profit_bn REAL, net_profit_yoy REAL,
      eps INTEGER, pe REAL, pb REAL, roe REAL, roa REAL,
      debt_to_equity REAL, net_profit_margin REAL, nim REAL, npl REAL,
      source TEXT NOT NULL DEFAULT 'vnstock',
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, year_report, quarter, source)
    );
    CREATE INDEX IF NOT EXISTS idx_vnfin_code ON vnstock_financials(code);
    CREATE INDEX IF NOT EXISTS idx_vnfin_period ON vnstock_financials(year_report, quarter);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT '1970-01-01',
      foreign_room INTEGER, foreign_volume INTEGER,
      current_holding_ratio REAL, max_holding_ratio REAL,
      avg_volume_2w INTEGER, high_52w REAL, low_52w REAL,
      pct_from_high_52w REAL, pct_from_low_52w REAL,
      fetched_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, date)
    );
    CREATE INDEX IF NOT EXISTS idx_vnstats_code_date ON vnstock_trading_stats(code, date);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL, event_name TEXT NOT NULL, event_date TEXT NOT NULL,
      event_type TEXT NOT NULL, description TEXT,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, event_name, event_date)
    );
    CREATE INDEX IF NOT EXISTS idx_vnevents_code ON vnstock_events(code);
    CREATE INDEX IF NOT EXISTS idx_vnevents_date ON vnstock_events(event_date);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_officers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL, name TEXT NOT NULL, position TEXT NOT NULL,
      own_percent REAL, quantity INTEGER,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, name)
    );
    CREATE INDEX IF NOT EXISTS idx_vnofficers_code ON vnstock_officers(code);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_shareholders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL, name TEXT NOT NULL, quantity INTEGER, own_percent REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, name)
    );
    CREATE INDEX IF NOT EXISTS idx_vnshareholders_code ON vnstock_shareholders(code);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_fetch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL, data_type TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, data_type)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_balance_sheet (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL, year_report INTEGER NOT NULL, quarter INTEGER NOT NULL,
      total_assets_bn REAL, total_liabilities_bn REAL, total_equity_bn REAL,
      cash_bn REAL, short_term_debt_bn REAL, long_term_debt_bn REAL,
      receivables_bn REAL, inventory_bn REAL,
      source TEXT NOT NULL DEFAULT 'vnstock',
      fetched_at TEXT NOT NULL,
      UNIQUE(code, year_report, quarter, source)
    );
    CREATE INDEX IF NOT EXISTS idx_vnbs_code ON vnstock_balance_sheet(code);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vnstock_cash_flow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL, year_report INTEGER NOT NULL, quarter INTEGER NOT NULL,
      operating_cf_bn REAL, investing_cf_bn REAL, financing_cf_bn REAL, net_cf_bn REAL,
      source TEXT NOT NULL DEFAULT 'vnstock',
      fetched_at TEXT NOT NULL,
      UNIQUE(code, year_report, quarter, source)
    );
    CREATE INDEX IF NOT EXISTS idx_vncf_code ON vnstock_cash_flow(code);
  `);
}
