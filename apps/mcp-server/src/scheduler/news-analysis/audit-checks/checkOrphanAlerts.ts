/**
 * W-6: Orphan alerts (analysis IDs not in rag_analyses).
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { AuditFinding, insertFeedbackIfNew } from "../dataAuditShared.js";

export function checkOrphanAlerts(db: Database): AuditFinding[] {
  try {
    const row = db.query<{ cnt: number }, []>(`
      SELECT COUNT(DISTINCT je.value) as cnt
      FROM alerts, json_each(analysis_ids_json) je
      LEFT JOIN rag_analyses ra ON ra.id = je.value
      WHERE ra.id IS NULL
        AND analysis_ids_json IS NOT NULL
        AND analysis_ids_json != '[]'
    `).get();
    const cnt = row?.cnt ?? 0;
    const finding: AuditFinding = {
      table: "alerts",
      check: "orphan_alerts",
      severity: "warning",
      rowsAffected: cnt,
      action: cnt > 0 ? "flagged" : "none",
      detail: `${cnt} alert analysis IDs reference missing rag_analyses rows`,
    };
    if (cnt > 0) insertFeedbackIfNew(db, finding);
    return [finding];
  } catch (err) {
    return [{
      table: "alerts",
      check: "orphan_alerts",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
