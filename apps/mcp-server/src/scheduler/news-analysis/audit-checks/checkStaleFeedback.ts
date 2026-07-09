/**
 * D-8: Escalate stale 'new' feedback (>14 days, low/medium priority).
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { AuditFinding, insertFeedbackIfNew } from "../dataAuditShared.js";

export function checkStaleFeedback(db: Database): AuditFinding[] {
  try {
    const result = db.prepare(`
      UPDATE agent_feedback
      SET priority = 'high'
      WHERE status = 'new'
        AND created_at < datetime('now','-14 days')
        AND priority IN ('low','medium')
    `).run();
    const finding: AuditFinding = {
      table: "agent_feedback",
      check: "stale_new_feedback",
      severity: "warning",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "escalated" : "none",
      detail: `Escalated ${result.changes} stale new feedback items to high priority`,
    };
    if (result.changes > 0) insertFeedbackIfNew(db, finding);
    return [finding];
  } catch (err) {
    return [{
      table: "agent_feedback",
      check: "stale_new_feedback",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
