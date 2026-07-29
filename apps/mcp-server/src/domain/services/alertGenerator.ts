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
import { computeGenericAlertFingerprint } from "./alertDedup.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A generated alert that aggregates one or more signals for a single stock.
 *
 * @property id              - UUID-style unique identifier
 * @property actionCode      - Stock ticker (e.g. "VCB")
 * @property signals         - The contributing Signal objects
 * @property severity        - Escalated severity: low | medium | high | critical
 * @property message         - Human-readable summary of all contributing signals
 * @property isRead          - Whether the alert has been acknowledged (default false)
 * @property createdAt       - ISO 8601 creation timestamp
 * @property confidence_score - (optional) 0–100 confidence from validation (Task 231)
 * @property validated_at    - (optional) ISO 8601 timestamp of validation (Task 231)
 */
export interface Alert {
  id: string;
  actionCode: string;
  signals: Signal[];
  severity: Severity;
  message: string;
  isRead: boolean;
  createdAt: string;
  confidence_score?: number;  // 0–100, from enriched signals
  validated_at?: string;      // ISO 8601, from enriched signals
  /** FU-ALERT-COWRITE-SCHEDULER-JOBS: optional dedup fingerprint written to alerts.fingerprint */
  fingerprint?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Severity rank used for comparison (higher = more severe). */
const SEVERITY_RANK: Record<Severity, number> = {
  low: 1,
  medium: 2,
  warning: 2,  // TA scan alerts use "warning" — same rank as medium
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
 */
const PRICE_SIGNAL_TYPES: ReadonlySet<string> = new Set([
  "price_surge",
  "price_drop",
  "volume_spike",
]);

/**
 * Generate a deterministic alert ID for price-movement signals.
 *
 * The key is `alert-{ticker}-{signalType}-{YYYY-MM-DDTHH4}` where H4 is the
 * UTC 4-hour bucket (00, 04, 08, 12, 16, 20). This ensures the same ticker +
 * same signal type within the same 4-hour window maps to one row that
 * INSERT OR IGNORE collapses — suppressing duplicate alerts for sustained
 * moves (e.g. VHM stays +5% for 8h → max 2 alerts instead of 8).
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
  const hourStr = detectedAt.slice(11, 13); // "04" from "2026-04-08T04:..."
  const bucket4h = String(Math.floor(parseInt(hourStr, 10) / 4) * 4).padStart(2, "0");
  const dateSlot = detectedAt.slice(0, 11) + bucket4h; // "2026-04-08T04"
  return `alert-${actionCode}-${signalType}-${dateSlot}`;
}

/**
 * Generate a deterministic alert ID for news_mention signals.
 *
 * News alerts generated from the same article + same stock within the same
 * UTC day must collapse into a single row, even when the server restarts or
 * the RSS feed returns the same article with a different URL (Google News
 * tracking params change between fetches).
 *
 * Key: `alert-news-{ticker}-{daySlot}-{titleFp}`
 *   - daySlot = first 10 chars of detectedAt ("2026-04-08")
 *   - titleFp = first 32 chars of message, lowercased, whitespace-collapsed,
 *               non-alphanumeric stripped — a stable title fingerprint
 *
 * This prevents duplicate alerts after server restart when the same article
 * is re-processed with a new URL (report #1114).
 *
 * @param actionCode - Ticker (e.g. "VCB")
 * @param message    - Signal message (starts with the article title)
 * @param detectedAt - ISO 8601 timestamp of the signal
 */
function deterministicNewsId(
  actionCode: string,
  message: string,
  detectedAt: string,
): string {
  const daySlot = detectedAt.slice(0, 10); // "2026-04-08"
  // Stable fingerprint: lowercase, collapse whitespace, keep alphanumeric only, take first 32 chars
  const titleFp = message
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .slice(0, 32)
    .replace(/\s/g, "-");
  return `alert-news-${actionCode}-${daySlot}-${titleFp}`;
}

/**
 * Generate a short unique ID using timestamp + random hex suffix.
 * Used for event-driven signals that are genuinely distinct (report_new, etc.).
 */
function generateId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `alert-${ts}-${rnd}`;
}

/**
 * Choose an appropriate ID for an alert group.
 *
 * - Single price-movement type → deterministic hour-bucket ID
 * - Single news_mention type → deterministic day-bucket ID keyed on title fingerprint
 *   (prevents duplicate alerts after server restart when same article re-processed)
 * - Otherwise → random ID
 */
function chooseAlertId(actionCode: string, signals: Signal[]): string {
  const types = [...new Set(signals.map((s) => s.type))];
  if (types.length === 1 && PRICE_SIGNAL_TYPES.has(types[0]!)) {
    // Use the detectedAt of the first signal as the hour anchor
    const detectedAt = signals[0]!.detectedAt;
    return deterministicPriceId(actionCode, types[0]!, detectedAt);
  }
  if (types.length === 1 && types[0] === "news_mention") {
    // Use the highest-confidence signal's message as the title fingerprint anchor
    const best = signals.slice().sort((a, b) => b.confidence - a.confidence)[0]!;
    return deterministicNewsId(actionCode, best.message, best.detectedAt);
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

    // Extract validation fields from signals (Task 231)
    // Use the highest confidence_score and most recent validated_at from any signal
    let confidence_score: number | undefined;
    let validated_at: string | undefined;

    for (const sig of groupSignals) {
      if (sig.confidence_score !== undefined) {
        if (confidence_score === undefined || sig.confidence_score > confidence_score) {
          confidence_score = sig.confidence_score;
        }
      }
      if (sig.validated_at !== undefined) {
        if (validated_at === undefined || sig.validated_at > validated_at) {
          validated_at = sig.validated_at;
        }
      }
    }

    const message = buildMessage(actionCode, groupSignals, severity);

    const alert: Alert = {
      id: chooseAlertId(actionCode, groupSignals),
      actionCode,
      signals: groupSignals,
      severity,
      message,
      isRead: false,
      createdAt: now,
      // FIX-AGENT-SIGNALS-IDENTICAL-DUP-EMISSION: set unconditionally (not just
      // for the chooseAlertId "otherwise" fallback branch) — for the two
      // already-deterministic-id branches (price/news_mention) this is
      // redundant-but-harmless (id already collapses repeats via a WIDER
      // bucket); for the fallback branch this is the ONLY dedup protection
      // against a re-entrant scheduler double-fire (see
      // computeGenericAlertFingerprint doc for full rationale).
      fingerprint: computeGenericAlertFingerprint(
        actionCode,
        groupSignals.map((s) => s.type),
        message,
        groupSignals[0]?.detectedAt ?? now,
      ),
    };

    // Add validation fields if present in signals
    if (confidence_score !== undefined) alert.confidence_score = confidence_score;
    if (validated_at !== undefined) alert.validated_at = validated_at;

    alerts.push(alert);
  }

  return alerts;
}

