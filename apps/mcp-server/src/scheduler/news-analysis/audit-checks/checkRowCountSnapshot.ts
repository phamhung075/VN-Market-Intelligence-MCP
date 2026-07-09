/**
 * D-11: Row count snapshot (7 major tables) + row count drop detection (task 1086).
 *
 * Read previous audit's row counts from audit_state so we can detect drops.
 * A row count decrease in financial_reports (or any major table) may indicate
 * WAL corruption, accidental DELETE, or manual sqlite3 cleanup.
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { AuditFinding, SNAPSHOT_TABLES, getPreviousRowCounts } from "../dataAuditShared.js";

export function checkRowCountSnapshot(db: Database): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const previousCounts = getPreviousRowCounts(db);

  for (const tableName of SNAPSHOT_TABLES) {
    try {
      const row = db.query<{ cnt: number }, []>(`SELECT COUNT(*) as cnt FROM ${tableName}`).get();
      const cnt = row?.cnt ?? 0;
      findings.push({
        table: tableName,
        check: "row_count_snapshot",
        severity: "info",
        rowsAffected: cnt,
        action: "none",
        detail: `${tableName} has ${cnt.toLocaleString("vi-VN")} rows`,
      });

      // D-11b (task 1086): detect row count drop vs previous audit
      const prevCount = previousCounts.get(tableName);
      if (prevCount !== undefined && cnt < prevCount) {
        const dropped = prevCount - cnt;
        findings.push({
          table: tableName,
          check: "row_count_drop",
          severity: "warning",
          rowsAffected: dropped,
          action: "escalated",
          detail: `${tableName} row count dropped: ${prevCount} -> ${cnt} (-${dropped})`,
        });
      }
    } catch (err) {
      findings.push({
        table: tableName,
        check: "row_count_snapshot",
        severity: "info",
        rowsAffected: 0,
        action: "none",
        detail: `Count failed for ${tableName}: ${(err as Error).message}`.slice(0, 200),
      });
    }
  }

  return findings;
}
