/**
 * OHLCV Gap Classifier — domain service
 *
 * FIX-OHLCV-DEPTH-ALERT-HONEST-GAP-SUPPRESS (2026-07-17)
 *
 * Distinguishes a genuine (recoverable) OHLCV depth shortfall from an "honest
 * gap" — a ticker that can NEVER reach the backfill target depth because it is
 * permanently empty / long-delisted / never actually listed (RAW-verified
 * example set: BDI, DLC, JSH, SIS, VDC — 0 bars ever or a last bar years old).
 * Both the scheduler's own depth-gap re-queue trigger
 * (scheduler/market-data/ohlcvHistoryBackfillJob.ts) and the VPS backfill-done
 * handler's depth-shortfall re-queue (interface/mcp/routes/ohlcvBackfillHandler.ts)
 * were re-triggering the VPS backfill queue forever for these codes — they can
 * never reach the depth floor, so the trigger (and the retry-cap escalation
 * riding on top of it) fired on every single cron/poll cycle.
 *
 * Confirmed-empty-fetch-count proxy: neither call site has a per-ticker fetch
 * attempt log (the actual TCBS fetch happens out-of-band on the VPS, not in
 * this process), so staleness of the most recent bar stands in for "N
 * confirmed-empty fetches" — many backfill cycles run per day, so a code with
 * zero bars ever, or whose newest bar predates HONEST_GAP_STALE_DAYS, has
 * already been given far more than N chances to receive fresh data and never
 * has. This is fully data-driven — NEVER hardcode a ticker list. A code stops
 * being classified honest-gap the moment fresh bars actually arrive (maxDate
 * advances back inside the staleness window).
 *
 * Pure function — no I/O, no logging, no external dependencies (DDD:
 * domain/services). Callers own the DB query that supplies { count, maxDate }
 * per code and apply this predicate to filter/exclude candidates.
 *
 * NOTE: callers must NOT apply this predicate to VNINDEX — the benchmark
 * index is a mandatory, always-traded ticker; a 0-bar or stale VNINDEX is
 * never a legitimate "honest gap," it is a genuine pipeline failure signal.
 */

/** Number of days without a fresh bar before a nonzero-count code is treated as an honest gap. */
export const HONEST_GAP_STALE_DAYS = 30;

export interface CodeDepthInfo {
  /** Total bar count for the code in daily_ohlcv */
  count: number;
  /** Most recent bar date ("YYYY-MM-DD"), or null when count === 0 */
  maxDate: string | null;
}

/**
 * @param info     { count, maxDate } for one code from daily_ohlcv
 * @param todayIso "YYYY-MM-DD" reference date (caller-supplied so this stays pure/testable)
 * @returns true when the code should be treated as a permanently-empty / long-delisted
 *          "honest gap" that will never reach a depth target — false for a genuine,
 *          still-recoverable shortfall.
 */
export function isHonestGapCode(info: CodeDepthInfo, todayIso: string): boolean {
  // Never listed / never received a single bar — immediate honest gap.
  if (info.count === 0 || !info.maxDate) return true;

  const staleBoundary = new Date(`${todayIso}T00:00:00Z`);
  staleBoundary.setUTCDate(staleBoundary.getUTCDate() - HONEST_GAP_STALE_DAYS);
  const staleBoundaryIso = staleBoundary.toISOString().slice(0, 10);

  // Has bars, but the newest one predates the staleness window — confirmed
  // empty across many backfill cycles since (delisted/suspended class).
  return info.maxDate < staleBoundaryIso;
}
