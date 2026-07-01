/**
 * Domain — Money Radar Calculator (MONEY-RADAR-P0-T2-COMPOSITE)
 *
 * Pure computation layer — no I/O. Implements the fusion math and divergence
 * detectors specified in docs/architecture-briefs/2026-07-01-money-radar.md
 * §4 (composite fusion) and §3 L2 (D1-D4 divergence detectors).
 *
 * HONEST-NULL discipline (HN-1..HN-7, brief §5):
 *   HN-1: fuseComponents() NEVER zero-fills a null component — excluded from
 *         both numerator and denominator of the weighted mean.
 *   HN-2: coverage_pct < 0.5 -> score=null + null_reason listing missing inputs.
 *   HN-4: a divergence detector emits UNKNOWN (not CLEAR) when either axis is
 *         null; aggregateDivergence() never returns GREEN when any detector
 *         could not be resolved and none fired.
 *   HN-7: source_tier = min tier across NON-NULL contributing components
 *         (honest floor) — never defaults to a "typical" tier.
 *
 * DDD layer: domain/services/market-data (pure — no database or network access).
 *
 * @module domain/services/market-data/moneyRadarCalculator
 */

// ─────────────────────────────────────────────────────────────────────────────
// Tier confidence weights (brief §4: "Tier confidence weights")
// ─────────────────────────────────────────────────────────────────────────────

export type SourceTier = 1 | 2 | 3 | 4;

/** T1=1.0, T2=0.9, T3=0.7, T4=0.3 (estimates down-weighted) — brief §4. */
export const TIER_CONFIDENCE: Record<SourceTier, number> = {
  1: 1.0,
  2: 0.9,
  3: 0.7,
  4: 0.3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Fusion (coverage-gated, tier-weighted mean over NON-NULL components only)
// ─────────────────────────────────────────────────────────────────────────────

export interface ComponentInput {
  /** Component name, e.g. "foreign_accum_z_market". Used in components{} + null_reason. */
  key: string;
  /** Normalized value in [-1,+1], or null when the underlying gate excludes it (HN-1). */
  value: number | null;
  /** Source tier for THIS component instance (some components float e.g. carry 2/4). */
  tier: SourceTier;
  /**
   * Reason the component is null — informative only, folded into the composite
   * null_reason. Typed `| undefined` explicitly (not just `?:`) so callers may
   * assign a conditional ternary directly under exactOptionalPropertyTypes.
   */
  nullReason?: string | undefined;
  /**
   * When true, this component is on an estimate/fixture data path (e.g. carry regime
   * fixture fallback). Never excluded by itself (unlike HN-3 hard-exclusion), but the
   * caller is expected to have already applied the appropriate tier (e.g. tier 4) —
   * this flag only feeds the composite's top-level `is_estimate` OR.
   */
  isEstimate?: boolean | undefined;
}

export interface FusionResult {
  score: number | null;
  coverage_pct: number;
  /** min tier across non-null contributing components (HN-7); null when nothing contributed. */
  source_tier: SourceTier | null;
  null_reason: string | null;
  is_estimate: boolean;
  components: Record<string, number | null>;
}

const COVERAGE_GATE = 0.5; // HN-2

/**
 * Fuse normalized component values into a single composite score.
 *
 * score = Σ(conf(tier_i) · value_i) / Σ(conf(tier_i))   [non-null i only]
 * coverage_pct = Σ(conf(tier_i), non-null) / Σ(conf(tier_i), all)
 *
 * HN-1: null components are excluded from BOTH numerator and denominator —
 *       never zero-filled.
 * HN-2: coverage_pct < 0.5 -> score=null, null_reason lists missing components.
 * HN-7: source_tier = min(tier) across NON-NULL contributing components only.
 */
export function fuseComponents(components: ComponentInput[]): FusionResult {
  let numerator = 0;
  let nonNullWeight = 0;
  let totalWeight = 0;
  let minTier: SourceTier | null = null;
  let isEstimate = false;
  const missing: string[] = [];
  const componentsOut: Record<string, number | null> = {};

  for (const c of components) {
    const w = TIER_CONFIDENCE[c.tier];
    totalWeight += w;
    componentsOut[c.key] = c.value;

    if (c.value === null) {
      missing.push(c.nullReason ? `${c.key} (${c.nullReason})` : c.key);
      continue;
    }

    numerator += w * c.value;
    nonNullWeight += w;
    if (c.isEstimate) isEstimate = true;
    if (minTier === null || c.tier < minTier) minTier = c.tier;
  }

  const coverage_pct = totalWeight > 0 ? nonNullWeight / totalWeight : 0;

  if (nonNullWeight === 0 || totalWeight === 0) {
    return {
      score: null,
      coverage_pct: 0,
      source_tier: null,
      null_reason: `no contributing components — missing: ${missing.join(", ")}`,
      is_estimate: isEstimate,
      components: componentsOut,
    };
  }

  if (coverage_pct < COVERAGE_GATE) {
    return {
      score: null,
      coverage_pct,
      source_tier: minTier,
      null_reason:
        `coverage_pct ${(coverage_pct * 100).toFixed(0)}% < 50% threshold — missing: ${missing.join(", ")}`,
      is_estimate: isEstimate,
      components: componentsOut,
    };
  }

  const rawScore = numerator / nonNullWeight;
  const score = Math.max(-1, Math.min(1, rawScore)); // defensive clamp

  return {
    score,
    coverage_pct,
    source_tier: minTier,
    null_reason: null,
    is_estimate: isEstimate,
    components: componentsOut,
  };
}

/**
 * Streak-weighted sign of a DESC-ordered (most-recent-first) numeric series.
 * value = sign(latest) * min(streak,maxStreak)/maxStreak, where streak =
 * count of consecutive leading values sharing the same sign as the latest.
 * Null when the series is empty (no data — honest-NULL, not a zero-fill).
 * Used for the "Foreign net direction × severity" component (brief §4).
 */
export function computeStreakWeightedSign(valuesDesc: number[], maxStreak = 5): number | null {
  if (valuesDesc.length === 0) return null;
  const latestSign = Math.sign(valuesDesc[0]!);
  if (latestSign === 0) return 0;
  let streak = 0;
  for (const v of valuesDesc) {
    if (Math.sign(v) === latestSign) streak++;
    else break;
  }
  return latestSign * (Math.min(streak, maxStreak) / maxStreak);
}

/** Mean of the non-null/finite values in the array; null when none qualify. */
export function meanNonNull(values: Array<number | null | undefined>): number | null {
  const nn = values.filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v));
  if (nn.length === 0) return null;
  return nn.reduce((s, v) => s + v, 0) / nn.length;
}

/**
 * Aggregate close-vs-degraded-VWAP deviation across tickers into a single
 * [-1,1] component. Deviation is scaled by /0.05 (5%) before tanh so a
 * ~5% average deviation from the proxy VWAP saturates near tanh(1)≈0.76.
 * HN-5: caller MUST label the resulting component key so it is never
 * presented as a canonical VWAP (see getMoneyRadarComposite.ts).
 */
export function computeVwapDeviationComponent(
  perTicker: Array<{ close: number; vwap: number }>,
): number | null {
  const devs = perTicker.filter((t) => t.vwap !== 0).map((t) => (t.close - t.vwap) / t.vwap);
  const mean = meanNonNull(devs);
  if (mean === null) return null;
  return tanhNorm(mean / 0.05);
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalizers (brief §4 component table)
// ─────────────────────────────────────────────────────────────────────────────

/** tanh normalizer — used for z-score-shaped components (bounds any real to (-1,1)). */
export function tanhNorm(x: number): number {
  return Math.tanh(x);
}

/** (r-1)/(r+1) normalizer for up/down-volume-style ratios — bounds (0,+inf) to (-1,1). */
export function ratioNorm(r: number): number | null {
  if (r + 1 === 0) return null; // undefined (r = -1, not physically possible for a ratio but guard anyway)
  return (r - 1) / (r + 1);
}

/** Clamp helper shared by normalizers that scale a raw fraction into [-1,1]. */
export function clamp(x: number, lo = -1, hi = 1): number {
  return Math.max(lo, Math.min(hi, x));
}

// ─────────────────────────────────────────────────────────────────────────────
// OBV series + slope (local recompute — T1 Go tool exposes only a single
// cumulative snapshot, no history/slope; see getMoneyRadarComposite.ts header
// comment for the full reuse-vs-local-compute rationale).
// ─────────────────────────────────────────────────────────────────────────────

export interface OhlcvBar {
  date: string;
  close: number;
  volume: number;
}

/**
 * Cumulative OBV series for one ticker's close+volume bars (ASC order, i.e.
 * oldest first). Formula matches apps/technical-analysis money_flow_models.go:
 * OBV = cumulative sign(close_t - close_{t-1}) * volume_t.
 * First bar has no prior close -> contributes 0.
 */
export function computeObvSeries(bars: OhlcvBar[]): number[] {
  const obv: number[] = [];
  let cum = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      obv.push(0);
      continue;
    }
    const diff = bars[i]!.close - bars[i - 1]!.close;
    const sign = diff > 0 ? 1 : diff < 0 ? -1 : 0;
    cum += sign * bars[i]!.volume;
    obv.push(cum);
  }
  return obv;
}

/**
 * Per-ticker OBV slope direction over the trailing `window` bars.
 * Returns +1 (rising), -1 (falling), 0 (flat), or null when <window+1 bars.
 */
export function computeObvSlopeSign(bars: OhlcvBar[], window = 5): number | null {
  if (bars.length < window + 1) return null;
  const obv = computeObvSeries(bars);
  const delta = obv[obv.length - 1]! - obv[obv.length - 1 - window]!;
  if (delta === 0) return 0;
  return delta > 0 ? 1 : -1;
}

export interface MarketObvSlopeResult {
  /** (#tickers rising - #tickers falling) / #tickers resolved, in [-1,1]. Null if none resolved. */
  value: number | null;
  tickersResolved: number;
  nullReason?: string;
}

/**
 * Market-wide OBV slope aggregate — breadth-of-flow reading across the
 * watchlist: fraction of tickers with a rising local OBV slope minus the
 * fraction falling, over tickers with enough bars to resolve a slope.
 * Bounded to [-1,1] by construction (no scale-dependent magnitude issue
 * across large-cap vs small-cap OBV levels).
 */
export function computeMarketObvSlope(
  perTickerBars: Record<string, OhlcvBar[]>,
  window = 5,
): MarketObvSlopeResult {
  const signs: number[] = [];
  for (const code of Object.keys(perTickerBars)) {
    const s = computeObvSlopeSign(perTickerBars[code] ?? [], window);
    if (s !== null) signs.push(s);
  }
  if (signs.length === 0) {
    return { value: null, tickersResolved: 0, nullReason: "insufficient_history_all_tickers" };
  }
  const sum = signs.reduce((acc, s) => acc + s, 0);
  return { value: sum / signs.length, tickersResolved: signs.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Index return + ADL slope (D1/D2 axes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Index return over the trailing `window` daily closes (ASC order).
 * Null when fewer than window+1 daily closes are available.
 */
export function computeIndexReturn(closesAsc: number[], window = 5): number | null {
  if (closesAsc.length < window + 1) return null;
  const last = closesAsc[closesAsc.length - 1]!;
  const prior = closesAsc[closesAsc.length - 1 - window]!;
  if (prior === 0) return null;
  return (last - prior) / prior;
}

export interface AdlPoint {
  date: string;
  adl: number;
}

/** ADL slope (raw delta, not normalized) over the trailing `window` points (ASC order). */
export function computeAdlSlope(adlHistory: AdlPoint[], window = 5): number | null {
  if (adlHistory.length < window + 1) return null;
  const last = adlHistory[adlHistory.length - 1]!.adl;
  const prior = adlHistory[adlHistory.length - 1 - window]!.adl;
  return last - prior;
}

// ─────────────────────────────────────────────────────────────────────────────
// Divergence detectors (brief §3 L2, D1-D4)
// ─────────────────────────────────────────────────────────────────────────────

export type DetectorId = "D1" | "D2" | "D3" | "D4";
export type DetectorStatus = "FIRED" | "CLEAR" | "UNKNOWN";

export interface DetectorResult {
  id: DetectorId;
  status: DetectorStatus;
  null_reason?: string;
}

/** D1 — Index-vs-Breadth: index return > 0 while breadth narrows (ADL slope < 0). */
export function detectD1IndexVsBreadth(
  indexReturn5d: number | null,
  adlSlope5d: number | null,
): DetectorResult {
  if (indexReturn5d === null || adlSlope5d === null) {
    return { id: "D1", status: "UNKNOWN", null_reason: "index_return_5d or adl_slope_5d null" };
  }
  return { id: "D1", status: indexReturn5d > 0 && adlSlope5d < 0 ? "FIRED" : "CLEAR" };
}

/** D2 — Price-vs-OBV: price trending up while OBV slope is negative (classic distribution tell). */
export function detectD2PriceVsObv(
  indexReturn5d: number | null,
  obvSlope: number | null,
): DetectorResult {
  if (indexReturn5d === null || obvSlope === null) {
    return { id: "D2", status: "UNKNOWN", null_reason: "index_return_5d or obv_slope null" };
  }
  return { id: "D2", status: indexReturn5d > 0 && obvSlope < 0 ? "FIRED" : "CLEAR" };
}

/**
 * D3 — Crowd-vs-Smart (Phase 0 form): aggregate/retail volume up while
 * foreign is net-selling AND accumulation z-score confirms distribution.
 */
export function detectD3CrowdVsSmart(
  aggVolumeZ: number | null,
  marketForeignNet: number | null,
  foreignAccumZMarket: number | null,
): DetectorResult {
  if (aggVolumeZ === null || marketForeignNet === null || foreignAccumZMarket === null) {
    return {
      id: "D3",
      status: "UNKNOWN",
      null_reason: "rel_vol_z_20, market foreign net, or foreign_accum_z_market null",
    };
  }
  const fired = aggVolumeZ > 0 && marketForeignNet < 0 && foreignAccumZMarket < 0;
  return { id: "D3", status: fired ? "FIRED" : "CLEAR" };
}

/** D4 — Unconfirmed breakout: a new high made on below-average relative volume. */
export function detectD4UnconfirmedBreakout(
  anyNewHigh: boolean | null,
  relVolZ20: number | null,
): DetectorResult {
  if (anyNewHigh === null || relVolZ20 === null) {
    return { id: "D4", status: "UNKNOWN", null_reason: "new_high flag or rel_vol_z_20 null" };
  }
  return { id: "D4", status: anyNewHigh && relVolZ20 < 0 ? "FIRED" : "CLEAR" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Divergence aggregation
// ─────────────────────────────────────────────────────────────────────────────

export interface DivergenceAggregate {
  flag: "GREEN" | "AMBER" | "RED" | "UNKNOWN";
  severity: number; // 0-3
  detectors: string[];
  null_reason?: string;
}

/**
 * Aggregate D1-D4 detector results into the composite divergence field.
 *
 * HN-4: a null axis on ANY detector means that detector could not resolve
 * (UNKNOWN). If no detector fired AND at least one is UNKNOWN, the OVERALL
 * flag is UNKNOWN — never GREEN (a thin-data "all clear" would be dishonest).
 * GREEN is only returned when every detector resolved (FIRED or CLEAR) and
 * none fired.
 */
export function aggregateDivergence(results: DetectorResult[]): DivergenceAggregate {
  const fired = results.filter((r) => r.status === "FIRED");
  const unknown = results.filter((r) => r.status === "UNKNOWN");
  const severity = Math.min(fired.length, 3);

  if (fired.length >= 2) {
    return { flag: "RED", severity, detectors: fired.map((r) => r.id) };
  }
  if (fired.length === 1) {
    return { flag: "AMBER", severity, detectors: fired.map((r) => r.id) };
  }
  // No detector fired.
  if (unknown.length > 0) {
    return {
      flag: "UNKNOWN",
      severity: 0,
      detectors: [],
      null_reason: unknown.map((u) => `${u.id}: ${u.null_reason}`).join("; "),
    };
  }
  return { flag: "GREEN", severity: 0, detectors: [] };
}
