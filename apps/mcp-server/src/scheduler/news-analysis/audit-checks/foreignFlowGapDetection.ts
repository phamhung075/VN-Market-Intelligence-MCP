/**
 * Pure VN-trading-day gap-day finder for checkForeignFlowGap.ts (D-NEW4,
 * FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL). Extracted
 * out of checkForeignFlowGap.ts (FIX-CI-SIZELINT-CHECKFOREIGNFLOWGAP-NEW-
 * OFFENDER-181L) to keep both files under the 120L size-lint cap — see that
 * file's header for the full root-cause narrative and why this detector
 * exists; checkForeignFlowGap re-exports findForeignFlowGapDays so the
 * public import path is unchanged for existing callers/tests.
 *
 * Uses the canonical VN trading-calendar module (vnTradingCalendar.ts,
 * holiday-aware) rather than a naive weekday check — matches
 * scripts/check-foreign-flow-freshness.sh's own LCTS convention and avoids
 * the weekend/holiday-blind false-positive class documented in
 * ALPHA-S1-STARTUP-CANDLE-GUARD.
 *
 * Layer: infrastructure/scheduler
 * DDD rules: may import from infrastructure/ and domain/; must not import
 * from application/ or interface/.
 */

import { Database } from "bun:sqlite";
import { isVnTradingDay, shiftDateDays } from "../../../domain/services/vnTradingCalendar.js";

// ─────────────────────────────────────────────────────────────────────────────
// Safety caps
// ─────────────────────────────────────────────────────────────────────────────

/** Never scan further back than this even if daily_foreign_flow has old history. */
export const MAX_LOOKBACK_DAYS = 60;
/** Process at most this many gap days per invocation (oldest-first) — mirrors
 *  checkConvictionHistoryGap's MAX_GAP_DAYS_PER_RUN convention. */
export const MAX_GAP_DAYS_PER_RUN = 15;

// ─────────────────────────────────────────────────────────────────────────────
// Gap detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds VN trading days (per the canonical calendar — weekends AND holidays
 * excluded, half-days included) in [lowerBound, vnToday) with ZERO
 * daily_foreign_flow rows. `vnToday` itself is always excluded — a same-day
 * partial/still-open session must never be flagged as a gap (mirrors
 * findConvictionHistoryGapDays's AC-5 convention).
 *
 * lowerBound derives from MIN(daily_foreign_flow.date) — dates before the
 * table's own history began are legitimately absent, not a gap. An empty/
 * missing table returns [] (first-run honesty guard — nothing to reconcile
 * yet, never invents a lower bound out of thin air).
 */
export function findForeignFlowGapDays(db: Database, vnToday: string): string[] {
  let earliest: string | null = null;
  try {
    earliest =
      db.query<{ mn: string | null }, []>("SELECT MIN(date) as mn FROM daily_foreign_flow").get()?.mn ?? null;
  } catch {
    /* daily_foreign_flow may not exist yet in a minimal test DB */
  }
  if (!earliest) return [];

  const hardLower = shiftDateDays(vnToday, -MAX_LOOKBACK_DAYS);
  const lowerBound = earliest < hardLower ? hardLower : earliest;

  const gaps: string[] = [];
  let cursor = lowerBound;
  while (cursor < vnToday && gaps.length < MAX_GAP_DAYS_PER_RUN) {
    if (isVnTradingDay(cursor).is_trading_day) {
      let n = 0;
      try {
        n =
          db
            .query<{ n: number }, [string]>("SELECT COUNT(*) as n FROM daily_foreign_flow WHERE date = ?")
            .get(cursor)?.n ?? 0;
      } catch {
        n = 0;
      }
      if (n === 0) gaps.push(cursor);
    }
    cursor = shiftDateDays(cursor, 1);
  }
  return gaps;
}
