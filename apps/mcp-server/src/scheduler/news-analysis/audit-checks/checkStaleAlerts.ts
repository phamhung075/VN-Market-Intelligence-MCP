/**
 * D-3: Mark stale unread alerts as read (>30 days).
 * D-4: Auto-resolve unresolved alerts (>30 days) — retention GC.
 *
 * Split from dataAuditJob.ts (FACTORY-SCHEDULER-split-dataAuditJob) — SQL
 * and finding shape verbatim; both checks share the `alerts` table lifecycle
 * theme so they stay grouped in one file per the architect approach note.
 *
 * FIX-AGENTSIGNALS-EXPIRED-GC-CRON (2026-08-01): D-4 is the "alerts retention GC"
 * half of this task — already wired daily into the off-hours `dataAuditJob:daily`
 * cron (`0 23 * * *` Asia/Ho_Chi_Minh — schedulerJobTable.ts) via runDailyChecks(),
 * the SAME cron execution that runs agentSignalStore.ts's cleanExpired() (see that
 * function's doc comment) — so both tables' GC are already folded into ONE daily
 * off-hours cron job, satisfying the task's "ONE cron covering both tables" ask.
 * Tightened threshold 60d -> 30d (task's suggested retention window) and the
 * resolution_notes marker to 'auto-resolved by retention GC' (was 'auto-expired by
 * audit') so both D-4 and any future retention-GC consumer share one discoverable
 * marker string. NEVER hard-deletes alert history — UPDATE only, per spec.
 * Both predicates now wrap the column in `datetime()` (`datetime(triggered_at) <
 * datetime('now', ...)`), not just the threshold, per
 * feedback_sqlite_iso8601_datetime_strcompare_bypass: `alerts.triggered_at` is
 * written as a raw JS `.toISOString()` string (`"...T...Z"`, see alertStore.ts:453
 * comment) — a materially different on-disk format from agent_signals.expires_at's
 * normalized `datetime('now')` form. SQLite's datetime() parses both forms
 * correctly (verified live against the named-volume DB), so this was not silently
 * no-oping, but the explicit wrap removes the format-drift risk instead of relying
 * on date-field-dominant lexicographic ordering to save it. RAW-verified 2026-08-01
 * against the live named-volume DB: 8 total alerts / 8 unresolved / 0 unresolved
 * >30d — far below the stale 2026-06-20 auditor snapshot (829 / 205) because this
 * daily cron (at the prior 60d threshold) has been running the whole time.
 */

import { Database } from "bun:sqlite";
import { AuditFinding } from "../dataAuditShared.js";

export function checkStaleAlerts(db: Database): AuditFinding[] {
  const findings: AuditFinding[] = [];

  // D-3: Mark stale unread alerts as read (>30 days)
  try {
    const result = db.prepare(
      "UPDATE alerts SET read = 1 WHERE read = 0 AND datetime(triggered_at) < datetime('now','-30 days')"
    ).run();
    findings.push({
      table: "alerts",
      check: "stale_unread_alerts",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Marked ${result.changes} unread alerts (>30 days) as read`,
    });
  } catch (err) {
    findings.push({
      table: "alerts",
      check: "stale_unread_alerts",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  // D-4: Auto-resolve unresolved alerts (>30 days) — retention GC, never deletes.
  try {
    const result = db.prepare(`
      UPDATE alerts
      SET resolved_at = datetime('now'),
          resolution_notes = 'auto-resolved by retention GC'
      WHERE resolved_at IS NULL
        AND datetime(triggered_at) < datetime('now','-30 days')
    `).run();
    findings.push({
      table: "alerts",
      check: "auto_expire_unresolved",
      severity: "info",
      rowsAffected: result.changes,
      action: result.changes > 0 ? "auto_cleaned" : "none",
      detail: `Auto-resolved ${result.changes} unresolved alerts older than 30 days (retention GC)`,
    });
  } catch (err) {
    findings.push({
      table: "alerts",
      check: "auto_expire_unresolved",
      severity: "info",
      rowsAffected: 0,
      action: "none",
      detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
    });
  }

  return findings;
}
