/**
 * D-NEW: Prune stale NULL-outcome agent_signals (>30 days) — Task 1863h.
 *
 * Context: Task 1863b replaced the DB-backed verdictResolutionJob with a
 * file-store-backed implementation that no longer writes to agent_signals.
 * The old verdictResolutionJob carried a 30-day TTL pruner for rows where
 * outcome IS NULL. Without that job touching agent_signals, those rows would
 * grow unbounded. This check preserves the TTL semantics for any legacy
 * NULL-outcome rows that were never resolved by the old job.
 *
 * Separate from cleanExpired() (which deletes rows by expires_at): this
 * targets rows that were never given an outcome and are over 30 days old.
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL,
 * finding shape, and console.log/console.warn side effects verbatim.
 *
 * FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED (folded_scope_orphan_fk): same FK exposure as
 * agentSignalStore.ts's cleanExpired() — a matched agent_signals row still referenced by a
 * signal_outcomes child (NOT NULL FK, PRAGMA foreign_keys=ON) throws "FOREIGN KEY
 * constraint failed" and, being a single bulk DELETE, rolls back the WHOLE statement
 * (pruning zero rows, silently masked by this function's own catch). Excluded the same
 * way — see cleanExpired()'s doc comment for the full rationale.
 */

import { Database } from "bun:sqlite";
import { AuditFinding } from "../dataAuditShared.js";

export function checkStaleAgentSignals(db: Database): AuditFinding[] {
  try {
    // Probe first (rather than parsing the DELETE's error message): signal_outcomes may
    // legitimately be absent on an older/minimal agent_signals-only schema, in which case
    // there is no FK to worry about and the guard clause itself would be the thing that
    // throws "no such table".
    let hasSignalOutcomes = true;
    try {
      db.prepare(`SELECT id FROM signal_outcomes LIMIT 0`).all();
    } catch {
      hasSignalOutcomes = false;
    }

    const sql = hasSignalOutcomes
      ? `DELETE FROM agent_signals
          WHERE outcome IS NULL AND created_at < datetime('now', '-30 days')
            AND id NOT IN (SELECT signal_id FROM signal_outcomes)`
      : `DELETE FROM agent_signals
          WHERE outcome IS NULL AND created_at < datetime('now', '-30 days')`;

    const result = db.prepare(sql).run();
    console.log(`[dataAuditJob] D-NEW stale_null_outcome_signals: deleted ${result.changes} rows`);
    return [{
      table: "agent_signals",
      check: "stale_null_outcome_signals",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Deleted ${result.changes} agent_signals rows with NULL outcome older than 30 days`,
    }];
  } catch (err) {
    // Non-fatal: agent_signals table may not exist yet on fresh installs
    console.warn(`[dataAuditJob] D-NEW stale_null_outcome_signals skipped: ${(err as Error).message}`);
    return [{
      table: "agent_signals",
      check: "stale_null_outcome_signals",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check skipped: ${(err as Error).message}`.slice(0, 200),
    }];
  }
}
