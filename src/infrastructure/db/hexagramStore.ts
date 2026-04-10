/**
 * Infrastructure — Hexagram Store (Task 283)
 *
 * SQLite CRUD for Kinh Dich readings and Markov transition matrix.
 *
 * Tables:
 *   - kinhdich_readings       — one row per reading per stock per timestamp
 *   - hexagram_transitions    — per-stock 64x64 transition count matrix
 *
 * Layer: infrastructure/db (may import from schema.ts, never from domain/)
 */

import { getDb } from "./schema.js";

// DDL is canonical in schema.ts:779-808 via initDatabase(). Tests use
// src/__tests__/helpers/hexagramTestDdl.ts for in-memory setup.

// ---------------------------------------------------------------------------
// Reading CRUD
// ---------------------------------------------------------------------------

export interface KinhDichReadingRow {
  stockCode: string;
  hexagramNumber: number;
  hoQueNumber: number;
  bienQueNumber: number;
  haoStates: string;      // JSON string
  rawScores: string;      // JSON string
  nguHanhDynamic?: string;
  tradingSignal?: string;
  confidence?: number;
  actionNote?: string;
  /** Origin of this reading: 'manual' = on-demand MCP tool call, 'cycle' = 15-min automation */
  source?: 'manual' | 'cycle';
}

/**
 * Insert a new Kinh Dich reading.
 * The optional `source` field tags the origin: 'manual' (default) = on-demand
 * MCP tool call; 'cycle' = automated 15-min intelligence cycle (Task 303).
 */
export function storeReading(row: KinhDichReadingRow): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO kinhdich_readings (
      stock_code, hexagram_number, ho_que_number, bien_que_number,
      hao_states, raw_scores, ngu_hanh_dynamic, trading_signal,
      confidence, action_note, source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.stockCode,
    row.hexagramNumber,
    row.hoQueNumber,
    row.bienQueNumber,
    row.haoStates,
    row.rawScores,
    row.nguHanhDynamic ?? null,
    row.tradingSignal ?? null,
    row.confidence ?? null,
    row.actionNote ?? null,
    row.source ?? 'manual',
  );
}

/**
 * Returns the most recent reading for a stock, or null if none.
 *
 * Extended in Task 303: now also returns `tradingSignal` and `confidence`
 * so the conviction scorer (Task 304) can derive kinhDichScore without a
 * second DB query. These are additive nullable fields — all existing call
 * sites that only destructure `hexagramNumber`/`timestamp` are unaffected.
 */
export function getLatestReading(code: string): {
  hexagramNumber: number;
  hoQueNumber: number;
  bienQueNumber: number;
  haoStates: string;
  timestamp: string;
  /** Trading signal string e.g. "MUA (tich cuc)" — null if not stored */
  tradingSignal: string | null;
  /** Confidence value in [0, 1] — null if not stored */
  confidence: number | null;
} | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT hexagram_number, ho_que_number, bien_que_number, hao_states, timestamp,
           trading_signal, confidence
    FROM kinhdich_readings
    WHERE stock_code = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `).get(code) as {
    hexagram_number: number;
    ho_que_number: number;
    bien_que_number: number;
    hao_states: string;
    timestamp: string;
    trading_signal: string | null;
    confidence: number | null;
  } | null;

  if (!row) return null;
  return {
    hexagramNumber: row.hexagram_number,
    hoQueNumber: row.ho_que_number,
    bienQueNumber: row.bien_que_number,
    haoStates: row.hao_states,
    timestamp: row.timestamp,
    tradingSignal: row.trading_signal,
    confidence: row.confidence,
  };
}

/**
 * Returns readings for a stock within the past `days` days (for backtesting).
 */
export function getReadingsForBacktest(
  code: string,
  days: number,
): Array<{
  id: number;
  stockCode: string;
  timestamp: string;
  hexagramNumber: number;
  tradingSignal: string;
  confidence: number;
}> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, stock_code, timestamp, hexagram_number, trading_signal, confidence
    FROM kinhdich_readings
    WHERE stock_code = ?
      AND timestamp >= datetime('now', ? || ' days')
    ORDER BY timestamp ASC
  `).all(code, -days) as Array<{
    id: number;
    stock_code: string;
    timestamp: string;
    hexagram_number: number;
    trading_signal: string | null;
    confidence: number | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    stockCode: r.stock_code,
    timestamp: r.timestamp,
    hexagramNumber: r.hexagram_number,
    tradingSignal: r.trading_signal ?? "WAIT",
    confidence: r.confidence ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Transition Matrix CRUD
// ---------------------------------------------------------------------------

/**
 * Record a hexagram transition. Uses INSERT OR IGNORE + UPDATE to upsert
 * and increment the count atomically.
 *
 * Optional priceChange5d can be recorded at the time of transition
 * if the outcome is already known (e.g. in backtest seed mode).
 */
export function recordTransition(
  from: number,
  to: number,
  code: string,
  priceChange5d?: number,
): void {
  const db = getDb();
  // Ensure row exists (count starts at 0 so the UPDATE below always increments to 1+)
  db.prepare(`
    INSERT OR IGNORE INTO hexagram_transitions
      (from_hexagram, to_hexagram, stock_code, count, total_price_change_5d, win_count)
    VALUES (?, ?, ?, 0, 0, 0)
  `).run(from, to, code);

  if (priceChange5d !== undefined) {
    const won = priceChange5d > 0 ? 1 : 0;
    db.prepare(`
      UPDATE hexagram_transitions
      SET count = count + 1,
          total_price_change_5d = total_price_change_5d + ?,
          win_count = win_count + ?,
          last_seen = datetime('now')
      WHERE from_hexagram = ? AND to_hexagram = ? AND stock_code = ?
    `).run(priceChange5d, won, from, to, code);
  } else {
    db.prepare(`
      UPDATE hexagram_transitions
      SET count = count + 1,
          last_seen = datetime('now')
      WHERE from_hexagram = ? AND to_hexagram = ? AND stock_code = ?
    `).run(from, to, code);
  }
}

/**
 * Update a transition row with the actual 5-day price change outcome.
 * Called ~5 trading days after the transition was first recorded.
 */
export function updateTransitionOutcome(
  from: number,
  to: number,
  code: string,
  priceChange5d: number,
): void {
  const db = getDb();
  const won = priceChange5d > 0 ? 1 : 0;
  db.prepare(`
    UPDATE hexagram_transitions
    SET total_price_change_5d = total_price_change_5d + ?,
        win_count = win_count + ?
    WHERE from_hexagram = ? AND to_hexagram = ? AND stock_code = ?
  `).run(priceChange5d, won, from, to, code);
}

/**
 * Returns P(to | from) for a specific stock.
 * Returns 0 if the from-hexagram has never been observed.
 */
export function getTransitionProb(
  from: number,
  to: number,
  code: string,
): number {
  const db = getDb();

  // Total transitions out of `from` for this stock
  const totalRow = db.prepare(`
    SELECT SUM(count) AS total
    FROM hexagram_transitions
    WHERE from_hexagram = ? AND stock_code = ?
  `).get(from, code) as { total: number | null };

  const total = totalRow?.total ?? 0;
  if (total === 0) return 0;

  const cellRow = db.prepare(`
    SELECT count
    FROM hexagram_transitions
    WHERE from_hexagram = ? AND to_hexagram = ? AND stock_code = ?
  `).get(from, to, code) as { count: number } | null;

  if (!cellRow) return 0;
  return cellRow.count / total;
}

export interface TransitionRow {
  toHexagram: number;
  probability: number;
  count: number;
  avgPriceChange: number;
  winRate: number;
}

/**
 * Returns top-N most likely next hexagrams given the current hexagram,
 * sorted by count descending.
 */
export function getTopTransitions(
  from: number,
  code: string,
  topN = 5,
): TransitionRow[] {
  const db = getDb();

  // Get all transition rows for this (from, stock)
  const rows = db.prepare(`
    SELECT to_hexagram, count, total_price_change_5d, win_count
    FROM hexagram_transitions
    WHERE from_hexagram = ? AND stock_code = ? AND count > 0
    ORDER BY count DESC
    LIMIT ?
  `).all(from, code, topN) as Array<{
    to_hexagram: number;
    count: number;
    total_price_change_5d: number;
    win_count: number;
  }>;

  if (rows.length === 0) return [];

  const total = rows.reduce((s, r) => s + r.count, 0);

  return rows.map((r) => ({
    toHexagram: r.to_hexagram,
    probability: total > 0 ? r.count / total : 0,
    count: r.count,
    avgPriceChange: r.count > 0 ? r.total_price_change_5d / r.count : 0,
    winRate: r.count > 0 ? r.win_count / r.count : 0,
  }));
}

/**
 * Alias kept for compatibility with TECH_046 interface: updateWinRate.
 * Increments or decrements win_count based on `won` flag.
 */
export function updateWinRate(
  from: number,
  to: number,
  code: string,
  won: boolean,
): void {
  const db = getDb();
  db.prepare(`
    UPDATE hexagram_transitions
    SET win_count = win_count + ?
    WHERE from_hexagram = ? AND to_hexagram = ? AND stock_code = ?
  `).run(won ? 1 : 0, from, to, code);
}
