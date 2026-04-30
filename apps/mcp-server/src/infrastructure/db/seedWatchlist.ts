/**
 * seedWatchlist.ts — Task 1343a: Watchlist restore + Q4 2025 backfill
 *
 * Provides two idempotent functions:
 *   - seedWatchlist(db)     — inserts 25 tickers (10 sectors) via UPSERT
 *   - backfillBctcQ4(db)    — enqueues bctc_vps_queue for tickers missing Q4 2025
 *
 * Both functions are pure SQLite operations with no side effects beyond DB writes.
 * Safe to call multiple times (idempotent).
 *
 * Removed (stale/invalid — bgapidatafeed.vps.com.vn returns [] for all):
 *   VDC  — UPCOM securities  (delisted/inactive)
 *   BDI  — HNX agriculture   (Baltic Dry Index — not a VN stock, seed data error)
 *   DLC  — UPCOM agriculture (delisted/inactive)
 *   JSH  — HNX utilities     (delisted/inactive)
 *   SIS  — HOSE tech         (delisted/inactive)
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Watchlist seed data — 25 tickers, 10 sectors (Sprint 054 user config)
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
  // Agriculture / Rubber
  { code: "GVR", exchange: "HOSE",  domain: "agriculture" }, // Vietnam Rubber Group — cao su, not petroleum
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
  { code: "HPG", exchange: "HOSE",  domain: "steel" },
  { code: "HSG", exchange: "HOSE",  domain: "steel" },
  { code: "NKG", exchange: "HOSE",  domain: "steel" },
  // Aviation
  { code: "HVN", exchange: "HOSE",  domain: "aviation" },
  { code: "ACV", exchange: "UPCOM", domain: "aviation" },
  // Tech
  { code: "FPT", exchange: "HOSE",  domain: "tech" },
  // Securities
  { code: "VCI", exchange: "HOSE",  domain: "securities" },
  { code: "SSI", exchange: "HOSE",  domain: "securities" },
  { code: "HCM", exchange: "HOSE",  domain: "securities" },
  // Machinery
  { code: "DAG", exchange: "HOSE",  domain: "machinery" }, // Da Nang Rubber Group — industrial/machinery
  // Pharma
  { code: "DHG", exchange: "HOSE",  domain: "pharma" },
  // Utilities
  { code: "POW", exchange: "HOSE",  domain: "utilities" },
  { code: "PPC", exchange: "HOSE",  domain: "utilities" },
  // Agriculture — BDI (Baltic Dry Index) and DLC removed (not VN stocks or delisted)
];

// ─────────────────────────────────────────────────────────────────────────────
// seedWatchlist
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upserts 25 watchlist tickers with default alert thresholds.
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

// ─────────────────────────────────────────────────────────────────────────────
// backfillBctcQ1_2026
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Enqueues Q1 2026 BCTC fetch for all watchlist tickers that do not yet have a
 * financial_reports row for period_year=2026, period_type='Q1'.
 *
 * Task 1782: The detectTargetQuarter() gate in /api/bctc-fetch-queue returns
 * Q4-2025 for months 1–4, so Q1-2026 rows are never auto-seeded until May 1.
 * This backfill bypasses that gate and seeds Q1-2026 unconditionally at startup.
 *
 * Uses INSERT OR IGNORE so existing queue entries (in any status) are untouched.
 * The UNIQUE(action_code, period_year, period_quarter) constraint prevents duplicates.
 */
export function backfillBctcQ1_2026(db: Database): void {
  db.prepare(`
    INSERT OR IGNORE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, attempts)
    SELECT w.code, 2026, 'Q1', 'pending', 0
    FROM watchlist w
    WHERE w.code NOT IN (
      SELECT DISTINCT action_code
      FROM financial_reports
      WHERE period_year = 2026
        AND period_type = 'Q1'
    )
  `).run();
}

// ─────────────────────────────────────────────────────────────────────────────
// validateSeedTickers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Warns (via console.warn) for any seeded ticker that has no market_prices row.
 * Call once at startup after seedWatchlist() to surface bad seed data early.
 * Non-fatal — does not throw.
 */
export function validateSeedTickers(db: Database): void {
  const seedCodes = WATCHLIST_SEED.map((e) => e.code);
  const placeholders = seedCodes.map(() => "?").join(",");
  const missing = db.prepare(`
    SELECT code FROM watchlist
    WHERE code IN (${placeholders})
      AND code NOT IN (SELECT code FROM market_prices WHERE updated_at IS NOT NULL)
  `).all(...seedCodes) as { code: string }[];

  if (missing.length > 0) {
    const codes = missing.map((r) => r.code).join(", ");
    console.warn(
      `[seedWatchlist] WARN: ${missing.length} seeded ticker(s) have no market_prices data — ` +
      `possible delisted/inactive: ${codes}`
    );
  }
}
