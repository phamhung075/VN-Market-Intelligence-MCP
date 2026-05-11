/**
 * Infrastructure — Alerts Supersede Store (Task 1005)
 *
 * Helper to mark historical alerts as "Superseded by fix" after a dev-team
 * fix ships that invalidates older CRITICAL/HIGH alerts (e.g. a threshold
 * tightening that retroactively turns a historical 5.3× volume_spike into
 * noise).
 *
 * Writes `resolution_notes` + `resolved_at` on the `alerts` table. The
 * existing columns were introduced by Task 137; this module is the first
 * caller to populate them programmatically.
 *
 * Design rules:
 *   - Parameterised SQL only (SQL parameter binding invariant).
 *   - Never throws — unknown ids are silently skipped. Returns affected
 *     row count so callers can surface `N/M` feedback to the user.
 *   - Idempotent: re-running the same (title, commitHash) pair produces the
 *     same resolution_notes string, so no drift on repeat log_fix calls.
 *
 * @module infrastructure/db/alertsSupersedeStore
 */

import type { Database } from "bun:sqlite";

export interface SupersedeInput {
  /** Alert ids from the `alerts` table to mark as superseded. */
  alertIds: string[];
  /** Human-readable fix title (e.g. "volume_spike threshold tightened"). */
  fixTitle: string;
  /** Optional git commit hash for traceability. */
  commitHash?: string | undefined;
}

/** Build the deterministic resolution_notes payload. */
function buildResolutionNotes(title: string, commit?: string | undefined): string {
  const base = `Superseded by fix: ${title}`;
  return commit ? `${base} (${commit})` : base;
}

/**
 * Mark the given alerts as superseded by a dev-team fix.
 *
 * Behaviour:
 *   - Unknown ids are skipped without error.
 *   - `resolved_at` is set to the current ISO 8601 instant unless already set
 *     (so the first fix "wins" the timestamp — subsequent re-runs only refresh
 *     `resolution_notes` content, which is deterministic for the same input).
 *
 * @param db    - SQLite database handle (tests pass `:memory:` instance)
 * @param input - Alert ids + fix metadata
 * @returns Number of rows actually updated
 */
export function markAlertsSuperseded(
  db: Database,
  input: SupersedeInput,
): number {
  const { alertIds, fixTitle, commitHash } = input;
  if (!alertIds || alertIds.length === 0) return 0;

  const notes = buildResolutionNotes(fixTitle, commitHash);
  const now = new Date().toISOString();

  const stmt = db.prepare(
    `UPDATE alerts
        SET resolution_notes = $notes,
            resolved_at      = COALESCE(resolved_at, $now)
      WHERE id = $id`,
  );

  let updated = 0;
  for (const id of alertIds) {
    const res = stmt.run({ $notes: notes, $now: now, $id: id });
    // bun:sqlite exposes changes on the run result
    updated += Number((res as { changes?: number }).changes ?? 0);
  }
  return updated;
}
