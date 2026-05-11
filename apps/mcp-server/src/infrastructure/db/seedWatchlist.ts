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
import { sqlInClause } from "./sqlHelpers.js";

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
// migrateWatchlistThresholds — Task 1869b-seed
// ─────────────────────────────────────────────────────────────────────────────

/**
 * High-volatility tickers that receive a wider drop threshold (-9.0).
 * All other watchlist rows receive the standard threshold (-7.0).
 *
 * Selection rationale: real-estate / retail sectors with historical
 * daily std-dev > 2σ of watchlist average (see handoff 1869b-seed).
 */
export const HIGH_VOL_TICKERS = [
  "NVL", "DPM", "REE", "VNH", "KBC", "MWG", "TCH",
] as const;

export const STANDARD_DROP_PCT = -7.0;
export const HIGH_VOL_DROP_PCT = -9.0;

/**
 * Migrates watchlist alert_drop_pct defaults (Task 1869b-seed).
 *
 * - Sets alert_drop_pct = -9.0 for HIGH_VOL_TICKERS.
 * - Sets alert_drop_pct = -7.0 for all other rows where value is NULL or
 *   still at the old schema default (-3).
 *
 * Idempotent: rows already at -7.0 or -9.0 are left untouched by the
 * WHERE guard (only NULL / -3 rows are updated for standard tier).
 * The high-vol UPDATE is also idempotent — re-running writes the same value.
 *
 * Returns { standard, highVol } counts of rows actually updated.
 */
export function migrateWatchlistThresholds(db: Database): {
  standard: number;
  highVol: number;
} {
  // Step 1: set standard tier — only rows still at old default (-3) or NULL
  const standardResult = db
    .prepare(
      `UPDATE watchlist
          SET alert_drop_pct = ${STANDARD_DROP_PCT}
        WHERE (alert_drop_pct IS NULL OR alert_drop_pct = -3)
          AND code NOT IN (${HIGH_VOL_TICKERS.map(() => "?").join(", ")})`
    )
    .run(...HIGH_VOL_TICKERS);

  // Step 2: set high-vol tier unconditionally (idempotent — same value each run)
  const highVolResult = db
    .prepare(
      `UPDATE watchlist
          SET alert_drop_pct = ${HIGH_VOL_DROP_PCT}
        WHERE code IN (${HIGH_VOL_TICKERS.map(() => "?").join(", ")})`
    )
    .run(...HIGH_VOL_TICKERS);

  return {
    standard: standardResult.changes,
    highVol: highVolResult.changes,
  };
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
  const placeholders = sqlInClause(seedCodes.length);
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
