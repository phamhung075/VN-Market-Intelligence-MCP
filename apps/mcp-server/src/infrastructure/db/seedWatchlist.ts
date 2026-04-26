/**
 * seedWatchlist.ts — Task 1343a: Watchlist restore + Q4 2025 backfill
 *
 * Provides two idempotent functions:
 *   - seedWatchlist(db)     — inserts 30 tickers (10 sectors) via UPSERT
 *   - backfillBctcQ4(db)    — enqueues bctc_vps_queue for tickers missing Q4 2025
 *
 * Both functions are pure SQLite operations with no side effects beyond DB writes.
 * Safe to call multiple times (idempotent).
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Watchlist seed data — 30 tickers, 10 sectors (Sprint 054 user config)
// Default thresholds: dropPct=-3, risePct=5, impactScore=5
// ─────────────────────────────────────────────────────────────────────────────

export interface WatchlistSeedEntry {
  code: string;
  exchange: "HOSE" | "HNX" | "UPCOM";
  domain: string;
}

export const WATCHLIST_SEED: WatchlistSeedEntry[] = [
  // Oil & Gas
  { code: "GAS", exchange: "HOSE",  domain: "oil_gas" },
  { code: "GVR", exchange: "HOSE",  domain: "oil_gas" },
  // Banking
  { code: "VCB", exchange: "HOSE",  domain: "banking" },
  { code: "BID", exchange: "HOSE",  domain: "banking" },
  { code: "EIB", exchange: "HOSE",  domain: "banking" },
  { code: "MBB", exchange: "HOSE",  domain: "banking" },
  { code: "ACB", exchange: "HOSE",  domain: "banking" },
  { code: "CTG", exchange: "HOSE",  domain: "banking" },
  { code: "VPB", exchange: "HOSE",  domain: "banking" },
  // Real Estate
  { code: "VRE", exchange: "HOSE",  domain: "real_estate" },
  { code: "VIC", exchange: "HOSE",  domain: "real_estate" },
  { code: "VHM", exchange: "HOSE",  domain: "real_estate" },
  { code: "D2D", exchange: "HOSE",  domain: "real_estate" },
  // Steel
  { code: "HSG", exchange: "HOSE",  domain: "steel" },
  { code: "NKG", exchange: "HOSE",  domain: "steel" },
  // Aviation
  { code: "HVN", exchange: "HOSE",  domain: "aviation" },
  { code: "ACV", exchange: "UPCOM", domain: "aviation" },
  // Tech
  { code: "FPT", exchange: "HOSE",  domain: "tech" },
  { code: "SIS", exchange: "HOSE",  domain: "tech" },
  // Securities
  { code: "VCI", exchange: "HOSE",  domain: "securities" },
  { code: "VDC", exchange: "UPCOM", domain: "securities" },
  { code: "SSI", exchange: "HOSE",  domain: "securities" },
  { code: "HCM", exchange: "HOSE",  domain: "securities" },
  // Pharma
  { code: "DAG", exchange: "HOSE",  domain: "pharma" },
  { code: "DHG", exchange: "HOSE",  domain: "pharma" },
  // Utilities
  { code: "POW", exchange: "HOSE",  domain: "utilities" },
  { code: "PPC", exchange: "HOSE",  domain: "utilities" },
  { code: "JSH", exchange: "HNX",   domain: "utilities" },
  // Agriculture
  { code: "BDI", exchange: "HNX",   domain: "agriculture" },
  { code: "DLC", exchange: "UPCOM", domain: "agriculture" },
];

// ─────────────────────────────────────────────────────────────────────────────
// seedWatchlist
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upserts 30 watchlist tickers with default alert thresholds.
 * Uses ON CONFLICT(code) DO UPDATE to be idempotent.
 *
 * Default thresholds (from Sprint 054 user config):
 *   dropPct=-3, risePct=5, impactScore=5
 */
export function seedWatchlist(db: Database): void {
  const stmt = db.prepare(`
    INSERT INTO watchlist
      (code, exchange, domain, notes, added_at,
       alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new)
    VALUES (?, ?, ?, NULL, datetime('now'), -3, 5, 5, 1)
    ON CONFLICT(code) DO UPDATE SET
      exchange         = excluded.exchange,
      domain           = excluded.domain,
      alert_drop_pct   = excluded.alert_drop_pct,
      alert_rise_pct   = excluded.alert_rise_pct,
      alert_impact_min = excluded.alert_impact_min,
      alert_report_new = excluded.alert_report_new
  `);

  for (const entry of WATCHLIST_SEED) {
    stmt.run(entry.code, entry.exchange, entry.domain);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// backfillBctcQ4
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enqueues Q4 2025 BCTC fetch for all watchlist tickers that do not yet have a
 * financial_reports row for period_year=2025, period_type='Q4'.
 *
 * Uses INSERT OR IGNORE so existing queue entries are not overwritten.
 * The UNIQUE(action_code, period_year, period_quarter) constraint prevents
 * duplicates.
 */
export function backfillBctcQ4(db: Database): void {
  db.prepare(`
    INSERT OR IGNORE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, attempts)
    SELECT w.code, 2025, 'Q4', 'pending', 0
    FROM watchlist w
    WHERE w.code NOT IN (
      SELECT DISTINCT action_code
      FROM financial_reports
      WHERE period_year = 2025
        AND period_type = 'Q4'
    )
  `).run();
}
