/**
 * kinhDichStore.ts
 *
 * Read-only infrastructure store for `kinhdich_readings` — TASK17-PAGE11 Kinh Dịch signals.
 *
 * Table: kinhdich_readings
 *   id INTEGER PK
 *   stock_code TEXT NOT NULL           -- e.g. "ACB","FPT" (58 distinct symbols)
 *   timestamp TEXT NOT NULL            -- "YYYY-MM-DD HH:MM:SS" (space, no T/Z)
 *   hexagram_number INTEGER NOT NULL   -- 1..64 (quẻ chính)
 *   ho_que_number INTEGER NOT NULL     -- nuclear hexagram (quẻ hỗ)
 *   bien_que_number INTEGER NOT NULL   -- transformed hexagram (quẻ biến)
 *   hao_states TEXT NOT NULL           -- JSON array of 6 line states
 *   raw_scores TEXT NOT NULL           -- JSON array of 6 floats
 *   ngu_hanh_dynamic TEXT              -- nullable, five-element relation
 *   trading_signal TEXT                -- never null in practice; see TAXONOMY
 *   confidence REAL                    -- 0.0..1.0
 *   action_note TEXT                   -- Vietnamese recommendation
 *   source TEXT DEFAULT 'manual'       -- 'cycle' | 'manual'
 *
 * Live stats (probed 2026-06-11 against named-volume DB):
 *   38,430 rows, 58 symbols, span 2026-04-05 → 2026-06-11
 *   source breakdown: 'cycle'=37662, 'manual'=768
 *   0 null trading_signal, 0 null action_note
 *
 * Layer: infrastructure/db — NO domain imports.
 * All queries parameterized — NEVER string-interpolate.
 *
 * @module infrastructure/db/kinhDichStore
 */

import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One row from kinhdich_readings, shaped for the Kinh Dịch signals endpoint.
 * All nullable columns carried as-is; handler/pure-helpers decide display.
 */
export type KinhDichRow = {
  stock_code: string;
  timestamp: string;
  hexagram_number: number;
  ho_que_number: number;
  bien_que_number: number;
  hao_states: string;
  raw_scores: string;
  ngu_hanh_dynamic: string | null;
  trading_signal: string | null;
  confidence: number | null;
  action_note: string | null;
  source: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Read helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the latest reading (MAX timestamp) per stock_code.
 *
 * Uses a correlated subquery to select the single row at MAX(timestamp) for
 * each stock_code in a single prepared statement. 38k rows fit comfortably
 * in memory on any machine.
 *
 * @param db     - SQLite database instance (injected)
 * @param source - "cycle" | "manual" | "all" — filters the source column.
 *                 "all" returns both sources; other values filter exactly.
 * @returns One row per stock_code at its MAX(timestamp), ordered by stock_code ASC.
 */
export function getLatestReadingsPerSymbol(
  db: Database,
  source: "cycle" | "manual" | "all",
): KinhDichRow[] {
  if (source === "all") {
    return db
      .prepare(
        `SELECT stock_code, timestamp, hexagram_number, ho_que_number, bien_que_number,
                hao_states, raw_scores, ngu_hanh_dynamic, trading_signal, confidence,
                action_note, source
         FROM kinhdich_readings k
         WHERE timestamp = (
           SELECT MAX(k2.timestamp)
           FROM kinhdich_readings k2
           WHERE k2.stock_code = k.stock_code
         )
         ORDER BY stock_code ASC`,
      )
      .all() as KinhDichRow[];
  }

  return db
    .prepare(
      `SELECT stock_code, timestamp, hexagram_number, ho_que_number, bien_que_number,
              hao_states, raw_scores, ngu_hanh_dynamic, trading_signal, confidence,
              action_note, source
       FROM kinhdich_readings k
       WHERE source = ?
         AND timestamp = (
           SELECT MAX(k2.timestamp)
           FROM kinhdich_readings k2
           WHERE k2.stock_code = k.stock_code
             AND k2.source = ?
         )
       ORDER BY stock_code ASC`,
    )
    .all(source, source) as KinhDichRow[];
}

/**
 * Return the SECOND-most-recent reading per stock_code (for flip detection).
 *
 * Uses a correlated subquery to find the row whose timestamp is the MAX
 * timestamp strictly LESS THAN the latest for each stock. May return fewer
 * rows than symbols when a stock has only one reading for the given source.
 *
 * @param db     - SQLite database instance (injected)
 * @param source - "cycle" | "manual" | "all"
 * @returns Up to one row per stock_code at its second-most-recent timestamp.
 */
export function getPreviousReadingsPerSymbol(
  db: Database,
  source: "cycle" | "manual" | "all",
): KinhDichRow[] {
  if (source === "all") {
    return db
      .prepare(
        `SELECT stock_code, timestamp, hexagram_number, ho_que_number, bien_que_number,
                hao_states, raw_scores, ngu_hanh_dynamic, trading_signal, confidence,
                action_note, source
         FROM kinhdich_readings k
         WHERE timestamp = (
           SELECT MAX(k2.timestamp)
           FROM kinhdich_readings k2
           WHERE k2.stock_code = k.stock_code
             AND k2.timestamp < (
               SELECT MAX(k3.timestamp)
               FROM kinhdich_readings k3
               WHERE k3.stock_code = k.stock_code
             )
         )
         ORDER BY stock_code ASC`,
      )
      .all() as KinhDichRow[];
  }

  return db
    .prepare(
      `SELECT stock_code, timestamp, hexagram_number, ho_que_number, bien_que_number,
              hao_states, raw_scores, ngu_hanh_dynamic, trading_signal, confidence,
              action_note, source
       FROM kinhdich_readings k
       WHERE source = ?
         AND timestamp = (
           SELECT MAX(k2.timestamp)
           FROM kinhdich_readings k2
           WHERE k2.stock_code = k.stock_code
             AND k2.source = ?
             AND k2.timestamp < (
               SELECT MAX(k3.timestamp)
               FROM kinhdich_readings k3
               WHERE k3.stock_code = k.stock_code
                 AND k3.source = ?
             )
         )
       ORDER BY stock_code ASC`,
    )
    .all(source, source, source) as KinhDichRow[];
}
