/**
 * Morning Briefing — Step 18: BCTC upcoming filing deadlines (watchlist, within statutory window).
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 * Filing-date lookup (schema-tolerant period_quarter probe) lives in
 * queryFiledAt.ts — split out to keep this module under the step-module size budget.
 *
 * Layer: application/usecases/briefing — may import from domain/services/financial-reports.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";
import {
  getCurrentDeadline,
  getNextDeadline,
  classifyFilingStatus,
} from "../../../domain/services/financial-reports/earningsCalendar.js";
import { buildFiledAtLookup } from "./queryFiledAt.js";
import type { WatchlistRow } from "./queryWatchlistSummary.js";
import type { BctcDeadlineRow } from "./types.js";

/**
 * For each watchlist stock, picks the deadline (next upcoming vs. last
 * passed) closest to `today` and reports it when SAP_DEN (imminent) or
 * QUA_HAN (overdue). Tolerates DBs without a period_quarter column
 * (falls back to matching period_type = 'Q<n>').
 */
export function queryUpcomingDeadlines(
  db: Database,
  watchlistRows: WatchlistRow[],
  today: Date,
): BctcDeadlineRow[] {
  try {
    const { queryFiledAt } = buildFiledAtLookup(db);
    const rows: BctcDeadlineRow[] = [];

    for (const row of watchlistRows) {
      try {
        // Pick the deadline closest to today (minimum |daysUntilDeadline|).
        // This avoids surfacing stale overdue quarters when a new quarter is
        // already within the SAP_DEN window.
        //   - getNextDeadline  → next upcoming (SAP_DEN cases)
        //   - getCurrentDeadline → last passed (QUA_HAN cases)
        const nextInfo = getNextDeadline(today, row.domain);
        const currentInfo = getCurrentDeadline(today, row.domain);

        // Compute days until each candidate (negative = overdue)
        const daysToCurrent = Math.floor(
          (currentInfo.deadline.getTime() - today.getTime()) / (24 * 3600_000)
        );
        const daysToNext = Math.floor(
          (nextInfo.deadline.getTime() - today.getTime()) / (24 * 3600_000)
        );

        // Pick the candidate with smallest absolute day distance to today.
        // When they are the same quarter, pick either (same result).
        const info =
          Math.abs(daysToNext) <= Math.abs(daysToCurrent) ? nextInfo : currentInfo;

        const filedAt = queryFiledAt(row.code, info.year, info.quarter);
        const fs = classifyFilingStatus(today, {
          ...info,
          filingDate: filedAt,
        });

        if (fs.status === "SAP_DEN" || fs.status === "QUA_HAN") {
          rows.push({
            code: row.code,
            domain: row.domain,
            quarter: info.quarter,
            year: info.year,
            deadline: info.deadline.toISOString().slice(0, 10),
            daysUntilDeadline: fs.daysUntilDeadline!,
            status: fs.status,
          });
        }
      } catch { /* per-stock failure — skip silently */ }
    }

    return rows.sort((a, b) => a.daysUntilDeadline - b.daysUntilDeadline);
  } catch (deadlineErr) {
    logger.warn("[assembleBriefing] upcomingDeadlines step failed", {
      error: deadlineErr instanceof Error ? deadlineErr.message : String(deadlineErr),
    });
    return [];
  }
}
