/**
 * W-5: Outlier tracked_indicators values (table may not exist).
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { sqlInClause } from "../../../infrastructure/db/sqlHelpers.js";
import { AuditFinding, INDICATOR_RANGES, insertFeedbackIfNew } from "../dataAuditShared.js";

export function checkIndicatorRanges(db: Database): AuditFinding[] {
  try {
    const indicatorRows = db.prepare(
      `SELECT indicator, value FROM tracked_indicators WHERE indicator IN (${sqlInClause(Object.keys(INDICATOR_RANGES).length)})`
    ).all(...Object.keys(INDICATOR_RANGES)) as Array<{ indicator: string; value: number }>;

    const outliers: Array<{ indicator: string; value: number; range: typeof INDICATOR_RANGES[string] }> = [];
    for (const row of indicatorRows) {
      const range = INDICATOR_RANGES[row.indicator];
      if (!range) continue;
      if (row.value < range.min || row.value > range.max) {
        outliers.push({ indicator: row.indicator, value: row.value, range });
      }
    }

    if (outliers.length === 0) {
      return [{
        table: "tracked_indicators",
        check: "outlier_indicator_values",
        severity: "info",
        rowsAffected: 0,
        action: "none",
        detail: "All tracked indicator values are within plausible ranges",
      }];
    }

    // Use the highest severity across all outliers
    const hasCritical = outliers.some((o) => o.range.severity === "critical");
    const topSeverity = hasCritical ? "critical" : "warning";
    const desc = outliers
      .map((o) => `${o.indicator}=${o.value} (valid: ${o.range.min}–${o.range.max})`)
      .join("; ");

    const finding: AuditFinding = {
      table: "tracked_indicators",
      check: "outlier_indicator_values",
      severity: topSeverity,
      rowsAffected: outliers.length,
      action: "flagged",
      detail: `Outlier values: ${desc}`.slice(0, 200),
    };
    insertFeedbackIfNew(db, finding);
    return [finding];
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    // Table may not exist — that is expected on first startup
    const isTableMissing = msg.includes("no such table");
    return [{
      table: "tracked_indicators",
      check: "outlier_indicator_values",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: isTableMissing
        ? "tracked_indicators table not yet created — skipping W-5"
        : `Check failed: ${msg}`.slice(0, 200),
    }];
  }
}
