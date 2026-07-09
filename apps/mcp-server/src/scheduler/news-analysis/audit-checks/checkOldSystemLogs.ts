/**
 * D-9: Purge old system_logs (>60 days).
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { AuditFinding } from "../dataAuditShared.js";

export function checkOldSystemLogs(db: Database): AuditFinding[] {
  try {
    const result = db.prepare(
      "DELETE FROM system_logs WHERE timestamp < datetime('now','-60 days')"
    ).run();
    return [{
      table: "system_logs",
      check: "old_log_purge",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Deleted ${result.changes} system_logs entries older than 60 days`,
    }];
  } catch (err) {
    return [{
      table: "system_logs",
      check: "old_log_purge",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
