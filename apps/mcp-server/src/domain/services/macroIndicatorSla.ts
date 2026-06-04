/**
 * Domain Service — Macro Indicator Freshness SLA Checker
 *
 * Pure business logic for checking SLA breach on macro indicator data freshness.
 * Validates data age against 24-hour SLA window.
 *
 * Task 239: Detects when macro data exceeds age threshold and escalates.
 *
 * @module domain/services/macroIndicatorSla
 */

import type { Database } from "bun:sqlite";

/**
 * Single SSOT country key for macro_indicators rows written by the active
 * refresh job (macroIndicatorRefreshJob.ts:242).
 *
 * DSI-S1-SLA: Previously this file queried 'VN' while the writer wrote 'vietnam',
 * making the SLA guard permanently blind since commit 7a0adfdc (2026-05-17).
 * ALL query sites in this file MUST use this constant — never the bare literal 'VN'.
 */
const MACRO_COUNTRY_KEY = "vietnam";

/**
 * Result of checking macro data freshness SLA.
 */
export interface MacroSlaCheckResult {
  isOk: boolean;
  ageHours: number;
  thresholdHours: number;
}

/**
 * Checks macro_indicators data freshness against 24-hour SLA.
 *
 * @param db SQLite database connection
 * @param sendTelegram Optional callback to send alerts on SLA breach
 * @returns true if data is fresh (age ≤ 24h), false if stale
 */
export async function freshnessSlaChecker(
  db: Database,
  sendTelegram?: (channel: string, message: string, options?: { tag?: string }) => Promise<void>,
): Promise<boolean> {
  const row = db
    .prepare("SELECT fetched_at FROM macro_indicators WHERE country = ?")
    .get(MACRO_COUNTRY_KEY) as { fetched_at: string } | undefined;

  if (!row || !row.fetched_at) {
    return false; // No data at all
  }

  const fetchedAtMs = new Date(row.fetched_at).getTime();
  const nowMs = Date.now();
  const ageMs = nowMs - fetchedAtMs;
  const ageHours = Math.round(ageMs / (1000 * 60 * 60));
  const thresholdHours = 24;

  if (ageHours <= thresholdHours) {
    return true; // Data is fresh
  }

  // SLA breach — alert
  if (sendTelegram) {
    const message = `Macro data [${ageHours} hours] stale — refresh failed`;
    await sendTelegram("work", message);
  }

  return false;
}

/**
 * Detects stale macro data on startup and sends alert if needed.
 *
 * @param db SQLite database connection
 * @param sendTelegram Optional callback to send startup alerts
 */
export async function detectStartupStaleData(
  db: Database,
  sendTelegram?: (channel: string, message: string, options?: { tag?: string }) => Promise<void>,
): Promise<void> {
  const row = db
    .prepare("SELECT fetched_at FROM macro_indicators WHERE country = ?")
    .get(MACRO_COUNTRY_KEY) as { fetched_at: string } | undefined;

  if (!row || !row.fetched_at) {
    return; // No data to check
  }

  const fetchedAtMs = new Date(row.fetched_at).getTime();
  const nowMs = Date.now();
  const ageMs = nowMs - fetchedAtMs;
  const ageHours = Math.round(ageMs / (1000 * 60 * 60));

  if (ageHours > 24) {
    if (sendTelegram) {
      const message = `Macro data STALE [${ageHours} hours old] — manual intervention needed`;
      await sendTelegram("work", message, { tag: "STALE" });
    }
  }
}
