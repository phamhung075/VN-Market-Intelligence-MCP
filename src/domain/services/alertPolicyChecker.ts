/**
 * Alert Policy Checker — pure domain functions, no I/O.
 *
 * Implements the two narrowed alert firing rules for Sprint 054:
 *   1. position-danger  — 3-AND gate
 *   2. watchlist-opportunity — 4-AND gate
 *
 * All thresholds are injected via the `thresholds` field so callers
 * can read them from mcp.config.json alertPolicy section.
 *
 * @module domain/services/alertPolicyChecker
 */

// ─────────────────────────────────────────────────────────────────────────────
// Input interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface PositionDangerInput {
  /** Whether current price has crossed below the computed stop-loss level. */
  stopLossHit: boolean;
  /**
   * Intraday price drop as a positive percentage (e.g. 5.2 = 5.2% drop).
   * Pass the absolute value — the checker applies >= comparison internally.
   */
  singleDayDropPct: number;
  /** Aggregated news sentiment score in range [-1.0, 1.0]. */
  newsSentiment: number;
  /** Thresholds sourced from mcp.config.json alertPolicy.positionDanger. */
  thresholds: {
    /** Minimum single-session drop (%) required to fire. Default: 5.0 */
    singleDayDropPct: number;
    /** Maximum (most negative) news sentiment required to fire. Default: -0.5 */
    newsSentimentThreshold: number;
  };
}

export interface WatchlistOpportunityInput {
  /** Kinh Dich hexagram confidence score 0–100. */
  kinhDichConfidence: number;
  /** Kinh Dich signal: "BUY" | "SELL" | "NEUTRAL". */
  kinhDichSignal: string;
  /** Aggregated news sentiment score in range [-1.0, 1.0]. */
  newsSentiment: number;
  /** Majority vote from agent signals: "BUY" | "SELL" | "NEUTRAL". */
  agentSignalsMajority: string;
  /** Thresholds sourced from mcp.config.json alertPolicy.watchlistOpportunity. */
  thresholds: {
    /** Minimum Kinh Dich confidence required. Default: 70 */
    kinhDichConfidenceMin: number;
    /** Minimum news sentiment required (inclusive). Default: 0.3 */
    newsSentimentMin: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Result interface
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertCheckResult {
  /** Whether all required conditions were met and the alert should fire. */
  fire: boolean;
  /**
   * Human-readable reason string listing each condition that fired.
   * Only present when fire=true.
   */
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// checkPositionDanger — 3-AND gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns `{ fire: true }` ONLY when ALL THREE conditions are simultaneously met:
 *   1. `stopLossHit === true`
 *   2. `singleDayDropPct >= thresholds.singleDayDropPct`
 *   3. `newsSentiment <= thresholds.newsSentimentThreshold`
 *
 * Any single failing condition → `{ fire: false }`.
 *
 * Pure function — no I/O, no side effects.
 */
export function checkPositionDanger(input: PositionDangerInput): AlertCheckResult {
  const { stopLossHit, singleDayDropPct, newsSentiment, thresholds } = input;

  const cond1 = stopLossHit;
  const cond2 = singleDayDropPct >= thresholds.singleDayDropPct;
  const cond3 = newsSentiment <= thresholds.newsSentimentThreshold;

  if (cond1 && cond2 && cond3) {
    const reason = [
      `stop-loss hit`,
      `single-day drop ${singleDayDropPct.toFixed(1)}% >= ${thresholds.singleDayDropPct}%`,
      `news sentiment ${newsSentiment.toFixed(2)} <= ${thresholds.newsSentimentThreshold}`,
    ].join("; ");
    return { fire: true, reason };
  }

  return { fire: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// checkWatchlistOpportunity — 4-AND gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns `{ fire: true }` ONLY when ALL FOUR conditions are simultaneously met:
 *   1. `kinhDichConfidence >= thresholds.kinhDichConfidenceMin`
 *   2. `kinhDichSignal === "BUY"`
 *   3. `newsSentiment >= thresholds.newsSentimentMin`
 *   4. `agentSignalsMajority === "BUY"`
 *
 * Any single failing condition → `{ fire: false }`.
 *
 * Pure function — no I/O, no side effects.
 */
export function checkWatchlistOpportunity(input: WatchlistOpportunityInput): AlertCheckResult {
  const { kinhDichConfidence, kinhDichSignal, newsSentiment, agentSignalsMajority, thresholds } = input;

  const cond1 = kinhDichConfidence >= thresholds.kinhDichConfidenceMin;
  const cond2 = kinhDichSignal === "BUY";
  const cond3 = newsSentiment >= thresholds.newsSentimentMin;
  const cond4 = agentSignalsMajority === "BUY";

  if (cond1 && cond2 && cond3 && cond4) {
    const reason = [
      `Kinh Dich confidence ${kinhDichConfidence}% >= ${thresholds.kinhDichConfidenceMin}%`,
      `Kinh Dich signal = BUY`,
      `news sentiment ${newsSentiment.toFixed(2)} >= ${thresholds.newsSentimentMin}`,
      `agent signals majority = BUY`,
    ].join("; ");
    return { fire: true, reason };
  }

  return { fire: false };
}
