/**
 * W-7: LanceDB vs SQLite rag_analyses row count drift.
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — logic
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { AuditFinding, GetCountFn, insertFeedbackIfNew } from "../dataAuditShared.js";

export async function checkLancedbDrift(db: Database, getCountFn: GetCountFn): Promise<AuditFinding[]> {
  try {
    const lanceCount = await getCountFn();
    const sqliteRow = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM rag_analyses"
    ).get();
    const sqliteCount = sqliteRow?.cnt ?? 0;
    const delta = Math.abs(lanceCount - sqliteCount);

    const finding: AuditFinding = {
      table: "lancedb",
      check: "lancedb_rag_count_drift",
      severity: delta > 100 ? "warning" : "info",
      rowsAffected: delta,
      action: delta > 100 ? "flagged" : "none",
      detail: `LanceDB=${lanceCount}, SQLite rag_analyses=${sqliteCount}, delta=${delta}`,
    };
    if (delta > 100) insertFeedbackIfNew(db, finding);
    return [finding];
  } catch (err) {
    const errMsg = (err as Error).message ?? String(err);
    return [{
      table: "lancedb",
      check: "lancedb_rag_count_drift",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `LanceDB count check skipped: ${errMsg}`.slice(0, 200),
    }];
  }
}
