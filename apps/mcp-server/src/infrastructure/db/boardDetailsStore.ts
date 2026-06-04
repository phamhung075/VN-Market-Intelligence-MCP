/**
 * Board Details Store — RAPID-DATA-LAYER FIX-I-B
 *
 * UPDATE-only upsert: writes appointment_year + fetched_at into existing
 * vnstock_officers rows matched by (code, name).
 *
 * Design decisions:
 *   - UPDATE-only: preserves own_percent / quantity / position from VCI source
 *   - Name-mismatch → silent skip + warning log (no INSERT, no fabrication)
 *   - Returns updated-row count (not input row count)
 *   - Idempotent: same (code, name, year) → same row state
 *
 * @module infrastructure/db/boardDetailsStore
 */

import type { Database } from "bun:sqlite";
import type { BoardDetailsOfficer } from "../fetchers/boardDetailsFetcher.js";

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert appointment_year into vnstock_officers rows.
 *
 * For each officer in `rows`:
 *   - Run UPDATE vnstock_officers SET appointment_year=?, fetched_at=? WHERE code=? AND name=?
 *   - If changes === 0: row not found by (code, name) — skip silently + log warning
 *   - own_percent / quantity / position are NEVER touched
 *
 * @param db   Database instance (injectable for unit tests)
 * @param rows Officers returned by boardDetailsFetcher
 * @returns Number of rows actually updated (name-mismatches excluded)
 */
export function upsertBoardDetails(
  db: Database,
  rows: BoardDetailsOfficer[],
): number {
  if (rows.length === 0) return 0;

  const stmt = db.prepare(
    `UPDATE vnstock_officers
     SET appointment_year = ?,
         fetched_at       = ?
     WHERE code = ?
       AND name = ?`,
  );

  let updatedCount = 0;

  for (const row of rows) {
    const result = stmt.run(
      row.appointment_year,  // may be null
      row.fetched_at,
      row.code,
      row.name,
    );

    if (result.changes === 0) {
      // Name mismatch or ticker not in officers table — skip, do NOT insert
      console.warn(
        `[boardDetailsStore] name-mismatch skip: code=${row.code} name="${row.name}" — no vnstock_officers row found`,
      );
    } else {
      updatedCount += result.changes;
    }
  }

  return updatedCount;
}
