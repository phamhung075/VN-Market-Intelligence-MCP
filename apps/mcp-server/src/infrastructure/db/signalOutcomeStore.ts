/**
 * signalOutcomeStore.ts — Signal outcome feedback loop (2026-05-17)
 *
 * Manages the signal_outcomes table: seeding, resolution, and accuracy stats.
 *
 * Functions:
 *   - seedSignalOutcome()      — insert pending outcome row after signal write
 *   - resolveSignalOutcomes()  — hourly scan that fetches prices and classifies outcomes
 *   - getAccuracyStats()       — per-(stock_code, signal_type) accuracy aggregation
 *
 * Price strategy: queries market_prices_history (Option A) first; falls back to
 * the stock-price service HTTP API (Option B) when intraday data is absent
 * (weekend/holiday gap).
 *
 * DDD layer: infrastructure/db — may import from domain/.
 * MUST NOT import from application/ or interface/.
 */

import type { Database } from "bun:sqlite";
import { getPriceHistory } from "../microservices/clients.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SeedSignalOutcomeInput {
  stockCode: string;
  signalType: string;
  fromAgent: string;
  predictedDirection: string; // normalised to uppercase before insert
  createdAt: string;          // ISO-8601 UTC (YYYY-MM-DD HH:MM:SS format matching SQLite)
}

/** Accuracy stats for one (stock_code, signal_type) group. */
export interface SignalAccuracyStats {
  signal_type: string;
  stock_code: string;
  /** correct + incorrect only (neutral excluded). */
  sample_count: number;
  /** correct / (correct + incorrect), or null when sample_count < 3. */
  accuracy_rate: number | null;
  avg_confidence_when_correct: number | null;
  avg_confidence_when_incorrect: number | null;
  last_evaluated_at: string | null;
}

export interface ResolveOutcomesResult {
  evaluated24h: number;
  evaluated48h: number;
  resolved: number;
  skipped: number;
}

export interface ResolveOutcomesDeps {
  /** Injectable Option-B history fetcher — defaults to fetchPriceFromStockService (tests only). */
  fetchHistoryFn?: (code: string, targetDate: string) => Promise<number | null>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normalise direction string to uppercase BULLISH / BEARISH / NEUTRAL. */
function normaliseDirection(raw: unknown): string {
  if (typeof raw !== "string") return "NEUTRAL";
  const upper = raw.toUpperCase().trim();
  if (upper === "BULLISH" || upper === "BUY" || upper === "UP" || upper === "LONG") return "BULLISH";
  if (upper === "BEARISH" || upper === "SELL" || upper === "DOWN" || upper === "SHORT") return "BEARISH";
  return "NEUTRAL";
}

/**
 * Classify outcome from pct change and predicted direction.
 * Uses 1.0% threshold (from architecture brief §3).
 */
function classifyOutcome(pct: number, direction: string): "correct" | "incorrect" | "neutral" {
  if (Math.abs(pct) < 1.0) return "neutral";
  if (direction === "BULLISH") {
    return pct >= 1.0 ? "correct" : "incorrect";
  }
  if (direction === "BEARISH") {
    return pct <= -1.0 ? "correct" : "incorrect";
  }
  return "neutral"; // NEUTRAL direction → always neutral
}

/**
 * Fetch price from market_prices_history for a ±30 min window around a given time.
 * Returns null when no data is found (weekend/holiday gap).
 */
function fetchPriceFromHistory(
  db: Database,
  code: string,
  refTime: string,
  offsetMinutesBefore: number,
  offsetMinutesAfter: number,
): number | null {
  // Build window boundaries via SQLite datetime arithmetic
  const lowerRow = db
    .prepare<{ t: string }, [string, string]>(
      `SELECT datetime(?, ?) AS t`,
    )
    .get(refTime, `-${offsetMinutesBefore} minutes`);
  const upperRow = db
    .prepare<{ t: string }, [string, string]>(
      `SELECT datetime(?, ?) AS t`,
    )
    .get(refTime, `+${offsetMinutesAfter} minutes`);

  const lower = lowerRow?.t;
  const upper = upperRow?.t;
  if (!lower || !upper) return null;

  const row = db
    .prepare<{ avg_price: number | null }, [string, string, string]>(
      `SELECT AVG(price) AS avg_price
         FROM market_prices_history
        WHERE code = ?
          AND fetched_at >= ?
          AND fetched_at <= ?`,
    )
    .get(code, lower, upper);
  return row?.avg_price ?? null;
}

/**
 * Fetch price from stock-price service (Option B fallback).
 * Uses the canonical getPriceHistory client (infrastructure/microservices/clients.ts)
 * instead of a hand-rolled fetch — the Go service's GET /price/history response is the
 * envelope `{ code, history: DailyOHLCV[] }`, NOT a flat array.
 *
 * FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED root cause: the previous local implementation
 * parsed the response as a flat `{date,close}[]` array — `Array.isArray(data)` was always
 * false against the real `{code,history}` envelope, so this fallback returned null on
 * EVERY call and was permanently dead code in production (same defect class already fixed
 * once for verdictResolutionJob.ts's defaultFetchHistory, task 1945a — signalOutcomeStore.ts
 * had an independent, never-updated duplicate). It also hardcoded `days=3`, which only ever
 * returns the 3 MOST RECENT trading days from "now" regardless of targetDate — useless for
 * resolving anything more than ~3 days in the past. `days` is now derived from the actual
 * gap between now and targetDate (Go service corpus verified >=170 trading days deep).
 *
 * Returns null on any error (network, parse, or no matching day within 2 calendar days).
 */
async function fetchPriceFromStockService(
  code: string,
  targetDate: string, // YYYY-MM-DD
): Promise<number | null> {
  try {
    const target = new Date(`${targetDate}T00:00:00Z`).getTime();
    if (Number.isNaN(target)) return null;

    const daysGap = Math.ceil((Date.now() - target) / 86_400_000);
    // +5-day buffer absorbs weekends/holidays between targetDate and now.
    // Floor 3 matches the original narrow-window default; cap 400 avoids an
    // unbounded request (well beyond the service's verified history depth).
    const days = Math.min(400, Math.max(3, daysGap + 5));

    const envelope = await getPriceHistory({ code, days });
    const history = envelope.history;
    if (!Array.isArray(history) || history.length === 0) return null;

    // Find the row with date closest to targetDate
    let best: { date: string; close: number } | null = null;
    let bestDiff = Infinity;
    for (const row of history) {
      if (typeof row.close !== "number") continue;
      const diff = Math.abs(new Date(row.date).getTime() - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = row;
      }
    }
    // Only use if within 2 calendar days
    if (best && bestDiff <= 2 * 86_400_000) return best.close;
    return null;
  } catch {
    return null;
  }
}

// ── seedSignalOutcome ──────────────────────────────────────────────────────

/**
 * Insert a pending outcome row into signal_outcomes immediately after a signal write.
 *
 * Skips insert when:
 *   - predictedDirection normalises to NEUTRAL
 *   - stockCode is null/empty
 *
 * Baseline price is deferred to the first hourly resolution scan (no HTTP call here).
 *
 * @param db       - Active bun:sqlite Database connection
 * @param signalId - Newly inserted agent_signals row ID
 * @param input    - Seed parameters derived from PostSignalInput
 */
export function seedSignalOutcome(
  db: Database,
  signalId: number,
  input: SeedSignalOutcomeInput,
): void {
  const direction = normaliseDirection(input.predictedDirection);
  if (direction === "NEUTRAL") return; // NEUTRAL signals excluded (no directional claim)
  if (!input.stockCode) return;

  // Guard: signal_outcomes table may not yet exist on very old DBs
  try {
    db.prepare(`SELECT id FROM signal_outcomes LIMIT 0`).all();
  } catch {
    return; // table absent — migration guard, silently skip
  }

  db.prepare(`
    INSERT INTO signal_outcomes
      (signal_id, stock_code, signal_type, from_agent, predicted_direction, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    signalId,
    input.stockCode,
    input.signalType,
    input.fromAgent,
    direction,
    input.createdAt,
  );
}

// ── resolveSignalOutcomes ──────────────────────────────────────────────────

/**
 * Hourly cron scan: find pending outcome rows past their window and resolve them.
 *
 * For windowHours = 24: finds rows where outcome_24h = 'pending' AND created_at <= now - 24h.
 * For windowHours = 48: finds rows where outcome_48h = 'pending' AND created_at <= now - 48h.
 *
 * Price lookup strategy:
 *   Option A: market_prices_history ±30 min around the target time offset.
 *   Option B: stock-price service daily OHLCV when Option A returns null.
 *
 * @param db          - Active bun:sqlite Database connection
 * @param windowHours - 24 or 48
 * @param deps        - Injectable deps (tests only); production uses fetchPriceFromStockService
 */
export async function resolveSignalOutcomes(
  db: Database,
  windowHours: 24 | 48,
  deps: ResolveOutcomesDeps = {},
): Promise<ResolveOutcomesResult> {
  const fetchHistoryFn = deps.fetchHistoryFn ?? fetchPriceFromStockService;

  // Guard: table may not exist
  try {
    db.prepare(`SELECT id FROM signal_outcomes LIMIT 0`).all();
  } catch {
    return { evaluated24h: 0, evaluated48h: 0, resolved: 0, skipped: 0 };
  }

  const outcomeCol = windowHours === 24 ? "outcome_24h" : "outcome_48h";
  const priceCol   = windowHours === 24 ? "price_at_24h" : "price_at_48h";

  interface PendingRow {
    id: number;
    signal_id: number;
    stock_code: string;
    signal_type: string;
    predicted_direction: string;
    price_at_signal: number | null;
    created_at: string;
    outcome_24h: string;
    outcome_48h: string;
  }

  const rows = db
    .prepare<PendingRow, []>(
      `SELECT id, signal_id, stock_code, signal_type, predicted_direction,
              price_at_signal, created_at, outcome_24h, outcome_48h
         FROM signal_outcomes
        WHERE ${outcomeCol} = 'pending'
          AND created_at <= datetime('now', '-${windowHours} hours')
        ORDER BY id ASC`,
    )
    .all();

  let resolved = 0;
  let skipped = 0;

  for (const row of rows) {
    // 1. Fetch baseline price if not yet stored
    let baseline = row.price_at_signal;
    if (baseline === null) {
      baseline = fetchPriceFromHistory(db, row.stock_code, row.created_at, 15, 15);
      // Widen to +60 min if 30-min window is empty
      if (baseline === null) {
        baseline = fetchPriceFromHistory(db, row.stock_code, row.created_at, 0, 60);
      }
      // Option B fallback (FIX-SIGNAL-OUTCOMES-RESOLUTION-STALLED): market_prices_history
      // is an intraday cache with a rolling ~24h retention purge (pushPricesHandler.ts). By
      // the time this scan first looks at a row (created_at is already >= windowHours old
      // per the WHERE clause above), Option A's window around created_at has typically
      // already rolled off. Without this fallback, baseline NEVER resolves for any row
      // older than ~1 day and the row is skipped forever — permanently stuck 'pending'
      // (this was the primary root cause: 102/105 live rows had price_at_signal IS NULL).
      if (baseline === null) {
        baseline = await fetchHistoryFn(row.stock_code, row.created_at.slice(0, 10));
      }
      if (baseline !== null) {
        db.prepare(`UPDATE signal_outcomes SET price_at_signal = ? WHERE id = ?`)
          .run(baseline, row.id);
      }
    }

    if (baseline === null || baseline === 0) {
      skipped++;
      continue;
    }

    // 2. Fetch T+Nh price
    // Option A: market_prices_history ±30 min window
    const offsetCenter = windowHours * 60; // minutes
    let resPrice: number | null = fetchPriceFromHistory(
      db, row.stock_code, row.created_at,
      -offsetCenter + 30, // startOffset relative to created_at: -(-T + 30) → T - 30
      offsetCenter + 30,  // endOffset: T + 30
    );

    // More precise: use datetime modifiers correctly — compute target timestamp
    // SQLite datetime arithmetic: target = created_at + windowHours hours
    const targetRow = db
      .prepare<{ target_ts: string }, [string, number]>(
        `SELECT datetime(?, '+' || ? || ' hours') AS target_ts`,
      )
      .get(row.created_at, windowHours);
    const targetTs = targetRow?.target_ts ?? null;

    if (targetTs) {
      resPrice = fetchPriceFromHistory(db, row.stock_code, targetTs, 30, 30);
    }

    // Option B fallback: stock-price service
    if (resPrice === null && targetTs) {
      const targetDate = targetTs.slice(0, 10); // YYYY-MM-DD
      resPrice = await fetchHistoryFn(row.stock_code, targetDate);
    }

    if (resPrice === null) {
      skipped++;
      continue;
    }

    const pct = ((resPrice - baseline) / baseline) * 100;
    const outcome = classifyOutcome(pct, row.predicted_direction);

    // Determine if both windows are now resolved after this update
    const otherCol = windowHours === 24 ? "outcome_48h" : "outcome_24h";
    const otherResolved = row[otherCol as keyof PendingRow] !== "pending";

    const checkedAt = otherResolved
      ? new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "")
      : null;

    db.prepare(`
      UPDATE signal_outcomes
         SET ${priceCol} = ?,
             ${outcomeCol} = ?,
             checked_at = COALESCE(checked_at, ?)
       WHERE id = ?
    `).run(resPrice, outcome, checkedAt, row.id);

    resolved++;
  }

  return {
    evaluated24h: windowHours === 24 ? rows.length : 0,
    evaluated48h: windowHours === 48 ? rows.length : 0,
    resolved,
    skipped,
  };
}

// ── getSystemAccuracyDigestStats ───────────────────────────────────────────

/** Per-signal-type accuracy, aggregated across all stocks (min 3 resolved samples). */
export interface SignalTypeAccuracy {
  signal_type: string;
  correct: number;
  total: number;
  /** correct / total, already computed (0–1). */
  rate: number;
}

/**
 * System-level accuracy digest stats for the WORK daily Telegram digest.
 *
 * `neutralOnlyRows` is CRITICAL: distinguishes AC-3 (graceful skip — empty table)
 * from AC-8 (all-neutral short digest — rows exist but none directionally resolved).
 */
export interface SystemAccuracyDigestStats {
  /** correct + incorrect rows only (neutral excluded). */
  totalResolved: number;
  totalCorrect: number;
  /** null when totalResolved < 10. */
  overallRate: number | null;
  /** Signal types with ≥ 3 resolved samples; rate = correct/total. */
  bySignalType: SignalTypeAccuracy[];
  /** Stocks with < 3 resolved rows across all signal types. */
  newStocksCount: number;
  /** Rows with outcome_24h='neutral' AND predicted_direction!='NEUTRAL'. AC-8 discriminator. */
  neutralOnlyRows: number;
}

/**
 * Compute system-wide accuracy digest stats over the past `days` days.
 *
 * Uses 4 separate SQLite queries (architect design decision FR-2): each allows
 * the SQLite planner to optimise independently, avoiding CTE planner confusion.
 *
 * Index coverage: idx_signal_outcomes_created_at, idx_signal_outcomes_stock_code.
 * Expected runtime: ≤200 ms on 50k-row table (AC-10).
 *
 * @param db   - Active bun:sqlite Database connection
 * @param days - Look-back window in days (default 30)
 */
export function getSystemAccuracyDigestStats(
  db: Database,
  days = 30,
): SystemAccuracyDigestStats {
  const zero: SystemAccuracyDigestStats = {
    totalResolved: 0,
    totalCorrect: 0,
    overallRate: null,
    bySignalType: [],
    newStocksCount: 0,
    neutralOnlyRows: 0,
  };

  // Guard: table may not exist
  try {
    db.prepare(`SELECT id FROM signal_outcomes LIMIT 0`).all();
  } catch {
    return zero;
  }

  try {
    // Query 1: Per-signal-type aggregation (GROUP BY signal_type, HAVING total >= 3)
    type SigRow = { signal_type: string; correct: number; total: number };
    const sigRows = db
      .prepare<SigRow, []>(
        `SELECT
           signal_type,
           COUNT(CASE WHEN outcome_24h = 'correct' THEN 1 END) AS correct,
           COUNT(CASE WHEN outcome_24h IN ('correct','incorrect') THEN 1 END) AS total
         FROM signal_outcomes
         WHERE predicted_direction != 'NEUTRAL'
           AND created_at >= datetime('now', '-${days} days')
         GROUP BY signal_type
         HAVING total >= 3
         ORDER BY signal_type`,
      )
      .all();

    const bySignalType: SignalTypeAccuracy[] = sigRows.map((r) => ({
      signal_type: r.signal_type,
      correct: r.correct,
      total: r.total,
      rate: r.total > 0 ? r.correct / r.total : 0,
    }));

    // Query 2: System-level totals
    type TotalsRow = { totalResolved: number; totalCorrect: number };
    const totals = db
      .prepare<TotalsRow, []>(
        `SELECT
           COUNT(CASE WHEN outcome_24h IN ('correct','incorrect') THEN 1 END) AS totalResolved,
           COUNT(CASE WHEN outcome_24h = 'correct' THEN 1 END) AS totalCorrect
         FROM signal_outcomes
         WHERE predicted_direction != 'NEUTRAL'
           AND created_at >= datetime('now', '-${days} days')`,
      )
      .get() ?? { totalResolved: 0, totalCorrect: 0 };

    const totalResolved = totals.totalResolved;
    const totalCorrect = totals.totalCorrect;
    const overallRate = totalResolved >= 10 ? totalCorrect / totalResolved : null;

    // Query 3: New stocks count (< 3 resolved rows)
    type NewStocksRow = { newStocksCount: number };
    const newStocksRow = db
      .prepare<NewStocksRow, []>(
        `SELECT COUNT(*) AS newStocksCount
         FROM (
           SELECT stock_code
           FROM signal_outcomes
           WHERE predicted_direction != 'NEUTRAL'
             AND created_at >= datetime('now', '-${days} days')
           GROUP BY stock_code
           HAVING COUNT(CASE WHEN outcome_24h IN ('correct','incorrect') THEN 1 END) < 3
         )`,
      )
      .get() ?? { newStocksCount: 0 };

    // Query 4: Neutral-only rows (AC-8 discriminator)
    type NeutralRow = { neutralOnlyRows: number };
    const neutralRow = db
      .prepare<NeutralRow, []>(
        `SELECT COUNT(*) AS neutralOnlyRows
         FROM signal_outcomes
         WHERE outcome_24h = 'neutral'
           AND predicted_direction != 'NEUTRAL'
           AND created_at >= datetime('now', '-${days} days')`,
      )
      .get() ?? { neutralOnlyRows: 0 };

    return {
      totalResolved,
      totalCorrect,
      overallRate,
      bySignalType,
      newStocksCount: newStocksRow.newStocksCount,
      neutralOnlyRows: neutralRow.neutralOnlyRows,
    };
  } catch {
    return zero;
  }
}

// ── getAccuracyStats ───────────────────────────────────────────────────────

/** Options for filtering accuracy stats. */
export interface GetAccuracyStatsOpts {
  stockCode?: string;
  signalType?: string;
  /** Look-back window in days (default 30). */
  days?: number;
}

/**
 * Aggregate accuracy stats per (signal_type, stock_code) from signal_outcomes.
 *
 * Uses outcome_24h as the primary accuracy window.
 * Excludes NEUTRAL predicted_direction rows from calculations.
 * Groups with sample_count < 3 have accuracy_rate = null.
 *
 * @param db   - Active bun:sqlite Database connection
 * @param opts - Optional filters (stockCode, signalType, days)
 * @returns    Array of SignalAccuracyStats — one per (signal_type, stock_code) group
 */
export function getAccuracyStats(
  db: Database,
  opts: GetAccuracyStatsOpts = {},
): SignalAccuracyStats[] {
  const days = opts.days ?? 30;

  // Guard: table may not exist
  try {
    db.prepare(`SELECT id FROM signal_outcomes LIMIT 0`).all();
  } catch {
    return [];
  }

  const conditions: string[] = [
    `so.predicted_direction != 'NEUTRAL'`,
    `so.created_at >= datetime('now', '-${days} days')`,
  ];
  const params: (string | number)[] = [];

  if (opts.stockCode) {
    conditions.push(`so.stock_code = ?`);
    params.push(opts.stockCode);
  }
  if (opts.signalType) {
    conditions.push(`so.signal_type = ?`);
    params.push(opts.signalType);
  }

  const where = conditions.join(" AND ");

  type Row = {
    signal_type: string;
    stock_code: string;
    sample_count: number;
    accuracy_rate: number | null;
    avg_confidence_when_correct: number | null;
    avg_confidence_when_incorrect: number | null;
    last_evaluated_at: string | null;
  };

  const rows = db
    .prepare<Row, (string | number)[]>(
      `SELECT
         so.signal_type,
         so.stock_code,
         COUNT(CASE WHEN so.outcome_24h IN ('correct','incorrect') THEN 1 END) AS sample_count,
         CAST(
           SUM(CASE WHEN so.outcome_24h = 'correct' THEN 1.0 ELSE 0 END) /
           NULLIF(COUNT(CASE WHEN so.outcome_24h IN ('correct','incorrect') THEN 1 END), 0)
         AS REAL) AS accuracy_rate,
         AVG(CASE WHEN so.outcome_24h = 'correct'   THEN s.confidence_score END) AS avg_confidence_when_correct,
         AVG(CASE WHEN so.outcome_24h = 'incorrect' THEN s.confidence_score END) AS avg_confidence_when_incorrect,
         MAX(so.checked_at) AS last_evaluated_at
       FROM signal_outcomes so
       LEFT JOIN agent_signals s ON s.id = so.signal_id
       WHERE ${where}
       GROUP BY so.signal_type, so.stock_code
       HAVING sample_count >= 3
       ORDER BY accuracy_rate ASC`,
    )
    .all(...params) as Row[];

  return rows.map((r) => ({
    signal_type: r.signal_type,
    stock_code: r.stock_code,
    sample_count: r.sample_count,
    // accuracy_rate is already null when sample_count < 3 (HAVING clause)
    // but add explicit null guard for safety
    accuracy_rate: r.sample_count >= 3 ? (r.accuracy_rate ?? null) : null,
    avg_confidence_when_correct: r.avg_confidence_when_correct ?? null,
    avg_confidence_when_incorrect: r.avg_confidence_when_incorrect ?? null,
    last_evaluated_at: r.last_evaluated_at ?? null,
  }));
}
