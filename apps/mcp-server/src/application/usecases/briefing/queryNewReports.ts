/**
 * Morning Briefing — Step 6: new financial_reports filed since midnight GMT+7.
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * Layer: application/usecases/briefing — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import type { NewReport } from "./types.js";

interface FinancialReportRow {
  action_code: string;
  period_type: string | null;
  period_year: number | null;
}

/**
 * Query new financial_reports since `midnight`, most recently parsed first.
 *
 * @param db       - Active SQLite Database.
 * @param midnight - ISO 8601 midnight-Vietnam-as-UTC boundary (shared with queryTopStories).
 */
export function queryNewReports(db: Database, midnight: string): NewReport[] {
  const reportRows = db
    .prepare<FinancialReportRow, [string]>(`
      SELECT action_code, period_type, period_year
      FROM financial_reports
      WHERE parsed_at >= ?
      ORDER BY parsed_at DESC
    `)
    .all(midnight);

  return reportRows.map((row) => ({
    code: row.action_code,
    period:
      row.period_type && row.period_year
        ? `${row.period_year}-${row.period_type}`
        : String(row.period_year ?? "unknown"),
  }));
}
