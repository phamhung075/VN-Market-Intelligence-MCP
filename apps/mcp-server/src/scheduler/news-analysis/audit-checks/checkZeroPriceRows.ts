/**
 * D-1: Delete STALE zero-price rows only (>1 day old).
 *
 * Task 314 — the VPS proxy legitimately pushes price=0 for halted or
 * illiquid tickers during a trading session. A blanket DELETE wiped the
 * entire market_prices snapshot every time the audit ran after market
 * close, leaving get_watchlist / /price showing N/A until the next day.
 * Only purge zero-price rows that have NOT been overwritten by a fresh
 * push in the last 24 h — those are true stragglers.
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { AuditFinding } from "../dataAuditShared.js";

export function checkZeroPriceRows(db: Database): AuditFinding[] {
  try {
    const result = db.prepare(
      "DELETE FROM market_prices WHERE (price = 0 OR price IS NULL) AND updated_at < datetime('now','-1 day')"
    ).run();
    return [{
      table: "market_prices",
      check: "zero_price_rows",
      severity: "warning",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Deleted ${result.changes} rows with price = 0 or NULL from market_prices`,
    }];
  } catch (err) {
    return [{
      table: "market_prices",
      check: "zero_price_rows",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
