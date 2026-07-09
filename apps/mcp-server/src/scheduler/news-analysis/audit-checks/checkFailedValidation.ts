/**
 * D-7: Flag financial_reports with failed validation.
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { AuditFinding, insertFeedbackIfNew } from "../dataAuditShared.js";

export function checkFailedValidation(db: Database): AuditFinding[] {
  try {
    const row = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM financial_reports WHERE validation_status = 'failed'"
    ).get();
    const cnt = row?.cnt ?? 0;
    const finding: AuditFinding = {
      table: "financial_reports",
      check: "failed_validation_unfixed",
      severity: "warning",
      rowsAffected: cnt,
      action: cnt > 0 ? "flagged" : "none",
      detail: `${cnt} financial_reports have validation_status = 'failed'`,
    };
    if (cnt > 0) insertFeedbackIfNew(db, finding);
    return [finding];
  } catch (err) {
    return [{
      table: "financial_reports",
      check: "failed_validation_unfixed",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
