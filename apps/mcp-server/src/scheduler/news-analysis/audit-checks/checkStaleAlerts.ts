/**
 * D-3: Mark stale unread alerts as read (>30 days).
 * D-4: Auto-expire unresolved alerts (>60 days).
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim; both checks share the `alerts` table lifecycle
 * theme so they stay grouped in one file per the architect approach note.
 */

import { Database } from "bun:sqlite";
import { AuditFinding } from "../dataAuditShared.js";

export function checkStaleAlerts(db: Database): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // D-3: Mark stale unread alerts as read (>30 days)
  try {
    const result = db.prepare(
      "UPDATE alerts SET read = 1 WHERE read = 0 AND triggered_at < datetime('now','-30 days')"
    ).run();
    findings.push({
      table: "alerts",
      check: "stale_unread_alerts",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Marked ${result.changes} unread alerts (>30 days) as read`,
    });
  } catch (err) {
    findings.push({
      table: "alerts",
      check: "stale_unread_alerts",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // D-4: Auto-expire unresolved alerts (>60 days)
  try {
    const result = db.prepare(`
      UPDATE alerts
      SET resolved_at = datetime('now'),
          resolution_notes = 'auto-expired by audit'
      WHERE resolved_at IS NULL
        AND triggered_at < datetime('now','-60 days')
    `).run();
    findings.push({
      table: "alerts",
      check: "auto_expire_unresolved",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Auto-expired ${result.changes} unresolved alerts older than 60 days`,
    });
  } catch (err) {
    findings.push({
      table: "alerts",
      check: "auto_expire_unresolved",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  return findings;
}
