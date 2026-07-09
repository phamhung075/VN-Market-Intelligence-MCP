/**
 * W-4: Deduplicate null-source-url rag_analyses (>30 days).
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim.
 */

import { Database } from "bun:sqlite";
import { AuditFinding } from "../dataAuditShared.js";

export function checkDuplicateRagAnalyses(db: Database): AuditFinding[] {
  try {
    const result = db.prepare(`
      DELETE FROM rag_analyses
      WHERE rowid NOT IN (
        SELECT MAX(rowid)
        FROM rag_analyses
        WHERE source_url IS NULL AND created_at < datetime('now','-30 days')
        GROUP BY level, DATE(created_at), source_title
      )
      AND source_url IS NULL
      AND created_at < datetime('now','-30 days')
      AND (level || '|' || DATE(created_at) || '|' || COALESCE(source_title,'')) IN (
        SELECT level || '|' || DATE(created_at) || '|' || COALESCE(source_title,'')
        FROM rag_analyses
        WHERE source_url IS NULL AND created_at < datetime('now','-30 days')
        GROUP BY level, DATE(created_at), source_title
        HAVING COUNT(*) > 1
      )
    `).run();
    return [{
      table: "rag_analyses",
      check: "duplicate_null_source_url",
      severity: "warning",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Removed ${result.changes} duplicate rag_analyses rows with null source_url (>30 days)`,
    }];
  } catch (err) {
    return [{
      table: "rag_analyses",
      check: "duplicate_null_source_url",
      severity: "warning",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
