/**
 * W-2: Prune old sbv_rates_history (>180 days).
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { AuditFinding } from "../dataAuditShared.js";

export function checkOldSbvHistory(db: Database): AuditFinding[] {
  try {
    const result = db.prepare(
      "DELETE FROM sbv_rates_history WHERE fetched_at < datetime('now','-180 days')"
    ).run();
    return [{
      table: "sbv_rates_history",
      check: "old_sbv_history",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Deleted ${result.changes} sbv_rates_history rows older than 180 days`,
    }];
  } catch (err) {
    return [{
      table: "sbv_rates_history",
      check: "old_sbv_history",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
