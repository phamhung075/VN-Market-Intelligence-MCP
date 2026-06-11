/**
 * shareholdersStore.ts
 *
 * Read-only infrastructure store for the `vnstock_shareholders` table.
 * Part of the TASK17-PAGE14 endpoint wave (GET /api/shareholders).
 *
 * Table: vnstock_shareholders
 *   id INTEGER PK AUTOINCREMENT, code TEXT NOT NULL, name TEXT NOT NULL,
 *   quantity INTEGER (nullable), own_percent REAL (nullable),
 *   fetched_at TEXT NOT NULL, UNIQUE(code, name).
 *
 * Live stats (probed 2026-06-11 against named-volume DB):
 *   1593 rows, 32 distinct codes, 15–107 holders per code.
 *   own_percent on 0–100 scale (e.g. 6.89). Per-code SUM can exceed 100
 *   (overlapping disclosures — NVL 107%, KDC 112%).
 *   asOf = MAX(fetched_at) ≈ 2026-04-14T18:08:47.720Z.
 *
 * Layer: infrastructure/db — no domain imports.
 * All queries use parameterized bindings — NEVER string-interpolate user input.
 *
 * @module infrastructure/db/shareholdersStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single row from vnstock_shareholders (selected columns only — id/fetched_at excluded).
 */
export type ShareholderRow = {
  code: string;
  name: string;
  quantity: number | null;
  own_percent: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all distinct stock codes with shareholders data, ordered ASC.
 *
 * @param db - SQLite database instance (injected)
 * @returns Array of distinct code strings
 */
export function getDistinctCodes(db: Database): string[] {
  const rows = db
    .prepare(`SELECT DISTINCT code FROM vnstock_shareholders ORDER BY code ASC`)
    .all() as { code: string }[];
  return rows.map((r) => r.code);
}

/**
 * Return ALL shareholders rows ordered by code ASC, own_percent DESC, name ASC.
 * 1593 rows — fits comfortably in memory. Used for cross-company ranking
 * AND selected-code slice (caller slices the returned array).
 *
 * @param db - SQLite database instance (injected)
 * @returns Array of ShareholderRow
 */
export function getAllShareholders(db: Database): ShareholderRow[] {
  const rows = db
    .prepare(
      `SELECT code, name, quantity, own_percent
       FROM vnstock_shareholders
       ORDER BY code ASC, own_percent DESC, name ASC`,
    )
    .all() as ShareholderRow[];
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
    .prepare(`SELECT MAX(fetched_at) AS as_of FROM vnstock_shareholders`)
    .get() as { as_of: string | null };
  return row?.as_of ?? null;
}
