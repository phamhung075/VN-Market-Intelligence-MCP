/**
 * Alert Generator — Task 064
 *
 * Pure domain function that groups detected signals by stock code and
 * generates Alert records with escalated severity.
 *
 * Severity escalation rules:
 *   - 1 signal  → inherit the signal's own severity
 *   - 2 signals → escalate to "high"
 *   - 3+ signals → escalate to "critical"
 *
 * `generateAlerts` is a pure function (no I/O).
 * `storeAlerts`    is the infrastructure adapter that persists to SQLite.
 *
 * The `storeAlerts` function is exported from this file for convenience, but
 * it internally calls `getDb()` from infrastructure.  Domain code (e.g.
 * use-cases) that must stay pure should call `generateAlerts` only and pass
 * the result to a separate infrastructure layer.
 */

import type { Signal, Severity } from "./signalDetector.js";
import { isStockMuted } from "./alertMuteChecker.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A generated alert that aggregates one or more signals for a single stock.
 *
 * @property id          - UUID-style unique identifier
 * @property actionCode  - Stock ticker (e.g. "VCB")
 * @property signals     - The contributing Signal objects
 * @property severity    - Escalated severity: low | medium | high | critical
 * @property message     - Human-readable summary of all contributing signals
 * @property isRead      - Whether the alert has been acknowledged (default false)
 * @property createdAt   - ISO 8601 creation timestamp
 */
export interface Alert {
  id: string;
  actionCode: string;
  signals: Signal[];
  severity: Severity;
  message: string;
  isRead: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Severity rank used for comparison (higher = more severe). */
const SEVERITY_RANK: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/**
 * Determine the escalated severity for a group of signals.
 *
 * | Signal count | Severity        |
 * |--------------|-----------------|
 * | 1            | signal severity |
 * | 2            | high            |
 * | 3+           | critical        |
 */
function escalateSeverity(signals: Signal[]): Severity {
  if (signals.length >= 3) return "critical";
  if (signals.length === 2) return "high";
  // Single signal — use its own severity
  return signals[0]!.severity;
}

/**
 * Build a concise human-readable message that mentions the stock code and
 * every contributing signal type.
 *
 * Example (1 signal):
 *   "VCB alert: price_drop — VCB price_drop signal"
 *
 * Example (3 signals):
 *   "HPG alert [CRITICAL]: price_drop, volume_spike, news_mention — 3 signals detected"
 */
function buildMessage(actionCode: string, signals: Signal[], severity: Severity): string {
  const prefix = `${actionCode} alert`;
  const severityTag = severity === "critical" ? " [CRITICAL]" : severity === "high" ? " [HIGH]" : "";

  if (signals.length === 1) {
    return `${prefix}${severityTag}: ${signals[0]!.type} — ${signals[0]!.message}`;
  }

  // List unique signal types, then include the most informative message
  const uniqueTypes = [...new Set(signals.map((s) => s.type))].join(", ");
  // Pick the signal with the longest (most detailed) message
  const bestMessage = signals
    .slice()
    .sort((a, b) => b.message.length - a.message.length)[0]!.message;

  return `${prefix}${severityTag}: ${uniqueTypes} — ${bestMessage}`;
}

/**
 * Signal types that benefit from a deterministic per-hour bucket ID.
 *
 * For these market-price signals the same condition can persist across many
 * 15-minute cycles (e.g. SSI stays +5% for 2 hours), generating dozens of
 * duplicate rows with random IDs.  A bucket ID keyed on ticker + type + UTC
 * hour collapses all same-condition alerts within one hour into a single row
 * that INSERT OR IGNORE silently deduplicates.
 *
 * News and other event-driven signal types keep random IDs because each
 * article / event is genuinely distinct.
 */
const PRICE_SIGNAL_TYPES: ReadonlySet<string> = new Set([
  "price_surge",
  "price_drop",
  "volume_spike",
]);

/**
 * Generate a deterministic alert ID for price-movement signals.
 *
 * The key is `alert-{ticker}-{signalType}-{YYYY-MM-DDTHH}` (UTC hour slot).
 * This ensures the same ticker + same signal type within the same clock-hour
 * maps to one row that INSERT OR IGNORE collapses.
 *
 * @param actionCode - Ticker (e.g. "SSI")
 * @param signalType - Primary signal type driving the alert
 * @param detectedAt - ISO 8601 timestamp of the first signal in the group
 */
function deterministicPriceId(
  actionCode: string,
  signalType: string,
  detectedAt: string,
): string {
  const hourSlot = detectedAt.slice(0, 13); // "2026-04-08T04"
  return `alert-${actionCode}-${signalType}-${hourSlot}`;
}

/**
 * Generate a short unique ID using timestamp + random hex suffix.
 * Used for event-driven signals (news_mention, report_new, etc.) where each
 * event is genuinely distinct and should not be deduplicated by ID.
 */
function generateId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `alert-${ts}-${rnd}`;
}

/**
 * Choose an appropriate ID for an alert group.
 *
 * - If all signals are of a single price-movement type → deterministic bucket ID
 *   (collapses same condition within same UTC hour via INSERT OR IGNORE)
 * - Otherwise → random ID (news events, mixed groups, etc.)
 */
function chooseAlertId(actionCode: string, signals: Signal[]): string {
  const types = [...new Set(signals.map((s) => s.type))];
  if (types.length === 1 && PRICE_SIGNAL_TYPES.has(types[0]!)) {
    // Use the detectedAt of the first signal as the hour anchor
    const detectedAt = signals[0]!.detectedAt;
    return deterministicPriceId(actionCode, types[0]!, detectedAt);
  }
  return generateId();
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain function — pure, no I/O
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate Alert records from a list of detected signals.
 *
 * Only produces alerts for stocks present in `watchlist`.
 * Signals are grouped by `actionCode`; each group becomes one Alert.
 * Stocks with an active mute in `mutes` are silently skipped.
 *
 * @param signals   - Detected signals (from `detectSignals`)
 * @param watchlist - User's watchlist (only `actionCode` is required)
 * @param mutes     - Optional map of stock code → mute expiry Date (task 222)
 * @returns         - One Alert per watchlisted, non-muted stock that has signals
 */
export function generateAlerts(
  signals: Signal[],
  watchlist: { actionCode: string }[],
  mutes: Map<string, Date> = new Map(),
): Alert[] {
  if (signals.length === 0) return [];

  // Build a set of watchlisted codes for O(1) lookup
  const watchlistSet = new Set(watchlist.map((w) => w.actionCode));

  // Group signals by actionCode (watchlisted only, muted stocks skipped)
  const grouped = new Map<string, Signal[]>();
  for (const signal of signals) {
    if (!watchlistSet.has(signal.actionCode)) continue;
    if (isStockMuted(signal.actionCode, mutes)) continue;
    const existing = grouped.get(signal.actionCode);
    if (existing) {
      existing.push(signal);
    } else {
      grouped.set(signal.actionCode, [signal]);
    }
  }

  // Build one Alert per group
  const now = new Date().toISOString();
  const alerts: Alert[] = [];

  for (const [actionCode, groupSignals] of grouped) {
    const severity = escalateSeverity(groupSignals);
    alerts.push({
      id: chooseAlertId(actionCode, groupSignals),
      actionCode,
      signals: groupSignals,
      severity,
      message: buildMessage(actionCode, groupSignals, severity),
      isRead: false,
      createdAt: now,
    });
  }

  return alerts;
}

