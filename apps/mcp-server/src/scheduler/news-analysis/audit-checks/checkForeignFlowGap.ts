/**
 * D-NEW4: daily_foreign_flow per-trading-day COMPLETENESS detector
 * (FIX-FOREIGN-FLOW-MISSING-TRADING-DAY-2026-08-06-NO-BACKFILL).
 *
 * RAW-verified root cause (live named-volume DB + live upstream probe,
 * 2026-08-07): the VPS push-only pipeline for `prices`+`foreign-flow`
 * (two SEPARATE systemd services, vn-price-fetch.service / vn-foreign-
 * flow.service) went silent for ~46h (2026-08-05T04:29:40Z ..
 * 2026-08-07T02:00:11Z) while `news`/`sbv` (separate VPS services, SAME
 * receiving code path — pushNewsHandler.ts/pushSbvRatesHandler.ts share
 * requireVpsApiKey()/logVpsPush() with pushForeignFlowHandler.ts) kept
 * pushing normally throughout — `vps_push_log` shows ZERO rows (not error
 * rows — the request never arrived) for prices+foreign-flow across the
 * whole 2026-08-06 trading day, ruling out an mcp-server receiving-side
 * defect, a VPS_PUSH_API_KEY rotation (shared across all push routes), and
 * a full VM outage. Also RAW-disproves adopting the documented
 * OPS-FFLOW-VPS-CLOCKDRIFT-PREVENTIVE-RESIDUALS precedent (2026-07-21..23
 * VM-pause/clock-freeze) as this incident's mechanism: that mechanism
 * freezes the WHOLE VM clock, which would have silenced `sbv` too — it did
 * not. `runForeignFlowFetcherJobCron` (the mcp-server-side scheduler job)
 * is NOT the write path at all: per FIX-FOREIGN-FLOW-DEAD-ENDPOINT it only
 * calls fetchForeignFlowWithFallback() with no injected fetchFn in
 * production, so `source` is structurally always 'none'/'cache' and never
 * touches daily_foreign_flow — confirmed live via container logs
 * ("[foreign-flow-job] fallback activated","source":"none","changes":0)
 * during this exact incident. The true root cause (why the VPS-side
 * fetch-foreign-flow.sh/fetch-prices.sh loops stopped invoking their push
 * step for ~46h) is VPS-side, outside apps/mcp-server/ (ops zone,
 * vps-scripts/) — not fixed by this task.
 *
 * Unlike conviction_history (FIX-CONVICTION-HISTORY-EOD-BACKFILL, the
 * reconciliation shape this file reuses), daily_foreign_flow has NO
 * alternate in-DB reconstruction source and its sole upstream
 * (bgapidatafeed.vps.com.vn/getliststockdata) is LIVE-SNAPSHOT-ONLY — no
 * date/range parameter (RAW-confirmed live 2026-08-07, same conclusion the
 * 2026-07-22 precedent already established for this identical endpoint).
 * A past trading day that ends with zero rows can therefore NEVER be
 * backfilled by this or any future automated check — see
 * scripts/migrations/verify-foreign-flow-gap-unrecoverable-2026-08-06.ts
 * for the live re-verification harness (AC-2). This check's ONLY action is
 * to ESCALATE (agent_feedback + Telegram via dataAuditJob's existing
 * "flagged"/"escalated" send-gate), so a zero-row trading day is never
 * silently self-cleared again the way the intraday freshnessSlaMonitorJob
 * was on 2026-08-06 (it only escalates INSIDE VN market hours and had
 * nothing to compare against once the whole session had zero rows and
 * closed — see sibling FIX-SLA-MONITOR-MARKET-OPEN-BOUNDARY-DETERMINISTIC-
 * DAILY-BREACH, which depends on this task and must not remove or weaken
 * this detector).
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
import { getTodayVnDate, isVnTradingDay, shiftDateDays } from "../../../domain/services/vnTradingCalendar.js";
import { AuditFinding, insertFeedbackIfNew } from "../dataAuditShared.js";

// ─────────────────────────────────────────────────────────────────────────────
// Safety caps
// ─────────────────────────────────────────────────────────────────────────────

/** Never scan further back than this even if daily_foreign_flow has old history. */
const MAX_LOOKBACK_DAYS = 60;
/** Process at most this many gap days per invocation (oldest-first) — mirrors
 *  checkConvictionHistoryGap's MAX_GAP_DAYS_PER_RUN convention. */
const MAX_GAP_DAYS_PER_RUN = 15;

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

// ─────────────────────────────────────────────────────────────────────────────
// Public audit-check entry point
// ─────────────────────────────────────────────────────────────────────────────

export function checkForeignFlowGap(db: Database): AuditFinding[] {
  try {
    const today = getTodayVnDate();
    const gapDays = findForeignFlowGapDays(db, today);

    if (gapDays.length === 0) {
      return [
        {
          table: "daily_foreign_flow",
          check: "foreign_flow_day_completeness",
          severity: "info",
          rowsAffected: 0,
          action: "none",
          detail: "No zero-row VN trading days found in the lookback window",
        },
      ];
    }

    // NO alternate reconstruction source exists for this table (see file
    // header) — every gap day found here is, by construction, unrecoverable.
    // Still ESCALATE (action="flagged", not "none") every run the gap set
    // remains open: insertFeedbackIfNew's own (title + status='new') dedup
    // guard prevents daily re-spam for an UNCHANGED gap set, while a
    // genuinely NEW gap day changes rowsAffected (and therefore the dedup
    // title) so it is never silently swallowed by an older, still-open
    // finding — mirrors checkConvictionHistoryGap's title-varies-with-count
    // convention.
    const finding: AuditFinding = {
      table: "daily_foreign_flow",
      check: "foreign_flow_day_completeness",
      severity: "critical",
      rowsAffected: gapDays.length,
      action: "flagged",
      detail: (
        `${gapDays.length} VN trading day(s) ended with ZERO daily_foreign_flow rows — ` +
        `UNRECOVERABLE (sole upstream bgapidatafeed.vps.com.vn is live-snapshot-only, no ` +
        `historical re-fetch path): ${gapDays.join(", ")}`
      ).slice(0, 480),
    };
    insertFeedbackIfNew(db, finding);
    return [finding];
  } catch (err) {
    return [
      {
        table: "daily_foreign_flow",
        check: "foreign_flow_day_completeness",
        severity: "warning",
        rowsAffected: 0,
        action: "none",
        detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
      },
    ];
  }
}
