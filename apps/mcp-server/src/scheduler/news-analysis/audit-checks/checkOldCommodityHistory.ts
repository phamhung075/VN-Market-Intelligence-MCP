/**
 * W-1: Prune old commodity_prices_history (>180 days).
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { AuditFinding } from "../dataAuditShared.js";

export function checkOldCommodityHistory(db: Database): AuditFinding[] {
  try {
    const result = db.prepare(
      "DELETE FROM commodity_prices_history WHERE fetched_at < datetime('now','-180 days')"
    ).run();
    return [{
      table: "commodity_prices_history",
      check: "old_commodity_history",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Deleted ${result.changes} commodity_prices_history rows older than 180 days`,
    }];
  } catch (err) {
    return [{
      table: "commodity_prices_history",
      check: "old_commodity_history",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
