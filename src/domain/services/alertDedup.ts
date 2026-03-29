/**
 * Alert Deduplication — Task 131
 *
 * Pure domain function that computes a stable fingerprint for an alert.
 * Before storing a new alert, callers compare the fingerprint against those
 * stored in the last 60 minutes; if a match is found the alert is a duplicate
 * and should be discarded.
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
