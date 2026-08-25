/**
 * Evening Summary — Step 2: alerts from last 24 hours, sorted by severity DESC, capped at 5.
 *
 * Extracted from assembleEveningSummary.ts _assembleEveningSummaryImpl
 * (FACTORY-APP-split-assembleEveningSummary).
 *
 * Layer: application/usecases/eveningSummary — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import { parseAffectedCodes } from "../../../domain/utils/affectedCodesParser.js";
import type { BriefingAlert } from "../assembleBriefing.js";

const SEVERITY_RANK: Record<string, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

interface AlertRow {
  severity: string;
  message: string | null;
  affected_actions_json: string | null;
}

/** Query alerts triggered in the last 24h, client-sorted by severity (critical > warning > info), capped at 5. */
export function queryTopAlerts(db: Database): BriefingAlert[] {
  const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();

  const alertRows = db
    .prepare<AlertRow, [string]>(`
      SELECT severity, message, affected_actions_json
      FROM alerts
      WHERE triggered_at >= ?
      ORDER BY triggered_at DESC
    `)
    .all(since24h);

  // Client-side severity sort (critical > warning > info)
  alertRows.sort(
    (a, b) =>
      (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  );

  // Cap at 5
  return alertRows.slice(0, 5).map((row) => ({
    severity: row.severity,
    message: row.message ?? "",
    stocks: parseAffectedCodes(row.affected_actions_json),
  }));
}
