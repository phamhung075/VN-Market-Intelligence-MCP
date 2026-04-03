/**
 * Infrastructure — vnstock Data Store
 *
 * SQLite storage for all vnstock data: financials, trading stats,
 * officers, shareholders. Lazy-fetched and cached locally.
 *
 * Rate limit strategy: vnstock free = 60 req/min.
 * Each stock needs ~5 requests for full snapshot.
 * With 4 stocks in watchlist = 20 requests = well within limit.
 * Lazy fetch: only refresh if data is older than staleness threshold.
 *
 * Layer: infrastructure/db
 */

import { getDb } from "./schema.js";
import { logger } from "../logger.js";
import type {
  VnstockFinancials,
  VnstockTradingStats,
  VnstockOfficer,
  VnstockShareholder,
  VnstockBalanceSheet,
  VnstockCashFlow,
} from "../fetchers/vnstockBridge.js";

// ---------------------------------------------------------------------------
// DDL — create tables if not exist
// ---------------------------------------------------------------------------

export function initVnstockTables(): void {
  const db = getDb();

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
    );
    CREATE INDEX IF NOT EXISTS idx_vnfin_code ON vnstock_financials(code);
    CREATE INDEX IF NOT EXISTS idx_vnfin_period ON vnstock_financials(year_report, quarter);

    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
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
      UNIQUE(code)
    );

    CREATE TABLE IF NOT EXISTS vnstock_officers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      own_percent REAL,
      quantity INTEGER,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, name)
    );
    CREATE INDEX IF NOT EXISTS idx_vnofficers_code ON vnstock_officers(code);

    CREATE TABLE IF NOT EXISTS vnstock_shareholders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER,
      own_percent REAL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, name)
    );
    CREATE INDEX IF NOT EXISTS idx_vnshareholders_code ON vnstock_shareholders(code);

    CREATE TABLE IF NOT EXISTS vnstock_fetch_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      data_type TEXT NOT NULL,
      fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, data_type)
    );

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
    );
    CREATE INDEX IF NOT EXISTS idx_vnbs_code ON vnstock_balance_sheet(code);

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
    );
    CREATE INDEX IF NOT EXISTS idx_vncf_code ON vnstock_cash_flow(code);
  `);
}

// ---------------------------------------------------------------------------
// Staleness check — lazy fetch only if data is old
// ---------------------------------------------------------------------------

/**
 * Check if data for a given code+type was fetched recently.
 * @param code - Stock code
 * @param dataType - "financials" | "trading_stats" | "officers" | "shareholders"
 * @param maxAgeMinutes - Max age before considered stale (default: 360 = 6 hours)
 */
export function isStale(code: string, dataType: string, maxAgeMinutes = 360): boolean {
  const db = getDb();
  try {
    const row = db
      .prepare<{ fetched_at: string }, [string, string]>(
        `SELECT fetched_at FROM vnstock_fetch_log
         WHERE code = ? AND data_type = ?`,
      )
      .get(code, dataType);

    if (!row) return true;

    const fetchedAt = new Date(row.fetched_at).getTime();
    const now = Date.now();
    return now - fetchedAt > maxAgeMinutes * 60 * 1000;
  } catch {
    return true;
  }
}

function markFetched(code: string, dataType: string): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_fetch_log (code, data_type, fetched_at)
     VALUES (?, ?, datetime('now'))`,
  ).run(code, dataType);
}

// ---------------------------------------------------------------------------
// Store functions
// ---------------------------------------------------------------------------

export function storeFinancials(f: VnstockFinancials): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_financials
     (code, year_report, quarter, revenue_bn, revenue_yoy, net_profit_bn, net_profit_yoy,
      eps, pe, pb, roe, roa, debt_to_equity, net_profit_margin, nim, npl, source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    f.code, f.yearReport, f.quarter, f.revenue, f.revenueYoY, f.netProfit, f.netProfitYoY,
    f.eps, f.pe, f.pb, f.roe, f.roa, f.debtToEquity, f.netProfitMargin,
    f.nim, f.npl, f.source, f.fetchedAt,
  );
  markFetched(f.code, "financials");
}

export function storeTradingStats(s: VnstockTradingStats): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_trading_stats
     (code, foreign_room, foreign_volume, current_holding_ratio, max_holding_ratio,
      avg_volume_2w, high_52w, low_52w, pct_from_high_52w, pct_from_low_52w, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    s.code, s.foreignRoom, s.foreignVolume, s.currentHoldingRatio, s.maxHoldingRatio,
    s.avgVolume2w, s.high52w, s.low52w, s.pctFromHigh52w, s.pctFromLow52w, s.fetchedAt,
  );
  markFetched(s.code, "trading_stats");
}

export function storeOfficers(code: string, officers: VnstockOfficer[]): void {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO vnstock_officers (code, name, position, own_percent, quantity, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAll = db.transaction(() => {
    for (const o of officers) {
      stmt.run(o.code, o.name, o.position, o.ownPercent, o.quantity, now);
    }
  });
  insertAll();
  markFetched(code, "officers");
}

export function storeShareholders(code: string, holders: VnstockShareholder[]): void {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO vnstock_shareholders (code, name, quantity, own_percent, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const insertAll = db.transaction(() => {
    for (const h of holders) {
      stmt.run(h.code, h.name, h.quantity, h.ownPercent, now);
    }
  });
  insertAll();
  markFetched(code, "shareholders");
}

// ---------------------------------------------------------------------------
// Read functions
// ---------------------------------------------------------------------------

export function getLatestFinancials(code: string): VnstockFinancials | null {
  const db = getDb();
  const row = db
    .prepare<any, [string]>(
      `SELECT * FROM vnstock_financials WHERE code = ? ORDER BY year_report DESC, quarter DESC LIMIT 1`,
    )
    .get(code);
  if (!row) return null;
  return {
    code: row.code,
    yearReport: row.year_report,
    quarter: row.quarter,
    source: row.source,
    revenue: row.revenue_bn,
    revenueYoY: row.revenue_yoy,
    netProfit: row.net_profit_bn,
    netProfitYoY: row.net_profit_yoy,
    eps: row.eps,
    pe: row.pe,
    pb: row.pb,
    roe: row.roe,
    roa: row.roa,
    debtToEquity: row.debt_to_equity,
    netProfitMargin: row.net_profit_margin,
    nim: row.nim,
    npl: row.npl,
    fetchedAt: row.fetched_at,
  };
}

export function getTradingStats(code: string): VnstockTradingStats | null {
  const db = getDb();
  const row = db
    .prepare<any, [string]>(
      `SELECT * FROM vnstock_trading_stats WHERE code = ?`,
    )
    .get(code);
  if (!row) return null;
  return {
    code: row.code,
    foreignRoom: row.foreign_room,
    foreignVolume: row.foreign_volume,
    currentHoldingRatio: row.current_holding_ratio,
    maxHoldingRatio: row.max_holding_ratio,
    avgVolume2w: row.avg_volume_2w,
    high52w: row.high_52w,
    low52w: row.low_52w,
    pctFromHigh52w: row.pct_from_high_52w,
    pctFromLow52w: row.pct_from_low_52w,
    fetchedAt: row.fetched_at,
  };
}

// ---------------------------------------------------------------------------
// Balance Sheet store/read
// ---------------------------------------------------------------------------

/**
 * Store a balance sheet row. Uses INSERT OR REPLACE (UPSERT on unique key).
 */
export function storeBalanceSheet(bs: VnstockBalanceSheet): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_balance_sheet
     (code, year_report, quarter, total_assets_bn, total_liabilities_bn, total_equity_bn,
      cash_bn, short_term_debt_bn, long_term_debt_bn, receivables_bn, inventory_bn,
      source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    bs.code, bs.yearReport, bs.quarter,
    bs.totalAssets, bs.totalLiabilities, bs.totalEquity,
    bs.cash, bs.shortTermDebt, bs.longTermDebt, bs.receivables, bs.inventory,
    bs.source, bs.fetchedAt,
  );
  markFetched(bs.code, "balance_sheet");
}

/**
 * Retrieve the most recent balance sheet for a stock (by year_report DESC, quarter DESC).
 */
export function getLatestBalanceSheet(code: string): VnstockBalanceSheet | null {
  const db = getDb();
  const row = db
    .prepare<any, [string]>(
      `SELECT * FROM vnstock_balance_sheet
       WHERE code = ?
       ORDER BY year_report DESC, quarter DESC LIMIT 1`,
    )
    .get(code);
  if (!row) return null;
  return {
    code: row.code,
    yearReport: row.year_report,
    quarter: row.quarter,
    totalAssets: row.total_assets_bn,
    totalLiabilities: row.total_liabilities_bn,
    totalEquity: row.total_equity_bn,
    cash: row.cash_bn,
    shortTermDebt: row.short_term_debt_bn,
    longTermDebt: row.long_term_debt_bn,
    receivables: row.receivables_bn,
    inventory: row.inventory_bn,
    source: row.source,
    fetchedAt: row.fetched_at,
  };
}

// ---------------------------------------------------------------------------
// Cash Flow store/read
// ---------------------------------------------------------------------------

/**
 * Store a cash flow row. Uses INSERT OR REPLACE (UPSERT on unique key).
 */
export function storeCashFlow(cf: VnstockCashFlow): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO vnstock_cash_flow
     (code, year_report, quarter, operating_cf_bn, investing_cf_bn,
      financing_cf_bn, net_cf_bn, source, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    cf.code, cf.yearReport, cf.quarter,
    cf.operatingCashFlow, cf.investingCashFlow,
    cf.financingCashFlow, cf.netCashFlow,
    cf.source, cf.fetchedAt,
  );
  markFetched(cf.code, "cash_flow");
}

/**
 * Retrieve the most recent cash flow for a stock (by year_report DESC, quarter DESC).
 */
export function getLatestCashFlow(code: string): VnstockCashFlow | null {
  const db = getDb();
  const row = db
    .prepare<any, [string]>(
      `SELECT * FROM vnstock_cash_flow
       WHERE code = ?
       ORDER BY year_report DESC, quarter DESC LIMIT 1`,
    )
    .get(code);
  if (!row) return null;
  return {
    code: row.code,
    yearReport: row.year_report,
    quarter: row.quarter,
    operatingCashFlow: row.operating_cf_bn,
    investingCashFlow: row.investing_cf_bn,
    financingCashFlow: row.financing_cf_bn,
    netCashFlow: row.net_cf_bn,
    source: row.source,
    fetchedAt: row.fetched_at,
  };
}
