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
 * (bgapidatafeed.vps.com.vn/getliststockdata) is LIVE-SNAPSHOT-ONLY, no
 * date/range parameter (RAW-confirmed live 2026-08-07, matching the
 * 2026-07-22 precedent for this same endpoint) — a past trading day
 * that ends with zero rows can NEVER be backfilled by this or any
 * future automated check (see scripts/migrations/verify-foreign-flow-
 * gap-unrecoverable-2026-08-06.ts, AC-2). This check's ONLY action is
 * to ESCALATE (agent_feedback + Telegram via dataAuditJob's existing
 * "flagged"/"escalated" send-gate), so a zero-row trading day is never
 * silently self-cleared again the way the intraday freshnessSlaMonitorJob
 * was on 2026-08-06 (it only escalates INSIDE VN market hours and had
 * nothing to compare once the whole session had zero rows and closed —
 * see sibling FIX-SLA-MONITOR-MARKET-OPEN-BOUNDARY-DETERMINISTIC-DAILY-
 * BREACH, which depends on this task and must not remove/weaken it).
 *
 * Gap-day math (MAX_LOOKBACK_DAYS/MAX_GAP_DAYS_PER_RUN, calendar-aware)
 * lives in foreignFlowGapDetection.ts — split out (FIX-CI-SIZELINT-
 * CHECKFOREIGNFLOWGAP-NEW-OFFENDER-181L, keeps both files <120L); re-exported below.
 *
 * Layer: infrastructure/scheduler
 * DDD rules: may import from infrastructure/ and domain/; must not import
 * from application/ or interface/.
 */

import { Database } from "bun:sqlite";
import { getTodayVnDate } from "../../../domain/services/vnTradingCalendar.js";
import { AuditFinding, insertFeedbackIfNew } from "../dataAuditShared.js";
import { findForeignFlowGapDays } from "./foreignFlowGapDetection.js";
export { findForeignFlowGapDays };

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
