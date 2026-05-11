/**
 * Alert Cooldown — Task 131
 *
 * Pure domain function that determines whether a new alert should be
 * suppressed based on:
 *   1. Same stock + signal type fired within the cooldown window
 *   2. Stock has already reached the maximum alerts per day
 *
 * CRITICAL severity alerts bypass the daily cap but are still suppressed on
 * signal-type overlap (to prevent composite duplicates — Task 1378).
 *
 * No I/O — accepts the recent-alert history as a plain array.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface CooldownConfig {
  /** Minutes to suppress same stock+signal combo. Default: 30 */
  cooldownMinutes: number;
  /** Max alerts per stock per day. Default: 5 */
  maxAlertsPerStockPerDay: number;
}

const DEFAULT_CONFIG: CooldownConfig = {
  cooldownMinutes: 30,
  maxAlertsPerStockPerDay: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if `isoDate` falls within today (local wall-clock midnight boundaries).
 */
function isToday(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decide whether the incoming alert should be suppressed.
 *
 * @param alert        - The candidate alert (stocks + signalTypes arrays).
 *                       CRITICAL severity alerts bypass the daily cap but NOT
 *                       signal-overlap suppression. A composite critical alert
 *                       that shares a sub-signal with a recently sent alert is
 *                       still suppressed (Task 1378 fix). MACRO alerts always
 *                       use the full cooldown including daily cap.
 * @param recentAlerts - Persisted alert history (any time range; function
 *                       filters internally by window / today).
 * @param config       - Cooldown settings. Falls back to DEFAULT_CONFIG.
 * @returns            - `true` to suppress, `false` to allow.
 */
export function shouldSuppressAlert(
  alert: { stocks: string[]; signalTypes: string[]; severity?: string; actionCode?: string },
  recentAlerts: Array<{ stocks: string; signalTypes: string; triggeredAt: string }>,
  config?: CooldownConfig,
): boolean {
  const cfg = config ?? DEFAULT_CONFIG;
  const now = Date.now();
  const cooldownMs = cfg.cooldownMinutes * 60_000;

  for (const stock of alert.stocks) {
    // ── Rule 1: cooldown window ─────────────────────────────────────────────
    for (const recent of recentAlerts) {
      if (recent.stocks !== stock) continue;
      const recentTs = new Date(recent.triggeredAt).getTime();
      const ageMs = now - recentTs;
      if (ageMs > cooldownMs) continue; // outside window

      // Check if any signal type overlaps
      const recentTypes = recent.signalTypes.split(",").map((s) => s.trim());
      const hasOverlap = alert.signalTypes.some((t) => recentTypes.includes(t));
      // Suppress when there is overlap — even for CRITICAL severity.
      // A composite critical alert that shares a sub-signal with an already-sent
      // alert is a duplicate, not a genuinely new event (Task 1378).
      // MACRO alerts are always subject to cooldown (pre-existing rule).
      if (hasOverlap) return true;
    }

    // ── CRITICAL bypass: only when no overlap found above ───────────────────
    // Non-MACRO critical alerts with genuinely new signal types always fire.
    if (alert.severity === "critical" && alert.actionCode !== "MACRO") continue;

    // ── Rule 2: daily cap ───────────────────────────────────────────────────
    const todayCount = recentAlerts.filter(
      (r) => r.stocks === stock && isToday(r.triggeredAt),
    ).length;
    if (todayCount >= cfg.maxAlertsPerStockPerDay) return true;
  }

  return false;
}
