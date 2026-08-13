/**
 * cleanExpired() — delete all expired agent signals, returns rows removed.
 *
 * Called periodically (dataAuditJob's daily cron) to prevent unbounded table
 * growth. FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED: agent_signals.id is
 * referenced by signal_outcomes.signal_id (NOT NULL REFERENCES, no ON DELETE
 * CASCADE) and the shared connection sets `PRAGMA foreign_keys = ON`.
 * Deleting an expired parent that still has a signal_outcomes child throws
 * "FOREIGN KEY constraint failed" — a single bulk DELETE means SQLite rolls
 * back the ENTIRE statement, pruning ZERO rows if even one row is blocked.
 * Verified live 2026-08-01: 104/5983 expired rows were still referenced by
 * signal_outcomes — this function had been silently no-oping every call (the
 * caller's try/catch, intended for "table may not exist yet", was swallowing
 * this FK error daily). Fix: exclude still-referenced parents from the
 * DELETE instead of relying on CASCADE (which would destructively wipe
 * accuracy-tracking history the moment a signal expires) — a referenced row
 * becomes eligible for pruning the moment its LAST signal_outcomes row is
 * deleted, never before. Growth stays bounded by signal_outcomes' own
 * (intentionally permanent) row count, so this adds no new unbounded growth.
 *
 * FIX-AGENTSIGNALS-EXPIRED-GC-CRON (2026-08-01): already wired daily into
 * the off-hours `dataAuditJob:daily` cron via runDailyAudit() — this IS the
 * "agent_signals GC cron", no separate cron needed. Predicate is
 * `datetime(expires_at) < datetime('now')` (wraps the column, not just the
 * threshold) — defense-in-depth against a future/legacy write path landing a
 * "T...Z" ISO string here (the canonical writer always normalizes to
 * SQLite's "YYYY-MM-DD HH:MM:SS" format). Deliberately NOT narrowed to
 * `status IN ('read', 'expired')`: there is no `'expired'` status literal
 * anywhere in this codebase, and an unread-but-expired row can never be read
 * again (getSignals filters `expires_at > datetime('now')`), so excluding
 * 'unread' would strand those rows — the exact defect this function exists
 * to prevent.
 *
 * @param db - Active bun:sqlite Database connection
 * @returns  Number of rows deleted
 */

import type { Database } from "bun:sqlite";

export function cleanExpired(db: Database): number {
  try {
    const result = db
      .prepare(`
        DELETE FROM agent_signals
         WHERE datetime(expires_at) < datetime('now')
           AND id NOT IN (SELECT signal_id FROM signal_outcomes)
      `)
      .run();
    return result.changes;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // signal_outcomes table absent (older schema / minimal test DB) — no FK-integrity
    // risk without that table, so fall back to the unguarded prune. Any OTHER error
    // (fail-loud-protocol) is re-thrown rather than masked by a second blind attempt.
    if (!msg.includes("no such table")) throw err;
    const result = db
      .prepare("DELETE FROM agent_signals WHERE datetime(expires_at) < datetime('now')")
      .run();
    return result.changes;
  }
}
