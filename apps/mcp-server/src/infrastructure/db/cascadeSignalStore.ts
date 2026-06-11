/**
 * cascadeSignalStore.ts
 *
 * Read-only infrastructure store for `cascade_rule_hits` — TASK17-PAGE10 sector cascade signals.
 *
 * Table: cascade_rule_hits
 *   id INTEGER PRIMARY KEY
 *   rule_key TEXT NOT NULL            -- "{sector}_{up|down|neutral}", e.g. "pharma_neutral"
 *   matched_text TEXT NOT NULL DEFAULT ''
 *   affected_sector TEXT             -- authoritative sector key; may be NULL
 *   affected_stocks TEXT             -- mostly empty string; may be comma list or JSON
 *   hit_at TEXT NOT NULL DEFAULT (datetime('now'))  -- "YYYY-MM-DD HH:MM:SS" (space, no T, no Z)
 *   source_rag_id TEXT
 *   price_impact_3d REAL             -- mostly NULL — do NOT feature
 *   price_impact_7d REAL             -- mostly NULL — do NOT feature
 *   outcome_correct INTEGER
 *   confidence REAL                  -- mostly NULL — pass as-is, do NOT feature
 *
 * Live stats (probed 2026-06-11 against named-volume DB):
 *   8,570 rows total, span 2026-02-16 → 2026-06-11
 *   7-day window (≥ 2026-06-04): ~416 rows
 *   rule_key taxonomy: pharma_neutral(170/7d), banking_neutral(19), securities_neutral(18),
 *   gold_mining_up(10), real_estate_up(13), securities_down(11), steel_neutral(13), etc.
 *   hit_at format: "YYYY-MM-DD HH:MM:SS" — compare with same format string (no ISO T/Z).
 *
 * Layer: infrastructure/db — NO domain imports.
 * All queries parameterized with `?` — never string-interpolate.
 *
 * @module infrastructure/db/cascadeSignalStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row from cascade_rule_hits, shaped for the sector cascade endpoint.
 * confidence is nullable — do NOT coerce to any sentinel value; handler decides display.
 */
export type CascadeHitRow = {
  rule_key: string;
  affected_sector: string | null;
  affected_stocks: string | null;
  matched_text: string;
  hit_at: string;
  confidence: number | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return cascade_rule_hits rows within the given time window, ordered hit_at DESC.
 *
 * @param db       - SQLite database instance (injected by handler / tests)
 * @param sinceIso - Lower bound for hit_at in "YYYY-MM-DD HH:MM:SS" format
 *                   (same format as the column — string comparison works correctly)
 * @param limit    - Max rows to return (default 5000, well above any 7-day window count)
 * @returns Array of CascadeHitRow ordered hit_at DESC
 */
export function getCascadeHitsSince(
  db: Database,
  sinceIso: string,
  limit = 5000,
): CascadeHitRow[] {
  return db
    .prepare(
      `SELECT rule_key, affected_sector, affected_stocks, matched_text, hit_at, confidence
       FROM cascade_rule_hits
       WHERE hit_at >= ?
       ORDER BY hit_at DESC
       LIMIT ?`,
    )
    .all(sinceIso, limit) as CascadeHitRow[];
}
