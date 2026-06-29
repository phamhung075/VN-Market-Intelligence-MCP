/**
 * Application Use Case — Get Breadth Thrust (BREADTH-TIME-SERIES)
 *
 * Orchestrates: store queries → domain computations → structured response.
 *
 * Implements BR-FR-1 through BR-FR-6 of the MARKET-INDICATOR-DEPTH-P0 spec:
 *   BR-FR-1: history from market_breadth_history (table status, accruing_since).
 *   BR-FR-2: Advance-Decline Line (ADL).
 *   BR-FR-3: RANA daily + McClellan Osc (null <39) + Summation.
 *   BR-FR-4: Floor Panic / Ceiling FOMO flags.
 *   BR-FR-5: Zweig Thrust detection (null <14 sessions).
 *   BR-FR-6: breadth_z_score gauge-ready scalar (null <21 sessions).
 *            history_quality (INSUFFICIENT/WARMUP/SUFFICIENT).
 *
 * Gauge-Readiness: `breadth_z_score` is the P1 Fear & Greed breadth leg.
 *
 * HARD CONSTRAINTS (no-fake-data):
 *   - Returns {error:'no breadth history'} when table is empty (NFR-BR-3).
 *   - Never fabricates scores — all null conditions are explicit.
 *   - breadth_z_score is ALWAYS present in the response (never omitted), per spec.
 *
 * DDD layer: application/usecases — orchestrates domain + infrastructure.
 *
 * @module application/usecases/getBreadthThrust
 */

import type { Database } from "bun:sqlite";
import {
  computeAdl,
  computeRana,
  computeMcLellanOsc,
  computeMcLellanSummation,
  computeFloorCeiling,
  computeZweigThrust,
  computeHistoryQuality,
  computeBreadthZScore,
  toGaugeScalar,
  type BreadthRow,
  type HistoryQuality,
  type GaugeReadyScalar,
  type ZweigResult,
  type FloorCeilingResult,
} from "../../domain/services/market-data/breadthCalculator.js";
import {
  getAllBreadthHistory,
  getAccruingSince,
} from "../../infrastructure/db/breadthHistoryStore.js";

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

/** Advance-Decline Line history entry. */
export interface AdlHistoryEntry {
  date: string;
  adl:  number;
}

/** Gauge-Readiness 6-field wrapper for breadth_z_score. */
export type BreadthZScoreGauge = GaugeReadyScalar;

export interface BreadthThrustResponse {
  // ── Quality / provenance ───────────────────────────────────────────────────
  accruing_since:     string | null;
  sessions_accrued:   number;
  history_quality:    HistoryQuality;
  asof:               string | null;  // most recent session_date

  // ── ADL (BR-FR-2) ─────────────────────────────────────────────────────────
  adl:               number | null;   // latest ADL value
  adl_history:       AdlHistoryEntry[]; // last 60 sessions

  // ── RANA + McClellan (BR-FR-3) ─────────────────────────────────────────────
  rana_today:         number | null;     // latest RANA_d value
  mclellan_osc:       number | null;     // null when <39 sessions
  mclellan_summation: number | null;     // null when <39 sessions

  // ── Floor / Ceiling flags (BR-FR-4) ────────────────────────────────────────
  floor_panic:   boolean | null;
  ceiling_fomo:  boolean | null;
  floor_pct:     number  | null;
  ceiling_pct:   number  | null;
  is_halt_day:   boolean | null;

  // ── Zweig Thrust (BR-FR-5) ────────────────────────────────────────────────
  thrust_triggered:      boolean | null;
  thrust_sessions_count: number  | null;
  thrust_possible:       boolean | null;
  zweig_max_consecutive: number  | null;

  // ── Gauge-Ready Scalar (BR-FR-6) — ALWAYS PRESENT, may be null ────────────
  breadth_z_score: BreadthZScoreGauge;

  // ── Source ────────────────────────────────────────────────────────────────
  source_tier: 2;
  source:      string;
  fetched_at:  string;
}

// ---------------------------------------------------------------------------
// ADL history cap
// ---------------------------------------------------------------------------

const ADL_HISTORY_SESSIONS = 60;

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Compute and return the full breadth thrust payload.
 *
 * Returns { error: '...' } when the table is empty (NFR-BR-3).
 * Throws on DB failure — tool handler's catch block is the error boundary.
 */
export async function getBreadthThrust(
  db: Database,
): Promise<BreadthThrustResponse | { error: string }> {
  const rows: BreadthRow[] = getAllBreadthHistory(db);
  const totalSessions = rows.length;

  // NFR-BR-3: return error when table is empty
  if (totalSessions === 0) {
    return { error: 'no breadth history — market_breadth_history is empty; accrual starts on next trading day' };
  }

  const accruing_since = await Promise.resolve(getAccruingSince(db));
  const quality: HistoryQuality = computeHistoryQuality(totalSessions);
  const latestRow = rows[rows.length - 1]!;
  const asof = latestRow.session_date;
  const fetchedAt = new Date().toISOString();

  // ── BR-FR-2: ADL ──────────────────────────────────────────────────────────
  const adlValues = computeAdl(rows);
  const latestAdl = adlValues[adlValues.length - 1] ?? null;

  // ADL history: last 60 sessions
  const adlHistorySlice = rows.slice(-ADL_HISTORY_SESSIONS);
  const adlValuesSlice  = adlValues.slice(-ADL_HISTORY_SESSIONS);
  const adl_history: AdlHistoryEntry[] = adlHistorySlice.map((r, i) => ({
    date: r.session_date,
    adl:  adlValuesSlice[i] ?? 0,
  }));

  // ── BR-FR-3: RANA + McClellan ─────────────────────────────────────────────
  const rana_today = computeRana(latestRow);
  const oscSeries   = computeMcLellanOsc(rows);
  const sumSeries   = computeMcLellanSummation(oscSeries);
  const mclellan_osc        = oscSeries[oscSeries.length - 1] ?? null;
  const mclellan_summation  = sumSeries[sumSeries.length - 1] ?? null;

  // ── BR-FR-4: Floor / Ceiling ──────────────────────────────────────────────
  const fc: FloorCeilingResult = computeFloorCeiling(latestRow);

  // ── BR-FR-5: Zweig Thrust ─────────────────────────────────────────────────
  const zweig: ZweigResult = computeZweigThrust(rows);

  // ── BR-FR-6: breadth_z_score + history_quality ────────────────────────────
  const rawZScore = computeBreadthZScore(oscSeries, totalSessions);
  const nullReason: string | undefined =
    totalSessions < 21      ? 'sessions_below_21'       :
    mclellan_osc === null   ? 'mclellan_warmup_below_39' :
    rawZScore === null       ? 'insufficient_osc_variance' :
    undefined;

  const breadth_z_score: BreadthZScoreGauge = toGaugeScalar(
    rawZScore,
    'z-score',
    asof,
    quality,
    nullReason,
  );

  return {
    accruing_since,
    sessions_accrued:   totalSessions,
    history_quality:    quality,
    asof,

    adl: latestAdl,
    adl_history,

    rana_today,
    mclellan_osc,
    mclellan_summation,

    floor_panic:  fc.floor_panic,
    ceiling_fomo: fc.ceiling_fomo,
    floor_pct:    fc.floor_pct,
    ceiling_pct:  fc.ceiling_pct,
    is_halt_day:  fc.is_halt_day,

    thrust_triggered:      zweig.thrust_triggered,
    thrust_sessions_count: zweig.thrust_sessions_count,
    thrust_possible:       zweig.thrust_possible,
    zweig_max_consecutive: zweig.max_consecutive,

    // ALWAYS PRESENT (never omitted) — breadth leg for P1 Fear & Greed gauge
    breadth_z_score,

    source_tier: 2,
    source:      'market_breadth_history (persisted from vndirect:api-finfo.vndirect.com.vn/v4/vnmarket_prices)',
    fetched_at:  fetchedAt,
  };
}
