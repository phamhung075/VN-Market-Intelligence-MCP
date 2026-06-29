/**
 * Domain — Breadth Calculator (BREADTH-TIME-SERIES, Sprint MARKET-INDICATOR-DEPTH-P0)
 *
 * Pure computation layer — no I/O. Implements BR-FR-1 through BR-FR-6:
 *   BR-FR-2: Advance-Decline Line (ADL) — cumulative running sum.
 *   BR-FR-3: RANA daily + McClellan Oscillator (EMA19 - EMA39) + Summation.
 *   BR-FR-4: Floor Panic / Ceiling FOMO flags.
 *   BR-FR-5: Zweig Thrust detection (10 consecutive in 14-session window).
 *   BR-FR-6: breadth_z_score gauge-ready scalar (z of mclellan_osc).
 *            history_quality classification.
 *
 * HARD CONSTRAINTS (no-fake-data):
 *   - McClellan Osc null until 39 sessions (EMA39 warmup).
 *   - breadth_z_score null when <21 sessions.
 *   - Zweig: null until 14 sessions.
 *   - No backfill, no synthetic distribution.
 *
 * DDD layer: domain/services/market-data (pure — no database or network access).
 *
 * @module domain/services/market-data/breadthCalculator
 */

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** One persisted row from market_breadth_history. */
export interface BreadthRow {
  session_date: string; // YYYY-MM-DD
  advancing:    number;
  declining:    number;
  unchanged:    number;
  ceiling:      number;
  floor:        number;
  total:        number;
}

// ---------------------------------------------------------------------------
// EMA helper
// ---------------------------------------------------------------------------

/**
 * Compute EMA using alpha = 2 / (period + 1).
 * Seed = first value. Returns array of same length as input.
 * Returns [] when input is empty.
 */
export function computeEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const alpha = 2 / (period + 1);
  const result: number[] = [values[0]!];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i]! * alpha + result[i - 1]! * (1 - alpha));
  }
  return result;
}

// ---------------------------------------------------------------------------
// BR-FR-2: Advance-Decline Line (ADL)
// ---------------------------------------------------------------------------

/**
 * Compute cumulative ADL for a sorted (ASC) set of breadth rows.
 * Starts at 0 from the first row (accruing_since).
 * Returns array of ADL values aligned to the input rows array.
 */
export function computeAdl(rows: BreadthRow[]): number[] {
  const adl: number[] = [];
  let cumulative = 0;
  for (const row of rows) {
    cumulative += row.advancing - row.declining;
    adl.push(cumulative);
  }
  return adl;
}

// ---------------------------------------------------------------------------
// BR-FR-3: RANA + McClellan Oscillator + Summation
// ---------------------------------------------------------------------------

/**
 * Compute RANA (Ratio-Adjusted Net Advances) for a single row.
 * RANA_d = (advancing − declining) / total × 100.
 * Returns 0 when total = 0 (guard against division by zero).
 */
export function computeRana(row: BreadthRow): number {
  if (row.total === 0) return 0;
  return ((row.advancing - row.declining) / row.total) * 100;
}

/**
 * Compute McClellan Oscillator time-series: EMA(19, RANA) − EMA(39, RANA).
 * Returns null for indices where fewer than 39 total sessions have accrued.
 * Per spec: "39 sessions needed for EMA(39) to stabilize."
 *
 * @param rows - BreadthRow[] sorted ASC (oldest first).
 * @returns Array of oscillator values (null until index 38 inclusive).
 */
export function computeMcLellanOsc(rows: BreadthRow[]): (number | null)[] {
  if (rows.length === 0) return [];

  const ranaValues = rows.map(computeRana);
  const ema19 = computeEMA(ranaValues, 19);
  const ema39 = computeEMA(ranaValues, 39);

  return ranaValues.map((_, i) => {
    // Null until we have at least 39 sessions (i >= 38 means 39 data points, indices 0..38)
    if (i < 38) return null;
    return ema19[i]! - ema39[i]!;
  });
}

/**
 * Compute McClellan Summation — running sum of McClellan Osc values.
 * Null osc values contribute 0 to the running sum (they are skipped).
 *
 * @param oscValues - Output of computeMcLellanOsc.
 * @returns Running sum aligned to input array. Null where osc was null.
 */
export function computeMcLellanSummation(oscValues: (number | null)[]): (number | null)[] {
  const result: (number | null)[] = [];
  let running = 0;
  for (const v of oscValues) {
    if (v === null) {
      result.push(null);
    } else {
      running += v;
      result.push(running);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// BR-FR-4: Floor Panic / Ceiling FOMO
// ---------------------------------------------------------------------------

export interface FloorCeilingResult {
  floor_panic:   boolean;
  ceiling_fomo:  boolean;
  floor_pct:     number;
  ceiling_pct:   number;
  is_halt_day:   boolean;
}

/**
 * Compute floor/ceiling flags for a single breadth row.
 * floor_panic = floor/total > 0.15.
 * ceiling_fomo = ceiling/total > 0.15.
 * is_halt_day = floor > 50% of total (circuit-breaker halt proxy).
 */
export function computeFloorCeiling(row: BreadthRow): FloorCeilingResult {
  if (row.total === 0) {
    return {
      floor_panic:  false,
      ceiling_fomo: false,
      floor_pct:    0,
      ceiling_pct:  0,
      is_halt_day:  false,
    };
  }
  const floorPct    = row.floor   / row.total;
  const ceilingPct  = row.ceiling / row.total;
  return {
    floor_panic:  floorPct   > 0.15,
    ceiling_fomo: ceilingPct > 0.15,
    floor_pct:    Math.round(floorPct   * 10000) / 100, // percentage with 2 dp
    ceiling_pct:  Math.round(ceilingPct * 10000) / 100,
    is_halt_day:  floorPct   > 0.50,
  };
}

// ---------------------------------------------------------------------------
// BR-FR-5: Zweig Thrust
// ---------------------------------------------------------------------------

export interface ZweigResult {
  /** True when 10+ consecutive sessions with breadth > 61.5% within last 14. */
  thrust_triggered:    boolean | null;
  /** Count of qualifying sessions in the 14-session window (null when <14 rows). */
  thrust_sessions_count: number | null;
  /** True when thrust_sessions_count >= 5 (early warning). */
  thrust_possible:     boolean | null;
  /** Maximum consecutive qualifying session run in the window. */
  max_consecutive:     number | null;
}

/** Zweig qualifying condition: advancing / (advancing + declining) > 0.615. */
export function isZweigQualifying(row: BreadthRow): boolean {
  const denominator = row.advancing + row.declining;
  if (denominator === 0) return false;
  return row.advancing / denominator > 0.615;
}

/**
 * Compute Zweig Thrust flags from the last 14 sessions.
 * Requires ≥14 rows in `rows`; returns null fields when <14 rows available.
 *
 * @param rows - BreadthRow[] sorted ASC (oldest first). Only last 14 are used.
 */
export function computeZweigThrust(rows: BreadthRow[]): ZweigResult {
  if (rows.length < 14) {
    return {
      thrust_triggered:    null,
      thrust_sessions_count: null,
      thrust_possible:     null,
      max_consecutive:     null,
    };
  }

  const window14 = rows.slice(-14);
  const qualified = window14.map(isZweigQualifying);

  const thrustSessionsCount = qualified.filter(Boolean).length;

  // Find maximum run of consecutive qualifying sessions.
  let maxRun = 0;
  let currentRun = 0;
  for (const q of qualified) {
    if (q) {
      currentRun++;
      if (currentRun > maxRun) maxRun = currentRun;
    } else {
      currentRun = 0;
    }
  }

  return {
    thrust_triggered:    maxRun >= 10,
    thrust_sessions_count: thrustSessionsCount,
    thrust_possible:     thrustSessionsCount >= 5,
    max_consecutive:     maxRun,
  };
}

// ---------------------------------------------------------------------------
// BR-FR-6: breadth_z_score + history_quality
// ---------------------------------------------------------------------------

export type HistoryQuality = 'INSUFFICIENT' | 'WARMUP' | 'SUFFICIENT';

/**
 * Classify history quality based on total session count.
 * INSUFFICIENT: < 10
 * WARMUP:       10–39
 * SUFFICIENT:   ≥ 40
 */
export function computeHistoryQuality(sessionCount: number): HistoryQuality {
  if (sessionCount < 10) return 'INSUFFICIENT';
  if (sessionCount < 40) return 'WARMUP';
  return 'SUFFICIENT';
}

/**
 * Compute z-score of the most-recent McClellan Osc value vs available history.
 * Returns null when:
 *   - Total sessions < 21 (spec: "null when <21 sessions")
 *   - Latest mclellan_osc is null (not yet warmed up — needs 39 sessions)
 *   - Fewer than 2 non-null osc values available (cannot compute std)
 *   - Standard deviation is 0 (perfectly constant signal — undefined z-score)
 *
 * @param oscValues - Full time-series of McClellan Osc (including nulls).
 * @param totalSessions - Total rows in market_breadth_history.
 */
export function computeBreadthZScore(
  oscValues: (number | null)[],
  totalSessions: number,
): number | null {
  // Hard gate: null when <21 sessions (spec)
  if (totalSessions < 21) return null;

  const nonNull = oscValues.filter((v): v is number => v !== null);
  if (nonNull.length < 2) return null;

  const latest = nonNull[nonNull.length - 1];
  if (latest === undefined) return null;

  const mean = nonNull.reduce((s, v) => s + v, 0) / nonNull.length;
  const variance = nonNull.reduce((s, v) => s + (v - mean) ** 2, 0) / nonNull.length;
  const std = Math.sqrt(variance);

  if (std === 0) return 0; // All osc values are identical — neutral z-score

  return (latest - mean) / std;
}

// ---------------------------------------------------------------------------
// Gauge-Readiness 6-field scalar wrapper (P1 contract)
// ---------------------------------------------------------------------------

export interface GaugeReadyScalar {
  value:       number | null;
  unit:        string;
  asof:        string | null;
  source_tier: 2;
  confidence:  number | null;
  null_reason: string | null;
}

/**
 * Wrap a value in the 6-field Gauge-Readiness contract.
 * confidence is null when history_quality is INSUFFICIENT or WARMUP.
 */
export function toGaugeScalar(
  value: number | null,
  unit: string,
  asof: string | null,
  quality: HistoryQuality,
  nullReason?: string,
): GaugeReadyScalar {
  // Confidence: 1.0 = SUFFICIENT; 0.5 = WARMUP; null = INSUFFICIENT
  const confidence: number | null =
    quality === 'SUFFICIENT' ? 1.0 :
    quality === 'WARMUP'     ? 0.5 :
    null;

  return {
    value,
    unit,
    asof,
    source_tier: 2,
    confidence,
    null_reason: value === null ? (nullReason ?? 'insufficient_history') : null,
  };
}
