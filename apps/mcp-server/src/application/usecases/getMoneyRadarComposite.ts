/**
 * Application Use Case — Get Money Radar Composite (MONEY-RADAR-P0-T2-COMPOSITE)
 *
 * Orchestrates the Money Radar composite score per
 * docs/architecture-briefs/2026-07-01-money-radar.md §4 (output schema + fusion)
 * and §3 L2 (D1-D4 divergence detectors). REUSE-FIRST (brief C2) — wires 8
 * already-LIVE tools + the 4 new T1 oscillators, never rebuilds them:
 *
 *   | Component                    | Reuse source                                  | Mode          |
 *   |-------------------------------|-----------------------------------------------|---------------|
 *   | foreign_net_direction         | queryMarketWideForeignFlow (marketWideForeignFlowTool.ts) | in-process SQL |
 *   | foreign_accum_z_market        | computeForeignAccumRank (clients.ts)          | cross-service HTTP (stock-price :5000) |
 *   | foreign_outflow_z_5d          | getForeignRoom (usecase)                      | in-process    |
 *   | obv_slope                     | LOCAL recompute (daily_ohlcv close+volume) — see rationale below | in-process SQL |
 *   | rel_vol_z_20 / up_down_vol_ratio / degraded_vwap_proxy_z | computeMoneyFlowOscillators (clients.ts, NEW) | cross-service HTTP (technical-analysis :5003) |
 *   | carry_regime                  | getMacroSnapshot (clients.ts)                 | cross-service HTTP (macro-indicators :5004) |
 *   | credit_flow_direction         | getCreditFlowSignalHandler (creditFlowTools.ts) | in-process |
 *   | volatility_regime             | computeVolatilityIndicators (clients.ts)      | cross-service HTTP (technical-analysis :5003) |
 *   | index axis (D1/D2)            | getVnIndexDailyCloses (moneyRadarStore.ts) — daily_ohlcv (code='VNINDEX') | in-process SQL |
 *   | breadth axis (D1)             | getBreadthThrust (usecase) adl_history        | in-process |
 *
 * OBV-slope reuse rationale (deviation from naive "call T1 for everything"):
 * apps/technical-analysis POST /ta/money-flow-oscillators (T1, commit e19894035)
 * returns `obv` as a SINGLE cumulative-over-ALL-bars snapshot — there is no
 * "as of N sessions ago" parameter, so no slope/delta is derivable from the
 * endpoint alone. D2 and the composite's OBV-slope component both need a
 * TREND. Rather than persist Go-side history (new stateful surface) this
 * usecase recomputes the OBV series locally from daily_ohlcv (C1: close+volume
 * only, same formula documented in money_flow_models.go) purely to derive the
 * 5-session slope direction per ticker, then aggregates breadth-of-flow
 * (#rising - #falling)/#resolved across the watchlist — see
 * domain/services/market-data/moneyRadarCalculator.ts computeMarketObvSlope.
 * The Go endpoint IS still called (cross-service reuse) for rel_vol_z_20,
 * up_down_vol_ratio, and degraded_vwap — the 3 fields it uniquely computes.
 *
 * HONEST-NULL (HN-1..HN-7) enforcement — see inline comments at each guard.
 *
 * DDD layer: application/usecases — orchestrates domain + infrastructure
 * (+ a small number of interface/mcp/tools exported query/handler functions).
 *
 * @module application/usecases/getMoneyRadarComposite
 */

import type { Database } from "bun:sqlite";
import {
  fuseComponents,
  type ComponentInput,
  type SourceTier,
  tanhNorm,
  ratioNorm,
  meanNonNull,
  computeStreakWeightedSign,
  computeVwapDeviationComponent,
  computeMarketObvSlope,
  computeIndexReturn,
  computeAdlSlope,
  detectD1IndexVsBreadth,
  detectD2PriceVsObv,
  detectD3CrowdVsSmart,
  detectD4UnconfirmedBreakout,
  aggregateDivergence,
  type DivergenceAggregate,
} from "../../domain/services/market-data/moneyRadarCalculator.js";
import {
  getWatchlistCodes,
  getVnIndexDailyCloses,
  getWatchlistOhlcvBars,
  computeAnyNewHigh,
  recordDailyScore,
  getScoreHistory,
} from "../../infrastructure/db/moneyRadarStore.js";
import {
  computeForeignAccumRank,
  computeVolatilityIndicators,
  computeMoneyFlowOscillators,
  getMacroSnapshot,
} from "../../infrastructure/microservices/clients.js";
import { queryMarketWideForeignFlow } from "../../interface/mcp/tools/market-data/marketWideForeignFlowTool.js";
import { getCreditFlowSignalHandler } from "../../interface/mcp/tools/sector/creditFlowTools.js";
import { getForeignRoom } from "./getForeignRoom.js";
import { getBreadthThrust } from "./getBreadthThrust.js";
import { VN_OFFSET_MS } from "../../domain/services/timeConstants.js";
import { logger } from "../../infrastructure/logger.js";

const OBV_WINDOW = 5;
const INDEX_RETURN_WINDOW = 5;
const OHLCV_BARS = 30;
const VNINDEX_DAYS = 30;

// ---------------------------------------------------------------------------
// Response type (brief §4 output schema)
// ---------------------------------------------------------------------------

export interface MoneyRadarCompositeResponse {
  score: number | null;
  delta_5d: number | null;
  divergence: DivergenceAggregate;
  coverage_pct: number;
  source_tier: SourceTier | null;
  is_estimate: boolean;
  null_reason: string | null;
  components: Record<string, number | null>;
  /** ISO8601 — consumed by FreshnessBadge(dataAsof=generated_at) per brief §8. */
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Regime / direction mappers (brief §4 normalizer column)
// ---------------------------------------------------------------------------

/** Carry regime -> [-1,1]. HOT_MONEY_INFLOW=+1, NEUTRAL=0, FII_OUTFLOW_RISK=-1, else null. */
function mapCarryRegime(regime: unknown): number | null {
  if (regime === "HOT_MONEY_INFLOW") return 1;
  if (regime === "NEUTRAL") return 0;
  if (regime === "FII_OUTFLOW_RISK") return -1;
  return null; // "UNKNOWN" (suppressed fixture path) or missing
}

/** Volatility regime -> risk-off penalty. LOW=+0.5, NORMAL=0, ELEVATED=-0.5, CRISIS=-1. */
function mapVolRegime(regime: string | null | undefined): number | null {
  if (regime === "LOW") return 0.5;
  if (regime === "NORMAL") return 0;
  if (regime === "ELEVATED") return -0.5;
  if (regime === "CRISIS") return -1;
  return null;
}

function mapCreditDirection(direction: "up" | "down" | "neutral"): number {
  return direction === "up" ? 1 : direction === "down" ? -1 : 0;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compute the market-wide Money Radar composite (no ticker argument — per-ticker
 * granularity is a Phase-0.5+ extension, out of scope for this brief's DoD).
 *
 * Never throws — every reuse call is individually try/caught so an upstream
 * outage degrades that ONE component to null (HN-1) rather than failing the
 * whole composite.
 */
export async function getMoneyRadarComposite(db: Database): Promise<MoneyRadarCompositeResponse> {
  const components: ComponentInput[] = [];

  const watchlistCodes = getWatchlistCodes(db);
  const perTickerBars = getWatchlistOhlcvBars(db, watchlistCodes, OHLCV_BARS);
  const vnIndexCloses = getVnIndexDailyCloses(db, VNINDEX_DAYS);
  const indexReturn5d = computeIndexReturn(vnIndexCloses, INDEX_RETURN_WINDOW);

  // ── 1. Foreign net direction × severity (get_market_foreign_flow, T2) ────
  let foreignNetLatest: number | null = null;
  try {
    const rows = queryMarketWideForeignFlow(db, 10);
    foreignNetLatest = rows.length > 0 ? rows[0]!.total_net : null;
    const value = computeStreakWeightedSign(rows.map((r) => r.total_net));
    components.push({
      key: "foreign_net_direction",
      value,
      tier: 2,
      nullReason: value === null ? "no_market_foreign_flow_data" : undefined,
    });
  } catch (err) {
    logger.warn("[money-radar] foreign_net_direction failed", { error: msg(err) });
    components.push({ key: "foreign_net_direction", value: null, tier: 2, nullReason: `upstream_error: ${msg(err)}` });
  }

  // ── 2. foreign_accum_z_market (get_foreign_accum_rank, T3) ───────────────
  let foreignAccumZMarket: number | null = null;
  try {
    const result = await computeForeignAccumRank(
      watchlistCodes.length > 0 ? { codes: watchlistCodes } : {}
    );
    foreignAccumZMarket = result.foreign_accum_z_market;
    components.push({
      key: "foreign_accum_z_market",
      value: foreignAccumZMarket === null ? null : tanhNorm(foreignAccumZMarket),
      tier: 3,
      nullReason: foreignAccumZMarket === null ? "insufficient_qualifying_tickers" : undefined,
    });
  } catch (err) {
    logger.warn("[money-radar] foreign_accum_z_market failed", { error: msg(err) });
    components.push({ key: "foreign_accum_z_market", value: null, tier: 3, nullReason: `upstream_error: ${msg(err)}` });
  }

  // ── 3. foreign_outflow_z_5d (get_foreign_room, T2) ────────────────────────
  try {
    const room = await getForeignRoom(db);
    const z = room.market.foreign_outflow_z_5d;
    components.push({
      key: "foreign_outflow_z_5d",
      // negate: positive outflow-velocity z-score = MORE outflow = bearish flow
      value: z === null ? null : -tanhNorm(z),
      tier: 2,
      nullReason: z === null ? (room.market.null_reason ?? "insufficient_sessions") : undefined,
    });
  } catch (err) {
    logger.warn("[money-radar] foreign_outflow_z_5d failed", { error: msg(err) });
    components.push({ key: "foreign_outflow_z_5d", value: null, tier: 2, nullReason: `upstream_error: ${msg(err)}` });
  }

  // ── 4. OBV slope — LOCAL recompute (see module header rationale) ─────────
  const obvSlope = computeMarketObvSlope(perTickerBars, OBV_WINDOW);
  components.push({
    key: "obv_slope",
    value: obvSlope.value,
    tier: 3,
    nullReason: obvSlope.value === null ? obvSlope.nullReason : undefined,
  });

  // ── 5/6/7. rel_vol_z_20, up_down_vol_ratio, degraded_vwap (T1 oscillators) ─
  let relVolZ20Component: number | null = null;
  try {
    const osc = await computeMoneyFlowOscillators(
      watchlistCodes.length > 0 ? { tickers: watchlistCodes } : {},
    );
    const relVolMean = meanNonNull(osc.tickers.map((t) => t.rel_vol_z_20));
    relVolZ20Component = relVolMean === null ? null : tanhNorm(relVolMean);
    components.push({
      key: "rel_vol_z_20",
      value: relVolZ20Component,
      tier: 3,
      nullReason: relVolZ20Component === null ? "insufficient_window_all_tickers" : undefined,
    });

    const ratioNormalized = osc.tickers
      .map((t) => (t.up_down_vol_ratio === null ? null : ratioNorm(t.up_down_vol_ratio)))
      .filter((v): v is number => v !== null);
    const updownValue = ratioNormalized.length > 0 ? meanNonNull(ratioNormalized) : null;
    components.push({
      key: "up_down_vol_ratio",
      value: updownValue,
      tier: 3,
      nullReason: updownValue === null ? "insufficient_window_all_tickers" : undefined,
    });

    // degraded_vwap_proxy_z: key name self-labels the HN-5 proxy nature —
    // never presented as a canonical VWAP. Pairs each ticker's latest close
    // (from the same daily_ohlcv bars queried for OBV) with its Go-computed
    // degraded_vwap.
    const vwapPairs: Array<{ close: number; vwap: number }> = [];
    for (const t of osc.tickers) {
      if (t.degraded_vwap === null) continue;
      const latestClose = perTickerBars[t.code]?.at(-1)?.close;
      if (latestClose === undefined) continue;
      vwapPairs.push({ close: latestClose, vwap: t.degraded_vwap });
    }
    const vwapValue = computeVwapDeviationComponent(vwapPairs);
    components.push({
      key: "degraded_vwap_proxy_z",
      value: vwapValue,
      tier: 3,
      nullReason: vwapValue === null ? "insufficient_window_or_no_local_close" : undefined,
    });
  } catch (err) {
    logger.warn("[money-radar] money-flow-oscillators failed", { error: msg(err) });
    components.push({ key: "rel_vol_z_20", value: null, tier: 3, nullReason: `upstream_error: ${msg(err)}` });
    components.push({ key: "up_down_vol_ratio", value: null, tier: 3, nullReason: `upstream_error: ${msg(err)}` });
    components.push({ key: "degraded_vwap_proxy_z", value: null, tier: 3, nullReason: `upstream_error: ${msg(err)}` });
  }

  // ── 8. Carry regime (get_carry_trade_signal via macro snapshot, T2/T4) ───
  try {
    const snapshot = await getMacroSnapshot();
    const carry = snapshot.signals?.["carry"] as
      | { regime?: string; is_estimate?: boolean; source_tier?: number }
      | undefined;
    const carryValue = mapCarryRegime(carry?.regime);
    const carryIsEstimate = carry?.is_estimate === true;
    const carryTier: SourceTier = carryIsEstimate ? 4 : 2;
    components.push({
      key: "carry_regime",
      value: carryValue,
      tier: carryTier,
      isEstimate: carryIsEstimate,
      nullReason: carryValue === null ? "carry_regime_unknown_or_suppressed" : undefined,
    });
  } catch (err) {
    logger.warn("[money-radar] carry_regime failed", { error: msg(err) });
    components.push({ key: "carry_regime", value: null, tier: 4, nullReason: `upstream_error: ${msg(err)}` });
  }

  // ── 9. Credit flow direction (get_credit_flow_signal, T4/T2) ─────────────
  // HN-3: when is_estimate=true, EXCLUDE entirely (value=null) — the
  // DEFAULT_RE_CREDIT_TRILLION / ±15% YoY fixture defaults never enter the
  // score as real. Today this composite never supplies explicit YoY inputs,
  // so is_estimate is true whenever the mortgage-rate DB fallback ALSO
  // engages; when SBV rates are live, only the YoY leg is estimated but the
  // handler still flags the whole signal is_estimate=true (yoyIsEstimate),
  // so the component is excluded until BLOCKER-6 (VIRA/VARA source) lands.
  try {
    const credit = await getCreditFlowSignalHandler({});
    const excluded = credit.is_estimate;
    components.push({
      key: "credit_flow_direction",
      value: excluded ? null : mapCreditDirection(credit.direction),
      tier: 2,
      nullReason: excluded ? "credit_flow_is_estimate_excluded_HN3" : undefined,
    });
  } catch (err) {
    logger.warn("[money-radar] credit_flow_direction failed", { error: msg(err) });
    components.push({ key: "credit_flow_direction", value: null, tier: 2, nullReason: `upstream_error: ${msg(err)}` });
  }

  // ── 10. Volatility regime (get_volatility_indicators, T3) ────────────────
  try {
    const vol = await computeVolatilityIndicators({});
    const volValue = mapVolRegime(vol.vol_regime);
    components.push({
      key: "volatility_regime",
      value: volValue,
      tier: 3,
      nullReason: volValue === null ? "insufficient_history" : undefined,
    });
  } catch (err) {
    logger.warn("[money-radar] volatility_regime failed", { error: msg(err) });
    components.push({ key: "volatility_regime", value: null, tier: 3, nullReason: `upstream_error: ${msg(err)}` });
  }

  // Note: Tự doanh net flow is Phase 1 (new crawl, out of scope per brief §6) —
  // deliberately NOT added as a permanently-null component so it never
  // deflates coverage_pct for a leg that cannot possibly resolve yet.

  // ── Fusion (HN-1, HN-2, HN-7) ──────────────────────────────────────────────
  const fusion = fuseComponents(components);

  // ── Divergence D1-D4 (HN-4) ────────────────────────────────────────────────
  let adlSlope5d: number | null = null;
  try {
    const breadth = await getBreadthThrust(db);
    if (!("error" in breadth)) {
      adlSlope5d = computeAdlSlope(breadth.adl_history, INDEX_RETURN_WINDOW);
    }
  } catch (err) {
    logger.warn("[money-radar] breadth (D1 axis) failed", { error: msg(err) });
  }

  const anyNewHigh = computeAnyNewHigh(perTickerBars, OBV_WINDOW);

  const d1 = detectD1IndexVsBreadth(indexReturn5d, adlSlope5d);
  const d2 = detectD2PriceVsObv(indexReturn5d, obvSlope.value);
  const d3 = detectD3CrowdVsSmart(relVolZ20Component, foreignNetLatest, foreignAccumZMarket);
  const d4 = detectD4UnconfirmedBreakout(anyNewHigh, relVolZ20Component);
  const divergence = aggregateDivergence([d1, d2, d3, d4]);

  // ── delta_5d (forward-accruing history; null when <6 accrued rows) ────────
  const todayVn = new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
  recordDailyScore(db, todayVn, fusion.score);
  const history = getScoreHistory(db, 10);
  let delta_5d: number | null = null;
  if (fusion.score !== null && history.length >= 6) {
    const past = history[history.length - 6]!.score;
    if (past !== null) delta_5d = fusion.score - past;
  }

  return {
    score: fusion.score,
    delta_5d,
    divergence,
    coverage_pct: fusion.coverage_pct,
    source_tier: fusion.source_tier,
    is_estimate: fusion.is_estimate,
    null_reason: fusion.null_reason,
    components: fusion.components,
    generated_at: new Date().toISOString(),
  };
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
