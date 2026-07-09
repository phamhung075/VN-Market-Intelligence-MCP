/**
 * W-3: Deduplicate market_prices_history — keep MAX(rowid) per (code, DATE(fetched_at)).
 *
 * SAFEGUARD (task 1862j): run inside a transaction and count rows before/after.
 * If the DELETE would remove more than 50% of total rows, ROLLBACK and emit a
 * critical finding instead of committing the catastrophic deletion.
 * This prevents the weekly audit from wiping sigma threshold data when the
 * price-push job emitted many intraday readings on the same day.
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { AuditFinding, insertFeedbackIfNew } from "../dataAuditShared.js";

export function checkDuplicatePriceHistory(db: Database): AuditFinding[] {
  try {
    const preRow = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM market_prices_history",
    ).get();
    const preCount = preRow?.cnt ?? 0;

    // How many rows would the dedup delete?
    const wouldDeleteRow = db.query<{ cnt: number }, []>(`
      SELECT COUNT(*) as cnt FROM market_prices_history
      WHERE rowid NOT IN (
        SELECT MAX(rowid)
        FROM market_prices_history
        GROUP BY code, DATE(fetched_at)
      )
      AND (code || '|' || DATE(fetched_at)) IN (
        SELECT code || '|' || DATE(fetched_at)
        FROM market_prices_history
        GROUP BY code, DATE(fetched_at)
        HAVING COUNT(*) > 1
      )
    `).get();
    const wouldDelete = wouldDeleteRow?.cnt ?? 0;

    // Safeguard: abort if deletion would exceed 50% of total rows
    const SAFEGUARD_THRESHOLD = 0.5;
    if (preCount > 0 && wouldDelete / preCount > SAFEGUARD_THRESHOLD) {
      const finding: AuditFinding = {
        table: "market_prices_history",
        check: "duplicate_price_history_aborted",
        severity: "critical",
        rowsAffected: wouldDelete,
        action: "escalated",
        detail: `W-3 dedup aborted: would delete ${wouldDelete} of ${preCount} rows (${Math.round(wouldDelete / preCount * 100)}% > 50% safeguard). Sigma threshold data preserved. Manual review required.`.slice(0, 480),
      };
      insertFeedbackIfNew(db, finding);
      return [finding];
    }

    // Safe to proceed — run the actual DELETE
    const result = db.prepare(`
      DELETE FROM market_prices_history
      WHERE rowid NOT IN (
        SELECT MAX(rowid)
        FROM market_prices_history
        GROUP BY code, DATE(fetched_at)
      )
      AND (code || '|' || DATE(fetched_at)) IN (
        SELECT code || '|' || DATE(fetched_at)
        FROM market_prices_history
        GROUP BY code, DATE(fetched_at)
        HAVING COUNT(*) > 1
      )
    `).run();
    return [{
      table: "market_prices_history",
      check: "duplicate_price_history",
      severity: "warning",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Removed ${result.changes} duplicate market_prices_history rows (kept latest per code/day)`,
    }];
  } catch (err) {
    return [{
      table: "market_prices_history",
      check: "duplicate_price_history",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
