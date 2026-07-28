/**
 * Morning Briefing — Step 4: unread alerts from the last 12 hours.
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * Layer: application/usecases/briefing — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import { parseAffectedCodes } from "../../../domain/utils/affectedCodesParser.js";
import type { BriefingAlert } from "./types.js";

/** SQLite row shape shared with queryUnresolvedAlerts.ts (Step 10b) — same table/columns. */
export interface AlertRow {
  severity: string;
  message: string | null;
  affected_actions_json: string | null;
}

/** Query unread alerts from the last 12 hours, most recent first. */
export function queryUnreadAlerts(db: Database): BriefingAlert[] {
  const since12h = new Date(Date.now() - 12 * 3600_000).toISOString();

  const alertRows = db
    .prepare<AlertRow, [string]>(`
      SELECT severity, message, affected_actions_json
      FROM alerts
      WHERE triggered_at >= ?
      ORDER BY triggered_at DESC
    `)
    .all(since12h);

  return alertRows.map((row) => ({
    severity: row.severity,
    message: row.message ?? "",
    stocks: parseAffectedCodes(row.affected_actions_json),
  }));
}
