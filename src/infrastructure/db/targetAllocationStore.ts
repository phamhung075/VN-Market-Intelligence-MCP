/**
 * Task 223 — Portfolio Target Allocation Store
 *
 * SQLite CRUD helpers for the `portfolio_targets` table.
 *
 * Schema:
 *   portfolio_targets (
 *     code          TEXT PRIMARY KEY,
 *     target_weight REAL NOT NULL,      -- 0–100 percentage
 *     updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
 *   )
 *
 * All operations are synchronous (bun:sqlite) and return plain data objects.
 *
 * @module infrastructure/db/targetAllocationStore
 */

import { getDb } from "./schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Raw row from `portfolio_targets`. */
export interface TargetWeightRow {
  code: string;
  /** Percentage weight, 0–100. */
  target_weight: number;
  /** ISO datetime string (SQLite datetime). */
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Replace (INSERT OR REPLACE) all target weights for the given map.
 *
 * Each entry in `targets` maps a stock code → weight percentage.
 * Existing rows for the same code are replaced; rows for codes NOT in the map
 * are left untouched (use `setTargetWeights` to do a full replace).
 *
 * @param targets - Record mapping stock code → target weight percentage.
 */
export async function setTargetWeights(
  targets: Record<string, number>,
): Promise<void> {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO portfolio_targets (code, target_weight, updated_at)
     VALUES (?, ?, datetime('now'))`,
  );
  for (const [rawCode, weight] of Object.entries(targets)) {
    stmt.run(rawCode.toUpperCase(), weight);
  }
}

/**
 * Insert or replace a single stock target weight.
 *
 * @param code   - Stock code (will be uppercased).
 * @param weight - Target percentage weight (0–100).
 */
export async function upsertTargetWeight(
  code: string,
  weight: number,
): Promise<void> {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO portfolio_targets (code, target_weight, updated_at)
     VALUES (?, ?, datetime('now'))`,
  ).run(code.toUpperCase(), weight);
}

/**
 * Return all target weight rows, ordered by code ascending.
 *
 * @returns Array of {@link TargetWeightRow} — empty array if no targets set.
 */
export async function getTargetWeights(): Promise<TargetWeightRow[]> {
  const db = getDb();
  return db
    .query<TargetWeightRow, []>(
      "SELECT code, target_weight, updated_at FROM portfolio_targets ORDER BY code ASC",
    )
    .all();
}

/**
 * Delete the target weight for a single stock code.
 * No-op if the code doesn't exist.
 *
 * @param code - Stock code (uppercased internally).
 */
export async function deleteTargetWeight(code: string): Promise<void> {
  const db = getDb();
  db.prepare("DELETE FROM portfolio_targets WHERE code = ?").run(
    code.toUpperCase(),
  );
}
