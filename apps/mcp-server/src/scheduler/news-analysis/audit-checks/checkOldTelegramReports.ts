/**
 * D-10: Purge old telegram_reports (>48h).
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — logic
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { deleteOldReports } from "../../../infrastructure/db/telegramReportStore.js";
import { AuditFinding } from "../dataAuditShared.js";

export function checkOldTelegramReports(db: Database): AuditFinding[] {
  try {
    const removed = deleteOldReports(db, 48);
    return [{
      table: "telegram_reports",
      check: "old_report_purge",
      severity: "info",
      rowsAffected: removed,
      action: removed > 0 ? "auto_cleaned" : "none",
      detail: `Removed ${removed} telegram_reports older than 48h`,
    }];
  } catch (err) {
    return [{
      table: "telegram_reports",
      check: "old_report_purge",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Skipped: ${err instanceof Error ? err.message : String(err)}`,
    }];
  }
}
