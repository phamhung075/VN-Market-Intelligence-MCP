/**
 * OHLCV Continuity Guard — domain service
 *
 * Task FIX-OHLCV-CORP-ACTION-CONTINUITY (P2, parent FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0
 * Class 4 — docs/handoffs/FIX-OHLCV-SEED-CANDLE-behavioral-gate-2026-06-16-RED.md).
 *
 * Detects an adjusted-vs-unadjusted price discontinuity at a corporate-action
 * boundary: a bar-to-bar |move| that exceeds the instrument's daily board
 * price limit. VN exchanges enforce the board limit intraday, so a realized
 * close-to-close move beyond (limit + small rounding tolerance) is impossible
 * under normal trading — it can only arise from (a) an ex-div/ex-rights price
 * adjustment stitched onto unadjusted history, or (b) bad/contaminated data.
 * A legitimate limit-day move is, by construction, within the board limit and
 * is NOT flagged by this guard.
 *
 * Distinct from ohlcvUnitGuard.ts's detectAndNormalizeScaleFromPrevClose,
 * which targets a much larger threshold (SCALE_DETECTION_RATIO = 50x, i.e.
 * ~5000%) meant to catch ×1000/÷1000 unit-scale corruption. This guard
 * targets the far smaller per-board percentage limit (7-15%) meant to catch
 * corp-action discontinuities and other implausible-but-not-scale-magnitude
 * jumps that the scale guard is not designed to see.
 *
 * Pure functions — no I/O, no logging, no external dependencies.
 * Callers (application/usecases, scheduler) are responsible for persistence,
 * telemetry, and any BUG-channel notification.
 *
 * DDD layer: domain/services (no infrastructure imports allowed)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Board limits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Real per-exchange VN daily board price-move limits (decimal, e.g. 0.07 = ±7%).
 * Resolved GENERICALLY from the instrument's listing exchange — never a single
 * hardcoded value applied across all tickers.
 */
export const BOARD_LIMIT_PCT: Readonly<Record<string, number>> = {
  HOSE: 0.07,
  HNX: 0.10,
  UPCOM: 0.15,
};

/**
 * Fallback board limit for an unrecognized/missing exchange code — the
 * WIDEST real VN board limit (UPCOM 15%). Widest-fallback is deliberate:
 * it minimizes false-positive discontinuity flags for a ticker whose
 * exchange could not be resolved, at the cost of being slightly less
 * sensitive (never the reverse — under-flagging a real corp-action
 * boundary is safer than the guard silently no-op'ing).
 */
export const DEFAULT_BOARD_LIMIT_PCT = 0.15;

/**
 * Small tolerance added on top of the raw board limit to absorb VND-lot
 * tick-rounding at the exchange (the limit price is rounded to the nearest
 * trading tick, so a legitimate limit-day close can land a fraction of a
 * percentage point beyond the exact mathematical limit). Real corp-action
 * gaps are typically double-digit percent and clear this easily.
 */
export const LIMIT_MOVE_TOLERANCE_PCT = 0.005; // 0.5 percentage point

/**
 * Resolves the real daily board price-move limit for a given exchange code.
 * Case-insensitive, whitespace-tolerant. Unknown/missing exchange falls back
 * to DEFAULT_BOARD_LIMIT_PCT (see doc comment above for why widest-fallback).
 */
export function resolveBoardLimitPct(exchange: string | null | undefined): number {
  if (!exchange) return DEFAULT_BOARD_LIMIT_PCT;
  const key = exchange.trim().toUpperCase();
  return BOARD_LIMIT_PCT[key] ?? DEFAULT_BOARD_LIMIT_PCT;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal OHLCV bar shape used by this guard (single ticker, one calendar day). */
export interface OhlcvBar {
  code: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BoundaryDiscontinuity {
  code: string;
  /** Date of the LATER (boundary) bar being evaluated */
  date: string;
  prevDate: string;
  prevClose: number;
  close: number;
  /** Signed decimal day-over-day close move, e.g. -0.2487 for -24.87% */
  movePct: number;
  boardLimitPct: number;
  /** |movePct| - (boardLimitPct + tolerance), 0 when not flagged */
  exceedsBy: number;
  flagged: boolean;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// detectBoundaryDiscontinuity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure adjacent-bar check: compares the day-over-day close move against the
 * instrument's board limit (+ small rounding tolerance).
 *
 * @param prev     Previous bar (only date + close are read)
 * @param bar      Current (later) bar being evaluated
 * @param exchange Listing exchange code (e.g. "HOSE") — resolves the real limit
 */
export function detectBoundaryDiscontinuity(
  prev: Pick<OhlcvBar, "date" | "close">,
  bar: OhlcvBar,
  exchange: string | null | undefined,
): BoundaryDiscontinuity {
  const boardLimitPct = resolveBoardLimitPct(exchange);
  const threshold = boardLimitPct + LIMIT_MOVE_TOLERANCE_PCT;

  if (!prev.close || prev.close <= 0 || !bar.close || bar.close <= 0) {
    return {
      code: bar.code,
      date: bar.date,
      prevDate: prev.date,
      prevClose: prev.close,
      close: bar.close,
      movePct: 0,
      boardLimitPct,
      exceedsBy: 0,
      flagged: false,
      reason: "skip: missing or non-positive prev/current close",
    };
  }

  const movePct = (bar.close - prev.close) / prev.close;
  const absMove = Math.abs(movePct);
  const flagged = absMove > threshold;

  const reason = flagged
    ? `corp_action_boundary_candidate: ${bar.code} ${prev.date}->${bar.date} move=${(movePct * 100).toFixed(2)}% ` +
      `exceeds board limit ±${(boardLimitPct * 100).toFixed(0)}% (+${(LIMIT_MOVE_TOLERANCE_PCT * 100).toFixed(1)}pp tolerance)`
    : undefined;

  return {
    code: bar.code,
    date: bar.date,
    prevDate: prev.date,
    prevClose: prev.close,
    close: bar.close,
    movePct,
    boardLimitPct,
    exceedsBy: flagged ? absMove - threshold : 0,
    flagged,
    // exactOptionalPropertyTypes: only include `reason` when it has a value —
    // an explicit `reason: undefined` is not assignable to an optional string field.
    ...(reason !== undefined ? { reason } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// scanOhlcvContinuity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scans a chronological OHLCV series (ascending by date, single ticker) and
 * returns one BoundaryDiscontinuity result per adjacent pair (n-1 results for
 * n bars). Only `flagged: true` entries represent candidate discontinuities.
 */
export function scanOhlcvContinuity(
  bars: readonly OhlcvBar[],
  exchange: string | null | undefined,
): BoundaryDiscontinuity[] {
  const results: BoundaryDiscontinuity[] = [];
  for (let i = 1; i < bars.length; i++) {
    results.push(detectBoundaryDiscontinuity(bars[i - 1]!, bars[i]!, exchange));
  }
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// reconcileOrFlagBoundary
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconcileOptions {
  /**
   * A known adjustment factor for the boundary (e.g. sourced from a future
   * corp-action calendar / split-dividend ratio feed): postClose = preClose * factor.
   * When supplied and > 0, the discontinuity is RECONCILED — every bar strictly
   * before the boundary date is rescaled by this factor so the whole series is
   * continuous in the post-adjustment unit — instead of flagged.
   */
  knownAdjustmentFactor?: number;
}

export interface ReconcileResult {
  action: "reconciled" | "flagged";
  /** Present only when action === "reconciled": full series with the factor applied to pre-boundary bars */
  adjustedBars?: OhlcvBar[];
  /** Present only when action === "flagged": the boundary bar the caller must treat as suspect */
  suspectBar?: OhlcvBar;
  discontinuity: BoundaryDiscontinuity;
}

/**
 * Given a detected boundary discontinuity and the full chronological series,
 * either RECONCILE (when a known split/dividend adjustment factor is
 * supplied) or FLAG the boundary bar as suspect — the caller MUST exclude a
 * flagged bar from being served as a clean bar downstream (never serve a
 * false/discontinuous bar per /goal#1).
 *
 * No adjustment factor is derivable from `daily_ohlcv` alone today — no
 * corp-action calendar is wired into this pipeline yet. flag+exclude is
 * therefore the live default path; the reconcile branch exists as the
 * extension point so a future corp-action data source can plug in a real
 * factor without touching the detector or any caller.
 */
export function reconcileOrFlagBoundary(
  bars: readonly OhlcvBar[],
  discontinuity: BoundaryDiscontinuity,
  options?: ReconcileOptions,
): ReconcileResult {
  const factor = options?.knownAdjustmentFactor;

  if (factor !== undefined && factor > 0) {
    const adjustedBars = bars.map((b) => {
      if (b.date >= discontinuity.date) return b; // boundary bar onward: already the post-adjustment unit
      return {
        ...b,
        open: b.open * factor,
        high: b.high * factor,
        low: b.low * factor,
        close: b.close * factor,
      };
    });
    return { action: "reconciled", adjustedBars, discontinuity };
  }

  const suspectBar = bars.find((b) => b.date === discontinuity.date);
  // exactOptionalPropertyTypes: only include `suspectBar` when found.
  return {
    action: "flagged",
    ...(suspectBar !== undefined ? { suspectBar } : {}),
    discontinuity,
  };
}
