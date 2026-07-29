/**
 * Application Use Case — Compute Credit Flow Signal (structured, presentation-free)
 *
 * size-justification: 233L — single cohesive DB-fallback + domain-analysis computation
 * (DEFAULT_RE_CREDIT_TRILLION/deriveMortgageRateFromSbv/readSbvRefinancingRate helpers +
 * the ComputeCreditFlowSignalInput/SurveyDistribution/ComputeCreditFlowSignalResult types
 * + computeCreditFlowSignal itself) extracted verbatim from creditFlowTools.ts; splitting
 * the helpers into a separate file would fragment one already-small, single-purpose unit.
 *
 * Extracted out of interface/mcp/tools/sector/creditFlowTools.ts
 * (FACTORY-GUARD-CI-TSBOUNDARIES-IMPL, 2026-07-29) — this piece is the
 * protocol-agnostic computation (DB-fallback resolution + domain analysis +
 * estimate-provenance flags), with zero MCP/Vietnamese-text-formatting
 * concerns, so it belongs in application/usecases per
 * docs/policies/dev-standards.md § DDD Layer Rules. The interface-layer
 * MCP tool (getCreditFlowSignalHandler in creditFlowTools.ts) now calls
 * this function and builds its Vietnamese `content` text block on top of
 * the returned structured fields — same computation, same output, pure
 * relocation (Fence-B fix: application must not import interface;
 * getMoneyRadarComposite.ts now imports this instead of reaching up into
 * interface/mcp/tools/sector/creditFlowTools.ts).
 *
 * @module application/usecases/computeCreditFlowSignal
 */

import {
  analyzeCreditFlow,
  type CreditData,
  type CreditSignal,
} from "../../domain/services/creditFlowAnalyzer.js";
import { getDb, initDatabase } from "../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants / DB-fallback helpers (Task 1254)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default RE credit outstanding (nghìn tỷ VND).
 * Based on SBV 2024 data: total outstanding RE credit ~2,800 nghìn tỷ VND.
 * Used when DB has no better data available.
 */
export const DEFAULT_RE_CREDIT_TRILLION = 2_800;

/**
 * Typical mortgage-rate spread over SBV refinancing rate.
 * Vietnamese commercial banks price mortgages at refi + 2-3%.
 * Using 2.5% as midpoint.
 */
const MORTGAGE_SPREAD_PCT = 2.5;

/**
 * Derive a mortgage rate estimate from the SBV refinancing rate.
 * mortgage ≈ refinancingRate + 2.5%
 *
 * @param refinancingRatePct - SBV refinancing rate in percent
 */
export function deriveMortgageRateFromSbv(refinancingRatePct: number): number {
  return refinancingRatePct + MORTGAGE_SPREAD_PCT;
}

/**
 * Read the latest SBV refinancing rate from DB.
 * Returns null if DB is not available or has no data.
 */
async function readSbvRefinancingRate(): Promise<{ current: number; previous: number } | null> {
  try {
    await initDatabase();
    const db = getDb();
    const rows = db
      .prepare(
        `SELECT refinancing_rate_pct, fetched_at
         FROM sbv_rates_history
         ORDER BY fetched_at DESC
         LIMIT 60`,
      )
      .all() as Array<{ refinancing_rate_pct: number; fetched_at: string }>;

    if (rows.length === 0) return null;

    const current = rows[0]!.refinancing_rate_pct;
    // Use row ~30 days ago as "previous" — approximately 30 rows back at 30min interval
    const previous = rows[Math.min(rows.length - 1, 48)]!.refinancing_rate_pct;

    if (current <= 0) return null;
    return { current, previous: previous > 0 ? previous : current };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Input / output types
// ─────────────────────────────────────────────────────────────────────────────

export interface ComputeCreditFlowSignalInput {
  /** Current month RE credit outstanding (nghìn tỷ VND) — optional, falls back to DB/default */
  currentReCreditTrillion?: number | undefined;
  /** Previous month RE credit outstanding (nghìn tỷ VND) — optional, falls back to DB/default */
  previousReCreditTrillion?: number | undefined;
  /** Current month average mortgage rate (%) — optional, derived from SBV rates in DB */
  currentMortgageRatePct?: number | undefined;
  /** Previous month average mortgage rate (%) — optional, derived from SBV rates in DB */
  previousMortgageRatePct?: number | undefined;
  /** Current month YoY credit growth % (optional, defaults to 15) */
  currentYoyGrowthPct?: number | undefined;
  /** Previous month YoY credit growth % (optional, defaults to 12) */
  previousYoyGrowthPct?: number | undefined;
}

/**
 * survey_distribution type (VMT-6).
 * Carries VIRA/VARA bank-survey consensus data.
 * is_estimate=true until a machine-readable source is confirmed (BLOCKER-6 deferred).
 */
export interface SurveyDistribution {
  source: "VIRA" | "VARA" | null;
  period: string | null;
  mean_pct: number | null;
  dispersion_pct: number | null;
  hawk_outliers: string[];
  dove_outliers: string[];
  survey_topic: string | null;
  is_estimate: boolean;
  note: string | null;
}

export interface ComputeCreditFlowSignalResult {
  /** Raw domain analysis result (direction/severity/confidence/summary/affectedStocks). */
  signal: CreditSignal;
  /** true when mortgage-rate and/or YoY-growth fell back to a hardcoded default (C3/HN-3). */
  is_estimate: boolean;
  mortgageIsEstimate: boolean;
  yoyIsEstimate: boolean;
  survey_distribution: SurveyDistribution;
  /** Convenience alias for signal.direction — what in-process consumers (e.g. Money Radar composite) read. */
  direction: CreditSignal["direction"];
}

/**
 * Core handler logic — separated from MCP registration/text-formatting for
 * testability and cross-layer reuse (money-radar composite reads the
 * structured fields directly instead of parsing the Vietnamese text block).
 *
 * All 4 main params are optional (Task 1254). When not provided:
 *   - Mortgage rates: derived from latest SBV refinancing rate in DB (refi + 2.5%)
 *   - RE credit outstanding: uses DEFAULT_RE_CREDIT_TRILLION constant
 */
export async function computeCreditFlowSignal(
  input: ComputeCreditFlowSignalInput,
): Promise<ComputeCreditFlowSignalResult> {
  // ── DB fallback for mortgage rates (Task 1254) ───────────────────────────
  let resolvedCurrentMortgage = input.currentMortgageRatePct;
  let resolvedPreviousMortgage = input.previousMortgageRatePct;

  // DSI-S3 C1: track whether any field uses a hardcoded fallback (no live source).
  let mortgageIsEstimate = false;
  let yoyIsEstimate = false;

  if (resolvedCurrentMortgage === undefined || resolvedPreviousMortgage === undefined) {
    const sbv = await readSbvRefinancingRate();
    if (sbv) {
      resolvedCurrentMortgage ??= deriveMortgageRateFromSbv(sbv.current);
      resolvedPreviousMortgage ??= deriveMortgageRateFromSbv(sbv.previous);
    } else {
      // Final fallback: use VN typical mortgage rates (2024 avg ~10.5%).
      // DSI-S3 C1: these are estimates — flag response so consumers know.
      resolvedCurrentMortgage ??= 10.5;
      resolvedPreviousMortgage ??= 11.0;
      mortgageIsEstimate = true;
    }
  }

  // DSI-S3 C1: flag when yoyGrowthPct is missing — defaults are fabricated ±15%.
  const currentYoyResolved = input.currentYoyGrowthPct;
  const previousYoyResolved = input.previousYoyGrowthPct;
  if (currentYoyResolved === undefined || previousYoyResolved === undefined) {
    yoyIsEstimate = true;
  }

  // ── Default RE credit outstanding when not provided ──────────────────────
  const resolvedCurrentCredit = input.currentReCreditTrillion ?? DEFAULT_RE_CREDIT_TRILLION;
  const resolvedPreviousCredit = input.previousReCreditTrillion ?? (DEFAULT_RE_CREDIT_TRILLION * 0.98);

  const current: CreditData = {
    totalCreditTrillion: resolvedCurrentCredit * 5, // rough estimate
    reCreditTrillion: resolvedCurrentCredit,
    // DSI-S3 C1: reCreditRatioPct 20/19 are static constants, not live data.
    reCreditRatioPct: 20,
    yoyGrowthPct: currentYoyResolved ?? 15,
    avgMortgageRatePct: resolvedCurrentMortgage,
    date: new Date().toISOString().slice(0, 10),
  };

  const previous: CreditData = {
    totalCreditTrillion: resolvedPreviousCredit * 5,
    reCreditTrillion: resolvedPreviousCredit,
    reCreditRatioPct: 19,
    yoyGrowthPct: previousYoyResolved ?? -15,
    avgMortgageRatePct: resolvedPreviousMortgage,
    date: new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10),
  };

  const signal = analyzeCreditFlow(current, previous);

  // DSI-S3 C1: overall estimate flag — mortgage-rate and/or YoY-growth fallback.
  const isEstimate = mortgageIsEstimate || yoyIsEstimate;

  // VMT-6: survey_distribution stub — DEGRADED mode (BLOCKER-6 deferred).
  // is_estimate=true: no machine-readable VIRA/VARA source is confirmed yet.
  // If/when a source is found, a viraSurveyFetcher.ts in infrastructure/fetchers/
  // will populate these fields (no schema change needed at that point).
  // const surveyDist = await fetchViraSurvey(); // TODO: implement after source confirmed
  const survey_distribution: SurveyDistribution = {
    source: null,
    period: null,
    mean_pct: null,
    dispersion_pct: null,
    hawk_outliers: [],
    dove_outliers: [],
    survey_topic: null,
    is_estimate: true,
    note: "VIRA/VARA no machine-readable source confirmed — manual data required",
  };

  return {
    signal,
    is_estimate: isEstimate,
    mortgageIsEstimate,
    yoyIsEstimate,
    survey_distribution,
    direction: signal.direction,
  };
}
