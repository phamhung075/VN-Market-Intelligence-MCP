/**
 * D-5: Flag rag_analyses with missing sentiment or impact.
 * D-6: Flag old rag_analyses with null source_url (>7 days).
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim; side-effect ordering preserved (D-5's
 * insertFeedbackIfNew fires before D-6 runs, same as the monolith).
 */

import { Database } from "bun:sqlite";
import { AuditFinding, insertFeedbackIfNew } from "../dataAuditShared.js";

export function checkRagAnalysesQuality(db: Database): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // D-5: Flag rag_analyses with missing sentiment or impact
  try {
    const row = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM rag_analyses WHERE sentiment IS NULL OR impact_score = 0 OR impact_score IS NULL"
    ).get();
    const cnt = row?.cnt ?? 0;
    const finding: AuditFinding = {
      table: "rag_analyses",
      check: "missing_sentiment_or_impact",
      severity: "warning",
      rowsAffected: cnt,
      action: cnt > 0 ? "flagged" : "none",
      detail: `${cnt} rag_analyses rows missing sentiment or impact_score`,
    };
    findings.push(finding);
    if (cnt > 0) insertFeedbackIfNew(db, finding);
  } catch (err) {
    findings.push({
      table: "rag_analyses",
      check: "missing_sentiment_or_impact",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // D-6: Flag old rag_analyses with null source_url (>7 days)
  try {
    const row = db.query<{ cnt: number }, []>(
      "SELECT COUNT(*) as cnt FROM rag_analyses WHERE source_url IS NULL AND created_at < datetime('now','-7 days')"
    ).get();
    const cnt = row?.cnt ?? 0;
    findings.push({
      table: "rag_analyses",
      check: "null_source_url_old",
      severity: "info",
      rowsAffected: cnt,
      action: cnt > 0 ? "flagged" : "none",
      detail: `${cnt} rag_analyses rows have null source_url and are older than 7 days`,
    });
  } catch (err) {
    findings.push({
      table: "rag_analyses",
      check: "null_source_url_old",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  return findings;
}
