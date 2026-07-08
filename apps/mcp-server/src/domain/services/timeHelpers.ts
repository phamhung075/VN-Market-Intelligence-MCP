/**
 * Time Helpers — Vietnam Timezone Date Functions
 *
 * Pure date functions shared across application/usecases modules (assembleBriefing,
 * assembleEveningSummary, assembleAlertDigest). Centralizes VN-timezone date logic
 * that was previously duplicated verbatim across those three files
 * (FACTORY-APP-dedup-date-freshness-helpers).
 *
 * Layer: domain/services — pure functions, no I/O, no infrastructure imports.
 * Sibling to timeConstants.ts: that file is constants-only per its own header
 * ("Pure constants only — no functions") so date FUNCTIONS live here instead.
 */

import { VN_OFFSET_MS } from "./timeConstants.js";

/**
 * Returns midnight today in Vietnam timezone (UTC+7) as an ISO 8601 string
 * (in UTC, so e.g. "2026-03-27T17:00:00.000Z" for Vietnam date 2026-03-28).
 */
export function midnightVietnamAsUtc(): string {
  const now = new Date();
  // Shift to Vietnam clock
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
  // Construct midnight in Vietnam as UTC
  const midnight = new Date(
    Date.UTC(
      vnNow.getUTCFullYear(),
      vnNow.getUTCMonth(),
      vnNow.getUTCDate(),
      0,
      0,
      0,
      0,
    ) -
      VN_OFFSET_MS,
  );
  return midnight.toISOString();
}

/**
 * Returns today's date in Vietnam timezone as a YYYY-MM-DD string.
 */
export function todayVietnam(): string {
  const vnNow = new Date(new Date().getTime() + VN_OFFSET_MS);
  const y = vnNow.getUTCFullYear();
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(vnNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
