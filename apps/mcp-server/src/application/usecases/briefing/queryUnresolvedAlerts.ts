/**
 * Morning Briefing — Step 10b: unresolved HIGH/CRITICAL alerts (prefix-deduped).
 *
 * Extracted from assembleBriefing.ts _assembleBriefingImpl (FACTORY-APP-split-assembleBriefing).
 *
 * Layer: application/usecases/briefing — pure query, no side effects.
 */
import type { Database } from "bun:sqlite";
import { failLoud } from "../../../domain/utils/safeQuery.js";
import { parseAffectedCodes } from "../../../domain/utils/affectedCodesParser.js";
import type { AlertRow } from "./queryUnreadAlerts.js";
import type { BriefingAlert } from "./types.js";

/**
 * Query up to 5 unresolved HIGH/CRITICAL alerts, most recent per message first.
 *
 * App-level prefix-dedup: BCTC overdue rows fire weekly with updated
 * day-counts ("BID (5d)" vs "BID (6d)"), so a plain SQL GROUP BY message
 * fails to merge them — keep highest triggered_at per 40-char prefix
 * (SQL already orders MAX(triggered_at) DESC).
 */
export function queryUnresolvedAlerts(db: Database): BriefingAlert[] {
  try {
    const unresolvedRows = db
      .prepare<AlertRow, []>(`
        SELECT severity, message, affected_actions_json
        FROM alerts
        WHERE severity IN ('high', 'critical')
          AND resolved_at IS NULL
        GROUP BY message
        ORDER BY MAX(triggered_at) DESC
        LIMIT 5
      `)
      .all();

    const seen = new Map<string, { severity: string; message: string; stocks: string[] }>();
    for (const row of unresolvedRows) {
      const msg = row.message ?? "";
      const prefix = msg.slice(0, 40);
      if (!seen.has(prefix)) {
        seen.set(prefix, {
          severity: row.severity,
          message: msg,
          stocks: parseAffectedCodes(row.affected_actions_json),
        });
      }
    }
    return Array.from(seen.values()).slice(0, 5);
  } catch (err) {
    // FIX-ERRAUDIT-W2-MCP-DATALAYER: was bare catch → silently empty alerts
    failLoud(err, "assembleBriefing.step10b.unresolvedAlerts");
    return [];
  }
}
