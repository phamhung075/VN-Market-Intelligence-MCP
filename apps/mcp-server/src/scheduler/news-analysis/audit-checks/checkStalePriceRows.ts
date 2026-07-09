/**
 * D-2: Delete stale price rows (>3 days old).
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { AuditFinding } from "../dataAuditShared.js";

export function checkStalePriceRows(db: Database): AuditFinding[] {
  try {
    const result = db.prepare(
      "DELETE FROM market_prices WHERE updated_at < date('now','-3 days')"
    ).run();
    return [{
      table: "market_prices",
      check: "stale_price_rows",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Deleted ${result.changes} stale market_prices rows older than 3 days`,
    }];
  } catch (err) {
    return [{
      table: "market_prices",
      check: "stale_price_rows",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
