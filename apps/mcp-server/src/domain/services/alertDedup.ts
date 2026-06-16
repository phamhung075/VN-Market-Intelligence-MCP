/**
 * Alert Deduplication — Task 131 + FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS
 *
 * Pure domain functions that compute stable fingerprints for alerts.
 *
 * `computeAlertFingerprint` — original hash-based fingerprint for the
 *   alert-generator / news / composite alert path.
 *
 * `computeScanAlertFingerprint` — lightweight composite key for the
 *   parallel scan write path (taAlertScanJob / bbAlertScanJob).
 *   Key = "scan:{ticker}:{alertType}:{YYYY-MM-DD}" (day bucket so the
 *   same condition within one calendar day collapses to one row via the
 *   DB-level UNIQUE(fingerprint) constraint — structurally unbypassable
 *   regardless of how many parallel scan jobs fire concurrently).
 *
 * Fingerprint = hash of:
 *   sorted(stocks).join(",") + "|" + sorted(signalTypes).join(",") + "|" + message.slice(0, 50)
 *
 * Uses a simple djb2-style hash (no crypto dependency in the domain layer).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * djb2 hash — fast, deterministic, no I/O.
 * Returns a hex string.
 */
function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    // Keep in 32-bit signed range
    hash |= 0;
  }
  // Convert to unsigned hex
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a stable fingerprint for an alert.
 *
 * Stocks and signalTypes are sorted before hashing so that order does not
 * affect the result (e.g. 4 RSS feeds producing the same alert in different
 * orders will generate identical fingerprints).
 *
 * @param alert - Candidate alert data.
 * @returns     - A deterministic hex string fingerprint.
 */
export function computeAlertFingerprint(alert: {
  stocks: string[];
  signalTypes: string[];
  message: string;
}): string {
  const stocksPart = [...alert.stocks].sort().join(",");
  const signalsPart = [...alert.signalTypes].sort().join(",");
  const messagePart = alert.message.slice(0, 50);

  const raw = `${stocksPart}|${signalsPart}|${messagePart}`;
  return djb2Hash(raw);
}

/**
 * Compute a deterministic per-day fingerprint for scan-job alerts.
 *
 * Used by taAlertScanJob and bbAlertScanJob to collapse identical conditions
 * (same ticker + same alert type) within the same calendar day into a single
 * DB row.  The UNIQUE(fingerprint) constraint on the `alerts` table makes this
 * structurally unbypassable: even when taAlertScanJob and bbAlertScanJob run
 * concurrently (via alertScanParallelJob), the second INSERT OR IGNORE is a
 * silent no-op — the 4h SQL cooldown check is kept as a first-pass filter for
 * cost reduction, but the fingerprint constraint is the authoritative gate.
 *
 * Key format: `scan:{ticker}:{alertType}:{YYYY-MM-DD}` (UTC day)
 *   - ticker    — stock code (e.g. "HVN")
 *   - alertType — signal type string (e.g. "ta_overbought", "ta_bb_breakout_up")
 *   - daySlot   — UTC calendar day ("YYYY-MM-DD") from the triggeredAt timestamp
 *
 * @param ticker    - Stock ticker code.
 * @param alertType - Signal/alert type string (no spaces, no pipes).
 * @param daySlot   - UTC day string "YYYY-MM-DD" (first 10 chars of an ISO timestamp).
 * @returns         - Deterministic fingerprint string.
 */
export function computeScanAlertFingerprint(
  ticker: string,
  alertType: string,
  daySlot: string,
): string {
  return `scan:${ticker}:${alertType}:${daySlot}`;
}
