/**
 * schema-financial-reports.ts — Sprint 209 schema decomposition
 *
 * Tables:
 *   - financial_reports   — BCTC financial report data (DDL from bctc-schema.ts)
 *   - pdf_extracted_text  — PDF OCR cache
 *   - bctc_vps_queue      — VPS proxy queue for BCTC PDF fetches
 *   - vnstock_financials  — vnstock income statement data
 *   - vnstock_balance_sheet
 *   - vnstock_cash_flow
 *   - vnstock_trading_stats
 *   - vnstock_events
 *   - vnstock_officers
 *   - vnstock_shareholders
 *   - vnstock_fetch_log
 */

import type { Database } from "bun:sqlite";
import { SQLITE_DDL } from "../../../bctc-schema.js";

export function initFinancialReportsTables(db: Database): void {
  // ── Financial Reports (BCTC) ───────────────────────────────────────────────
  // DDL imported from bctc-schema.ts — includes financial_reports table,
  // all scalar columns, JSON blobs, indexes, v_chart_timeseries and
  // v_yoy_comparison views.
  db.exec(SQLITE_DDL);

  // ── Migration: add validation_status/validation_notes if missing ───────────
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
    // fresh DB — CREATE TABLE already included the columns
  }

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

  // Task 1002 — action_code column for ticker attribution
  try {
    db.exec(`ALTER TABLE pdf_extracted_text ADD COLUMN action_code TEXT NOT NULL DEFAULT ''`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_pet_action_code ON pdf_extracted_text(action_code)`);
  } catch {
    // Column already exists
  }

  // ── BCTC VPS Queue (Task 1112) ────────────────────────────────────────────
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

  // ── vnstock tables (Task 1042) ────────────────────────────────────────────
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
}
