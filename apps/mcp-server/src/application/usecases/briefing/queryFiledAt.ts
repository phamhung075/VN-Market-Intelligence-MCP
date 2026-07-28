/**
 * Morning Briefing — Step 18 helper: filing-date lookup for one stock/quarter.
 *
 * Extracted from assembleBriefing.ts's Step 18 upcomingDeadlines block
 * (FACTORY-APP-split-assembleBriefing) — split out of queryUpcomingDeadlines.ts
 * to keep that module's own size under the <=120L step-module budget.
 *
 * Layer: application/usecases/briefing — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import { logger } from "../../../infrastructure/logger.js";

/** Internal: filing date result from financial_reports query. */
interface FiledAtRow {
  filed_at: string | null;
}

export interface FiledAtLookup {
  /** True when the DB has a period_quarter column (post-migration schema). */
  hasPeriodQuarter: boolean;
  /** Query whether `code` filed for `year`/`quarter`. Returns the max parsed_at, or null. */
  queryFiledAt: (code: string, year: number, quarter: number) => string | null;
}

/**
 * Detects whether `financial_reports.period_quarter` exists (legacy DBs may
 * lack it) and returns a filed-at lookup bound to whichever query shape the
 * live schema supports (period_quarter exact match, or period_type='Q<n>' fallback).
 */
export function buildFiledAtLookup(db: Database): FiledAtLookup {
  let hasPeriodQuarter = false;
  try {
    const cols = db.query<{ name: string }, []>(
      "PRAGMA table_info(financial_reports)"
    ).all();
    hasPeriodQuarter = cols.some((c) => c.name === "period_quarter");
  } catch { /* schema probe failed — use fallback */ }

  if (!hasPeriodQuarter) {
    logger.warn("[assembleBriefing] Step 18: period_quarter column absent — using period_type fallback");
  }

  const filedAtStmtByQuarter = hasPeriodQuarter
    ? db.prepare<FiledAtRow, [string, number, number]>(`
        SELECT MAX(parsed_at) AS filed_at
        FROM financial_reports
        WHERE action_code = ?
          AND period_year = ?
          AND period_quarter = ?
      `)
    : null;

  const queryFiledAt = (code: string, year: number, quarter: number): string | null => {
    if (filedAtStmtByQuarter) {
      const r = filedAtStmtByQuarter.get(code, year, quarter);
      return r?.filed_at ?? null;
    }
    // Fallback: match period_type string e.g. 'Q1'
    const periodType = `Q${quarter}`;
    const r = db.prepare<FiledAtRow, [string, number, string]>(`
      SELECT MAX(parsed_at) AS filed_at
      FROM financial_reports
      WHERE action_code = ?
        AND period_year = ?
        AND period_type = ?
    `).get(code, year, periodType);
    return r?.filed_at ?? null;
  };

  return { hasPeriodQuarter, queryFiledAt };
}
