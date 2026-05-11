/**
 * Alert Engine — Domain Services
 *
 * Pure domain logic: fingerprint computation, cooldown check, dedup check.
 * No I/O, no infrastructure imports.
 */

import type { AlertRequest, CooldownConfig, StoredAlert } from './models.js';
import { DEFAULT_COOLDOWN_CONFIG } from './models.js';

// ── Fingerprint (djb2 hash) ───────────────────────────────────────────────────

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash |= 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Compute a stable fingerprint for an alert.
 * stock + sorted(signalTypes) + message prefix (50 chars).
 */
export function computeFingerprint(alert: {
  stock: string;
  signalTypes?: string[];
  message: string;
}): string {
  const signalsPart = [...(alert.signalTypes ?? [])].sort().join(',');
  const messagePart = alert.message.slice(0, 50);
  const raw = `${alert.stock}|${signalsPart}|${messagePart}`;
  return djb2Hash(raw);
}

// ── Today helper ──────────────────────────────────────────────────────────────

function isToday(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// ── Cooldown check ────────────────────────────────────────────────────────────

/**
 * Returns true if the alert should be suppressed due to cooldown or daily cap.
 *
 * CRITICAL severity alerts bypass cooldown EXCEPT MACRO actionCode.
 */
export function shouldSuppressAlert(
  alert: AlertRequest,
  recentAlerts: StoredAlert[],
  config: CooldownConfig = DEFAULT_COOLDOWN_CONFIG,
): { suppress: boolean; reason: string } {
  if (alert.severity === 'critical' && alert.actionCode !== 'MACRO') {
    return { suppress: false, reason: 'critical severity bypasses cooldown' };
  }

  const now = Date.now();
  const cooldownMs = config.cooldownMinutes * 60_000;
  const signalTypes = alert.signalTypes ?? [];

  // Rule 1: cooldown window for same stock + signal overlap
  for (const recent of recentAlerts) {
    if (recent.stocks !== alert.stock) continue;
    const recentTs = new Date(recent.triggeredAt).getTime();
    if (now - recentTs > cooldownMs) continue;

    const recentTypes = recent.signalTypes.split(',').map((s) => s.trim());
    const hasOverlap =
      signalTypes.length === 0 || signalTypes.some((t) => recentTypes.includes(t));
    if (hasOverlap) {
      return {
        suppress: true,
        reason: `cooldown: same signal within ${config.cooldownMinutes}min`,
      };
    }
  }

  // Rule 2: daily cap
  const todayCount = recentAlerts.filter(
    (r) => r.stocks === alert.stock && isToday(r.triggeredAt),
  ).length;
  if (todayCount >= config.maxAlertsPerStockPerDay) {
    return {
      suppress: true,
      reason: `daily cap: ${todayCount}/${config.maxAlertsPerStockPerDay} alerts for ${alert.stock}`,
    };
  }

  return { suppress: false, reason: '' };
}

// ── Dedup check ───────────────────────────────────────────────────────────────

/**
 * Returns true if the fingerprint is a duplicate within the dedup window.
 */
export function isDuplicate(fingerprint: string, recentFingerprints: string[]): boolean {
  return recentFingerprints.includes(fingerprint);
}
