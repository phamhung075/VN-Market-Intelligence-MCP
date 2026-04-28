/**
 * Alert Batch Grouper — Task 1395a
 *
 * Pure domain service that groups a flat list of Alert objects
 * by (signal_type, severity) within a single push-prices invocation.
 *
 * DDD compliance:
 *   - Imports only from domain (alertGenerator.ts → domain/services)
 *   - Zero imports from infrastructure/
 *   - No I/O, no DB. Pure transformation only.
 */

import type { Alert } from "./alertGenerator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertBatchGroup {
  /** Primary signal type — derived from alert.signals[0].type */
  signalType: string;
  severity: "high" | "critical";
  /** Ticker codes (alert.actionCode) in insertion order */
  tickers: string[];
  /** Alert IDs — used by server.ts to mark notified_telegram = 1 */
  alertIds: string[];
  /** Full alert.message of the first alert — used only when tickers.length === 1 */
  singleMessage: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verb and severity label tables
// ─────────────────────────────────────────────────────────────────────────────

const SIGNAL_VERB: Record<string, string> = {
  price_drop:    "giảm mạnh",
  price_surge:   "tăng mạnh",
  volume_spike:  "khối lượng đột biến",
  ta_overbought: "quá mua",
  ta_oversold:   "quá bán",
};

const SEV_LABEL: Record<string, string> = {
  critical: "NGHIÊM TRỌNG",
  high:     "QUAN TRỌNG",
};

// ─────────────────────────────────────────────────────────────────────────────
// Public functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Groups a flat list of Alert objects by (signal_type, severity)
 * within a single push-prices invocation (same-batch grouping).
 *
 * Pure function — no I/O, no DB.
 *
 * Key = `${alert.signals[0]?.type ?? "unknown"}::${alert.severity}`
 * Map preserves insertion order → deterministic for tests.
 *
 * @param alerts  Pre-filtered list (caller may pass any severity; grouper uses all).
 * @returns       Array of AlertBatchGroup, one per (signal_type, severity) pair.
 */
export function groupAlertsBySignalSeverity(alerts: Alert[]): AlertBatchGroup[] {
  const map = new Map<string, AlertBatchGroup>();

  for (const alert of alerts) {
    const signalType = alert.signals[0]?.type ?? "unknown";
    const key = `${signalType}::${alert.severity}`;

    const existing = map.get(key);
    if (existing !== undefined) {
      existing.tickers.push(alert.actionCode);
      existing.alertIds.push(alert.id);
    } else {
      map.set(key, {
        signalType,
        severity: alert.severity as "high" | "critical",
        tickers: [alert.actionCode],
        alertIds: [alert.id],
        singleMessage: alert.message,
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Formats one AlertBatchGroup into the Vietnamese Telegram string.
 *
 * - N=1: `[{SEV_LABEL}] {singleMessage}` (preserves original alert.message exactly)
 * - N>=2: `[{SEV_LABEL}] {signal_type} — {N} mã cùng {verb}\n  • {ticker1}, ticker2, ...`
 *   If N>10: first 10 tickers + ` (+{N-10} mã khác)`
 *
 * Pure function — no I/O.
 */
export function formatBatchGroupMessage(group: AlertBatchGroup): string {
  const label = SEV_LABEL[group.severity] ?? group.severity.toUpperCase();
  const n = group.tickers.length;

  if (n === 1) {
    return `[${label}] ${group.singleMessage}`;
  }

  const verb = SIGNAL_VERB[group.signalType] ?? "kích hoạt cảnh báo";
  const visibleTickers = group.tickers.slice(0, 10);
  const tickerLine =
    visibleTickers.join(", ") + (n > 10 ? ` (+${n - 10} mã khác)` : "");

  return `[${label}] ${group.signalType} — ${n} mã cùng ${verb}\n  • ${tickerLine}`;
}
