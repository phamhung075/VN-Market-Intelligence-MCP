/**
 * Bond Maturity Tracker — Task 243
 *
 * Pure domain service that manages a calendar of corporate bond maturity dates
 * for Vietnamese real estate developers (TPDN BĐS).
 *
 * Design rules:
 * - Zero imports from infrastructure/ or application/ (DDD: domain-only)
 * - No I/O, no side effects, no async
 *
 * Alert thresholds:
 *   - Within 7 days  → CRITICAL signal
 *   - Within 14 days → HIGH signal
 *   - Within 30 days → MEDIUM signal
 */

import type { Signal } from "./signalDetector.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BondMaturityEvent {
  /** Company/issuer name */
  issuer: string;
  /** Stock ticker code, e.g. "NVL", "VHM" */
  issuerCode: string;
  /** Bond face value in billion VND */
  amount: number;
  /** ISO 8601 date of bond maturity, e.g. "2025-06-15" */
  maturityDate: string;
  /** Annual coupon rate in percent, e.g. 10.5 */
  couponRate: number;
  /** Lifecycle status */
  status: "upcoming" | "due" | "defaulted" | "extended";
  /**
   * DSI-S3 C3: true when this event comes from the static SEED_BONDS fallback
   * (DB is empty). Consumers MUST surface this flag — seed data is not
   * live-verified market data (coupons/amounts/dates are illustrative estimates).
   */
  static_seed?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Static seed data (DSI-S3 C3)
//
// These are illustrative estimates — coupons/amounts/dates are NOT live-verified.
// All entries carry static_seed: true. When the bond_maturity table is populated
// from a live source, this fallback should not be used (see bondMaturityTools.ts).
// ─────────────────────────────────────────────────────────────────────────────

const SEED_BONDS: BondMaturityEvent[] = [
  {
    issuer: "VinHomes JSC",
    issuerCode: "VHM",
    amount: 10000,
    maturityDate: "2027-12-31",
    couponRate: 10.0,
    status: "upcoming",
    static_seed: true,
  },
  {
    issuer: "Novaland JSC",
    issuerCode: "NVL",
    amount: 5000,
    maturityDate: "2026-09-15",
    couponRate: 10.5,
    status: "extended",
    static_seed: true,
  },
  {
    issuer: "Novaland JSC",
    issuerCode: "NVL",
    amount: 3000,
    maturityDate: "2027-09-30",
    couponRate: 11.0,
    status: "upcoming",
    static_seed: true,
  },
  {
    issuer: "Khang Dien House",
    issuerCode: "KDH",
    amount: 2000,
    maturityDate: "2027-06-30",
    couponRate: 9.0,
    status: "upcoming",
    static_seed: true,
  },
  {
    issuer: "Phat Dat Real Estate",
    issuerCode: "PDR",
    amount: 1500,
    maturityDate: "2027-08-15",
    couponRate: 11.5,
    status: "upcoming",
    static_seed: true,
  },
  {
    issuer: "DIC Corp",
    issuerCode: "DIG",
    amount: 1000,
    maturityDate: "2028-01-31",
    couponRate: 10.0,
    status: "upcoming",
    static_seed: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Alert thresholds
// ─────────────────────────────────────────────────────────────────────────────

const CRITICAL_DAYS = 7;
const HIGH_DAYS = 14;
const MEDIUM_DAYS = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get upcoming bond maturity events within the next `months` months.
 * Reads from the static seed data.
 *
 * @param months - Look-ahead window in months
 * @returns       - Filtered array of BondMaturityEvent sorted by maturityDate
 */
export function getUpcomingMaturities(months: number): BondMaturityEvent[] {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() + months);

  return SEED_BONDS
    .filter((bond) => {
      const maturity = new Date(bond.maturityDate);
      return maturity >= now && maturity <= cutoff;
    })
    .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));
}

/**
 * Check bond maturity events and generate Signal objects for imminent maturities.
 *
 * Alert thresholds: ≤7d → CRITICAL, ≤14d → HIGH, ≤30d → MEDIUM.
 * Skips bonds with status "defaulted" or "extended".
 *
 * @param events - Bond maturity events to evaluate
 * @returns       - Signal array (may be empty if no imminent maturities)
 */
export function checkMaturityAlerts(events: BondMaturityEvent[]): Signal[] {
  const signals: Signal[] = [];
  const now = new Date();
  const nowTs = now.getTime();
  const nowIso = now.toISOString();

  for (const event of events) {
    if (event.status === "defaulted" || event.status === "extended") continue;

    const maturityTs = new Date(event.maturityDate).getTime();
    const daysUntilMaturity = Math.ceil((maturityTs - nowTs) / (1000 * 60 * 60 * 24));

    if (daysUntilMaturity < 0) continue;

    let severity: Signal["severity"] | null = null;

    if (daysUntilMaturity <= CRITICAL_DAYS) {
      severity = "critical";
    } else if (daysUntilMaturity <= HIGH_DAYS) {
      severity = "high";
    } else if (daysUntilMaturity <= MEDIUM_DAYS) {
      severity = "medium";
    }

    if (!severity) continue;

    // DSI-S3 C3: append seed-data disclaimer when event comes from static fallback.
    const seedLabel = event.static_seed
      ? " [SEED DATA — không xác minh thị trường thực]"
      : "";
    signals.push({
      type: "bond_maturity" as Signal["type"],
      severity,
      actionCode: event.issuerCode,
      message: `[TPDN] ${event.issuer} (${event.issuerCode}) — ${event.amount.toLocaleString()} tỷ VND đáo hạn trong ${daysUntilMaturity} ngày (${event.maturityDate}), lãi ${event.couponRate}%/năm${seedLabel}`,
      confidence: event.static_seed ? 0.3 : 0.95,
      detectedAt: nowIso,
    });
  }

  return signals;
}
