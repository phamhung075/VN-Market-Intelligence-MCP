/**
 * officersStore.ts
 *
 * Read-only infrastructure store for the `vnstock_officers` table.
 * Part of the TASK17-PAGE15 endpoint wave (GET /api/officers).
 *
 * Table: vnstock_officers
 *   code TEXT NOT NULL, name TEXT NOT NULL, position TEXT NOT NULL,
 *   own_percent REAL (nullable), quantity INTEGER (nullable),
 *   fetched_at TEXT NOT NULL, appointment_year INTEGER (nullable),
 *   UNIQUE(code, name).
 *
 * Live stats (probed 2026-06-11 against named-volume DB):
 *   493 rows, 32 distinct codes, fresh through 2026-06-10.
 *   Null distribution: 0 null position, 0 null own_percent, 0 null quantity,
 *   314/493 null appointment_year (optional field).
 *   Default selectedCode = BID (MIN code ASC).
 *
 * Layer: infrastructure/db — no domain imports.
 * All queries are fully static — NEVER string-interpolate user input.
 *
 * @module infrastructure/db/officersStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single row from vnstock_officers (selected columns only — fetched_at excluded).
 */
export type OfficerRow = {
  code: string;
  name: string;
  position: string;
  own_percent: number | null;
  quantity: number | null;
  appointment_year: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all distinct stock codes with officers data, ordered ASC.
 *
 * @param db - SQLite database instance (injected)
 * @returns Array of distinct code strings
 */
export function getDistinctCodes(db: Database): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT code FROM vnstock_officers ORDER BY code ASC`)
    .all() as { code: string }[];
  return rows.map((r) => r.code);
}

/**
 * Return ALL officers rows ordered by code ASC, own_percent DESC, name ASC.
 * 493 rows — fits comfortably in memory. Used for cross-company ranking
 * AND selected-code slice (caller slices the returned array).
 *
 * @param db - SQLite database instance (injected)
 * @returns Array of OfficerRow
 */
export function getAllOfficers(db: Database): OfficerRow[] {
  const rows = db
    .prepare(
      `SELECT code, name, position, own_percent, quantity, appointment_year
       FROM vnstock_officers
       ORDER BY code ASC, own_percent DESC, name ASC`,
    )
    .all() as OfficerRow[];
  return rows;
}

/**
 * Return the MAX fetched_at value across the entire table.
 * Represents the most recent data pull — used as the snapshot timestamp.
 *
 * @param db - SQLite database instance (injected)
 * @returns ISO string of MAX(fetched_at) or null if table is empty
 */
export function getAsOf(db: Database): string | null {
  const row = db
    .prepare(`SELECT MAX(fetched_at) AS as_of FROM vnstock_officers`)
    .get() as { as_of: string | null };
  return row?.as_of ?? null;
}
