/**
 * Causal Cascade Engine — Task 062
 *
 * Pure domain function that builds a causal chain from a seed AnalysisEntry,
 * tracing macro events down to specific Vietnamese stocks in the watchlist.
 *
 * Design notes:
 *  - Synchronous, no I/O, no side effects.
 *  - ZERO imports from infrastructure/ or application/.
 *  - RAG results are injected by the application wrapper (runImpactChain.ts)
 *    and passed in as a pre-fetched optional parameter.
 *  - Sector impact rules are hardcoded — first matching rule per domain wins.
 *
 * Layer: domain/services
 */

import type { AnalysisEntry, AnalysisLevel, Sentiment, ImpactDirection } from "./newsNormalizer.js";
import type { DomainType } from "../../../bctc-schema";
import { classifySentiment } from "./sentimentClassifier.js";
import { classifyDeviation, deviationToDelta, type MacroStats, type MacroDeviation } from "./macroThresholds.js";
import { detectStocksInText } from "./stockAliases.js";
import { detectMsciInclusion, detectMsciWatchlist, detectMsciExclusion } from "./msciDetector.js";
import { detectAgricultureWeatherKeywords } from "./agricultureDetector.js";

// ═══════════════════════════════════════════════════════════════════════════
// Exported types
// ═══════════════════════════════════════════════════════════════════════════

export interface WatchlistEntry {
  /** VN stock code, e.g. 'GAS', 'VCB' */
  actionCode: string;
  /** Sector domain, e.g. 'oil_gas', 'banking' */
  domain: DomainType;
  /** Exchange: 'HOSE' | 'HNX' | 'UPCOM' */
  exchange: string;
}

export interface CausalChainEntry {
  level: AnalysisLevel;
  title: string;
  summary: string;
  affectedDomains: DomainType[];
  affectedActions: string[];
  sentiment: Sentiment;
  impactScore: number;
  confidence: number;
  reasoning: string;
}

export interface WatchlistImpact {
  actionCode: string;
  domain: DomainType;
  impactDirection: ImpactDirection;
  confidence: number;
  reasoning: string;
}

/** A single cascade rule that fired during chain building (Task 247). */
export interface MatchedRule {
  key: string;
  matchedKeyword: string;
  sector: string;
}

export interface CausalChain {
  id: string;
  seedTitle: string;
  createdAt: string;
  entries: CausalChainEntry[];
  watchlistImpacts: WatchlistImpact[];
  matchedRules: MatchedRule[];
}

// ═══════════════════════════════════════════════════════════════════════════
// SearchResult type (minimal — mirrors infrastructure/rag/vectorstore.ts)
// This avoids importing from infrastructure while keeping the type safe.
// ═══════════════════════════════════════════════════════════════════════════

export interface SearchResult {
  id: string;
  level: string;
  title: string;
  summary: string;
  distance: number;
  tags: string[];
  actionCode?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MacroContext — real-time commodity + central bank data
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Real-time macro indicators injected by the application layer.
 * All fields are nullable — null means "data unavailable, skip rule".
 * This interface is pure domain: no imports from infrastructure.
 */
export interface MacroContext {
  /** Brent crude oil in USD per barrel (e.g. 95 means $95/bbl). */
  brentCrudeUSD: number | null;
  /** Gold futures in USD per troy ounce (e.g. 2100 means $2,100/oz). */
  goldUSDPerOz: number | null;
  /** Market USD/VND exchange rate (e.g. 25500 means 25,500 VND per 1 USD). */
  usdVndMarket: number | null;
  /** SBV refinancing rate in percent per year (e.g. 6 means 6%/year). */
  refinancingRatePct: number | null;
  /** SBV overnight rate in percent per year. */
  overnightRatePct: number | null;
  /** SBV official USD/VND exchange rate. */
  usdVndOfficial: number | null;
  // ── new risk-off fields (sprint 188, FR-7) ─────────────────────────────────
  /** CBOE Volatility Index. null = data unavailable, cascade rules skip. */
  vix: number | null;
  /** S&P 500 index level. null = data unavailable, cascade rules skip. */
  sp500: number | null;
  /** US Dollar Index (DXY). null = data unavailable, cascade rules skip. */
  dxy: number | null;
  /** Hang Seng index level. null = data unavailable, cascade rules skip. */
  hangSeng: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Macro adjustment rules
// ═══════════════════════════════════════════════════════════════════════════

interface MacroRule {
  /** Human-readable label for annotation (e.g. "brentCrudeUSD>90"). */
  label: string;
  /** Returns true when macro condition is active. null values always return false. */
  condition: (ctx: MacroContext) => boolean;
  /** Domain to adjust. */
  domain: DomainType;
  /** Signed delta applied to confidence (e.g. +0.10 or -0.08). */
  delta: number;
}

/**
 * 11 macro adjustment rules.
 * Multiple rules can fire simultaneously — all deltas accumulate.
 * Confidence is clamped to [0.05, 0.99] after applying all rules.
 */
const MACRO_ADJUSTMENTS: MacroRule[] = [
  // Brent crude > 90
  {
    label: "brentCrudeUSD>90",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 90,
    domain: "oil_gas",
    delta: +0.10,
  },
  {
    label: "brentCrudeUSD>90",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 90,
    domain: "logistics",
    delta: +0.10,
  },
  {
    label: "brentCrudeUSD>90",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 90,
    domain: "aviation",
    delta: -0.08,
  },
  // Brent crude < 70
  {
    label: "brentCrudeUSD<70",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD < 70,
    domain: "oil_gas",
    delta: -0.10,
  },
  {
    label: "brentCrudeUSD<70",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD < 70,
    domain: "aviation",
    delta: +0.06,
  },
  // Gold > 2000
  {
    label: "goldUSDPerOz>2000",
    condition: (ctx) => ctx.goldUSDPerOz !== null && ctx.goldUSDPerOz > 2000,
    domain: "gold_mining",
    delta: +0.05,
  },
  // Refinancing rate > 6
  {
    label: "refinancingRatePct>6",
    condition: (ctx) => ctx.refinancingRatePct !== null && ctx.refinancingRatePct > 6,
    domain: "banking",
    delta: -0.08,
  },
  {
    label: "refinancingRatePct>6",
    condition: (ctx) => ctx.refinancingRatePct !== null && ctx.refinancingRatePct > 6,
    domain: "real_estate",
    delta: -0.10,
  },
  // Refinancing rate < 4
  {
    label: "refinancingRatePct<4",
    condition: (ctx) => ctx.refinancingRatePct !== null && ctx.refinancingRatePct < 4,
    domain: "banking",
    delta: +0.06,
  },
  {
    label: "refinancingRatePct<4",
    condition: (ctx) => ctx.refinancingRatePct !== null && ctx.refinancingRatePct < 4,
    domain: "real_estate",
    delta: +0.08,
  },
  // USD/VND > 25500 (using market rate; official rate is secondary)
  {
    label: "usdVnd>25500",
    condition: (ctx) => ctx.usdVndMarket !== null && ctx.usdVndMarket > 25500,
    domain: "aviation",
    delta: -0.07,
  },
  {
    label: "usdVnd>25500",
    condition: (ctx) => ctx.usdVndMarket !== null && ctx.usdVndMarket > 25500,
    domain: "steel",
    delta: +0.05,
  },
  // USD/VND > 25500 → export agriculture benefits
  {
    label: "usdVnd>25500",
    condition: (ctx) => ctx.usdVndMarket !== null && ctx.usdVndMarket > 25500,
    domain: "agriculture",
    delta: +0.06,
  },
  // USD/VND > 25500 → automotive (import parts cost up)
  {
    label: "usdVnd>25500",
    condition: (ctx) => ctx.usdVndMarket !== null && ctx.usdVndMarket > 25500,
    domain: "automotive",
    delta: -0.05,
  },
  // USD/VND < 24500 → reverse effects
  {
    label: "usdVnd<24500",
    condition: (ctx) => ctx.usdVndMarket !== null && ctx.usdVndMarket < 24500,
    domain: "agriculture",
    delta: -0.05,
  },
  {
    label: "usdVnd<24500",
    condition: (ctx) => ctx.usdVndMarket !== null && ctx.usdVndMarket < 24500,
    domain: "securities",
    delta: +0.06,
  },
  // Brent crude > 100 → severe oil crisis
  {
    label: "brentCrudeUSD>100",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 100,
    domain: "aviation",
    delta: -0.12,
  },
  {
    label: "brentCrudeUSD>100",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 100,
    domain: "oil_gas",
    delta: +0.15,
  },
  {
    label: "brentCrudeUSD>100",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 100,
    domain: "logistics",
    delta: -0.10,
  },
  {
    label: "brentCrudeUSD>100",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 100,
    domain: "retail",
    delta: -0.06,
  },
  // Gold > 3000 → strong safe haven demand
  {
    label: "goldUSDPerOz>3000",
    condition: (ctx) => ctx.goldUSDPerOz !== null && ctx.goldUSDPerOz > 3000,
    domain: "gold_mining",
    delta: +0.10,
  },
  // Gold > 4000 → extreme risk-off environment
  {
    label: "goldUSDPerOz>4000",
    condition: (ctx) => ctx.goldUSDPerOz !== null && ctx.goldUSDPerOz > 4000,
    domain: "gold_mining",
    delta: +0.08,
  },
  {
    label: "goldUSDPerOz>4000",
    condition: (ctx) => ctx.goldUSDPerOz !== null && ctx.goldUSDPerOz > 4000,
    domain: "securities",
    delta: -0.06,
  },
  // Overnight rate > 5% → tight liquidity
  {
    label: "overnightRatePct>5",
    condition: (ctx) => ctx.overnightRatePct !== null && ctx.overnightRatePct > 5,
    domain: "securities",
    delta: -0.08,
  },
  {
    label: "overnightRatePct>5",
    condition: (ctx) => ctx.overnightRatePct !== null && ctx.overnightRatePct > 5,
    domain: "real_estate",
    delta: -0.08,
  },
  // Macro dual pressure: Brent >100 AND USD/VND >25500 → severe cost + currency squeeze
  {
    label: "macroDualPressure(brent+usd)",
    condition: (ctx) =>
      ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 100 &&
      ctx.usdVndMarket !== null && ctx.usdVndMarket > 25500,
    domain: "aviation",
    delta: -0.15,
  },
  {
    label: "macroDualPressure(brent+usd)",
    condition: (ctx) =>
      ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 100 &&
      ctx.usdVndMarket !== null && ctx.usdVndMarket > 25500,
    domain: "logistics",
    delta: -0.12,
  },
  {
    label: "macroDualPressure(brent+usd)",
    condition: (ctx) =>
      ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 100 &&
      ctx.usdVndMarket !== null && ctx.usdVndMarket > 25500,
    domain: "retail",
    delta: -0.08,
  },
  {
    label: "macroDualPressure(brent+usd)",
    condition: (ctx) =>
      ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 100 &&
      ctx.usdVndMarket !== null && ctx.usdVndMarket > 25500,
    domain: "automotive",
    delta: -0.10,
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Dynamic macro adjustments (σ-based, replaces hardcoded thresholds)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps each macro indicator to the domains it affects and the direction.
 *
 * When an indicator is "above" its rolling mean:
 *   - domains listed under "above" get a positive delta (bullish)
 *   - domains listed under "below_means_bearish" get a negative delta (bearish)
 *
 * The delta magnitude is computed from deviationToDelta (±0.06/0.10/0.15)
 * based on how many σ away from the mean the current value is.
 */
interface DynamicMacroMapping {
  indicator: string;
  /** Domains that benefit when indicator is ABOVE mean */
  aboveBullish: DomainType[];
  /** Domains that suffer when indicator is ABOVE mean */
  aboveBearish: DomainType[];
}

const DYNAMIC_MACRO_MAP: DynamicMacroMapping[] = [
  {
    indicator: "brentCrudeUSD",
    aboveBullish: ["oil_gas"],
    aboveBearish: ["aviation", "logistics", "retail"],
  },
  {
    indicator: "goldUSDPerOz",
    aboveBullish: ["gold_mining"],
    aboveBearish: ["securities"], // extreme gold = risk-off = sell equities
  },
  {
    indicator: "usdVndRate",
    aboveBullish: ["agriculture", "steel"],   // exporters benefit
    aboveBearish: ["aviation", "automotive"], // importers suffer
  },
  {
    indicator: "usdVndOfficial",
    aboveBullish: ["agriculture"],
    aboveBearish: ["aviation"],
  },
  {
    indicator: "refinancingRatePct",
    aboveBullish: ["banking"],        // NIM expansion
    aboveBearish: ["real_estate"],    // borrowing cost up
  },
  {
    indicator: "overnightRatePct",
    aboveBullish: [],
    aboveBearish: ["securities", "real_estate"], // tight liquidity
  },
];

/**
 * Apply **dynamic σ-based** macro adjustments to domain-level entries.
 *
 * Instead of "oil > $100 → +0.15", this uses:
 *   "oil is +2.3σ above 30-day mean → HIGH → +0.10 for oil_gas, -0.10 for aviation"
 *
 * Falls through to the old hardcoded `applyMacroAdjustments` if no stats are provided.
 *
 * @param entries    - Chain entries to adjust (only "domain" level are modified)
 * @param macroStats - Pre-computed rolling statistics from macroStatsStore
 * @returns Array of MacroDeviation summaries for logging/display
 */
export function applyDynamicMacroAdjustments(
  entries: CausalChainEntry[],
  macroStats: MacroStats[],
): MacroDeviation[] {
  const deviations: MacroDeviation[] = [];

  for (const stats of macroStats) {
    const deviation = classifyDeviation(stats);
    deviations.push(deviation);

    if (deviation.level === "normal") continue;

    // Find the mapping for this indicator
    const mapping = DYNAMIC_MACRO_MAP.find((m) => m.indicator === stats.name);
    if (!mapping) continue;

    const rawDelta = deviationToDelta(deviation.level, deviation.direction);
    if (rawDelta === 0) continue;

    for (const entry of entries) {
      if (entry.level !== "domain") continue;

      // Check bullish domains (benefit when above mean)
      for (const domain of mapping.aboveBullish) {
        if (!entry.affectedDomains.includes(domain)) continue;
        const delta = rawDelta; // positive when above = good for bullish domains
        const newConf = Math.min(0.99, Math.max(0.05, entry.confidence + delta));
        entry.reasoning += ` [σ-Macro: ${deviation.summary} → ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} ${domain}]`;
        entry.confidence = newConf;
      }

      // Check bearish domains (suffer when above mean)
      for (const domain of mapping.aboveBearish) {
        if (!entry.affectedDomains.includes(domain)) continue;
        const delta = -rawDelta; // negative when above = bad for bearish domains
        const newConf = Math.min(0.99, Math.max(0.05, entry.confidence + delta));
        entry.reasoning += ` [σ-Macro: ${deviation.summary} → ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} ${domain}]`;
        entry.confidence = newConf;
      }
    }
  }

  return deviations;
}

// ═══════════════════════════════════════════════════════════════════════════
// Legacy macro adjustment helper (fallback when no stats available)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Apply macro adjustment rules to domain-level CausalChainEntries in-place.
 *
 * For each rule whose condition fires, every domain-level entry with the
 * matching domain gets its confidence adjusted by the rule's delta and its
 * reasoning annotated with "[Macro: label=VALUE → DELTA domain]".
 *
 * Confidence is clamped to [0.05, 0.99] after all deltas are applied.
 *
 * @param entries      - All chain entries (only "domain" level are modified)
 * @param macroContext - Live macro indicators
 */
/**
 * Maximum cumulative negative delta from macro adjustments per entry.
 * Prevents macro penalties from crushing confidence below useful levels
 * for infrastructure/sector news that has direct impact.
 */
const MAX_MACRO_NEGATIVE_DELTA = -0.25;

export function applyMacroAdjustments(
  entries: CausalChainEntry[],
  macroContext: MacroContext,
): void {
  // Track cumulative delta per entry to cap negative adjustments
  const cumulativeDelta = new Map<CausalChainEntry, number>();

  for (const rule of MACRO_ADJUSTMENTS) {
    if (!rule.condition(macroContext)) continue;

    // Derive the display value for annotation
    const displayValue = deriveDisplayValue(rule.label, macroContext);

    for (const entry of entries) {
      if (entry.level !== "domain") continue;
      if (!entry.affectedDomains.includes(rule.domain)) continue;

      const currentDelta = cumulativeDelta.get(entry) ?? 0;
      let effectiveDelta = rule.delta;

      // Cap cumulative negative delta to prevent over-penalisation
      if (effectiveDelta < 0) {
        const remaining = MAX_MACRO_NEGATIVE_DELTA - currentDelta;
        if (remaining >= 0) continue; // already at max negative cap
        effectiveDelta = Math.max(effectiveDelta, remaining);
      }

      // Apply delta
      const newConf = Math.min(0.99, Math.max(0.05, entry.confidence + effectiveDelta));
      const deltaStr = effectiveDelta >= 0 ? `+${effectiveDelta.toFixed(2)}` : effectiveDelta.toFixed(2);
      entry.reasoning +=
        ` [Macro: ${rule.label}=${displayValue} → ${deltaStr} ${rule.domain}]`;
      entry.confidence = newConf;
      cumulativeDelta.set(entry, currentDelta + effectiveDelta);
    }
  }
}

/**
 * Extract a human-readable numeric value from macroContext for the given label.
 */
function deriveDisplayValue(label: string, ctx: MacroContext): string {
  if (label.startsWith("brentCrudeUSD")) return String(ctx.brentCrudeUSD ?? "?");
  if (label.startsWith("goldUSDPerOz")) return String(ctx.goldUSDPerOz ?? "?");
  if (label.startsWith("usdVnd")) return String(ctx.usdVndMarket ?? ctx.usdVndOfficial ?? "?");
  if (label.startsWith("refinancingRatePct")) return String(ctx.refinancingRatePct ?? "?");
  if (label.startsWith("overnightRatePct")) return String(ctx.overnightRatePct ?? "?");
  return "?";
}

// ═══════════════════════════════════════════════════════════════════════════
// Sector impact rules
// ═══════════════════════════════════════════════════════════════════════════

export interface SectorRule {
  /** Any single keyword match triggers this rule */
  keywords: string[];
  domain: DomainType;
  direction: ImpactDirection;
  confidence: number;
  /** Human-readable rule description, used as CausalChainEntry.title */
  title: string;
  /** Optional: explicitly map rule to specific tickers (Task 1264) */
  affected_actions?: { code: string; direction: ImpactDirection }[];
  /**
   * Optional exclusion guard (FIX-1298/1299): if ANY of these keywords appear
   * in the article summary, the rule is skipped — even if a trigger keyword matched.
   * Use to prevent broad keyword rules from firing on unrelated contexts
   * (e.g., "geopolitical" in Fed/monetary articles should not trigger oil_gas cascade).
   */
  excludeKeywords?: string[];
  /**
   * Optional co-occurrence requirement (FIX-1298/1299): when set, the rule
   * only fires if AT LEAST ONE of these keywords is ALSO present in the article.
   * Use to narrow broad rules: e.g., coal/minerals rule only fires when oil/energy
   * context is also present.
   */
  requireAnyKeyword?: string[];
}

export const SECTOR_RULES: SectorRule[] = [
  // ── VN POLICY INTERVENTION OVERRIDE (must be FIRST — wins over war/recession bear rules) ──
  // Reports 920/922: when Vietnam government announces stabilization fund / market support
  // measures, the bullish policy RESPONSE must override bearish triggering-event keywords
  // ("war", "tariff", "decline") that may co-occur in the same article. First-match-wins
  // per domain (see line ~1503), so these rules MUST appear before the bearish rules below.
  {
    keywords: [
      "stabilization fund",
      "stock market support measures",
      "market support measures",
      "government stock market support",
      "government-backed",
      "government support package",
      "stimulus package",
      "quỹ bình ổn",
      "bình ổn thị trường",
      "chính phủ hỗ trợ thị trường",
      "biện pháp hỗ trợ thị trường",
      "hỗ trợ thị trường chứng khoán",
      "gói kích thích",
      "gói hỗ trợ",
      "nới room ngoại",
      "nới room khối ngoại",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.82,
    title: "Chính phủ can thiệp hỗ trợ thị trường — bullish reversal catalyst (CTCK hưởng lợi trực tiếp)",
  },
  {
    keywords: [
      "stabilization fund",
      "stock market support measures",   // FIX-1268: English exact phrase from article titles
      "market support measures",
      "government stock market support", // FIX-1268: English variant
      "quỹ bình ổn",
      "bình ổn thị trường",
      "chính phủ hỗ trợ thị trường",
      "hỗ trợ thị trường chứng khoán",  // FIX-1268: Vietnamese stock-market specific phrase
      "gói kích thích",
      "gói hỗ trợ",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.75,
    title: "Gói hỗ trợ thị trường — thanh khoản hệ thống cải thiện, tích cực cho ngân hàng",
  },
  {
    keywords: [
      "stabilization fund",
      "market support measures",
      "quỹ bình ổn",
      "bình ổn thị trường",
      "gói kích thích",
      "gói hỗ trợ",
    ],
    domain: "real_estate",
    direction: "up",
    confidence: 0.70,
    title: "Gói hỗ trợ — kỳ vọng dòng tiền chảy lại BĐS",
  },
  {
    keywords: [
      "stabilization fund",
      "market support measures",
      "quỹ bình ổn",
      "bình ổn thị trường",
      "gói kích thích",
      "gói hỗ trợ",
    ],
    domain: "retail",
    direction: "up",
    confidence: 0.65,
    title: "Gói hỗ trợ — tâm lý tiêu dùng cải thiện, tích cực bán lẻ",
  },

  // ── Task 1004: SBV / NHNN rate cut — direct monetary easing ──────────────
  // Must appear BEFORE generic "lãi suất giảm" rule so specific SBV
  // stabilization wins first-match-wins per domain for banking + securities.
  {
    keywords: [
      "nhnn hạ lãi suất", "ngân hàng nhà nước hạ lãi suất", "sbv rate cut",
      "hạ lãi suất điều hành", "giảm lãi suất điều hành", "cắt giảm lãi suất điều hành",
      "sbv cuts rate", "nhnn cắt giảm lãi suất", "hạ lãi suất tái cấp vốn",
      "giảm lãi suất tái chiết khấu", "nới lỏng tiền tệ", "monetary easing vietnam",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.87,
    title: "NHNN hạ lãi suất điều hành — NIM ngắn hạn điều chỉnh, thanh khoản hệ thống cải thiện",
  },
  {
    keywords: [
      "nhnn hạ lãi suất", "hạ lãi suất điều hành", "giảm lãi suất điều hành",
      "sbv rate cut", "nhnn cắt giảm lãi suất", "nới lỏng tiền tệ",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.85,
    title: "NHNN hạ lãi suất — chi phí vốn giảm, P/E thị trường mở rộng (CTCK hưởng lợi)",
  },
  {
    keywords: [
      "nhnn hạ lãi suất", "hạ lãi suất điều hành", "giảm lãi suất điều hành",
      "sbv rate cut", "nới lỏng tiền tệ",
    ],
    domain: "real_estate",
    direction: "up",
    confidence: 0.82,
    title: "NHNN hạ lãi suất — lãi vay mua nhà giảm, tích cực cho bất động sản trung dài hạn",
  },

  // ── Task 1004: Fiscal stimulus / Bơm tiền ngân sách ─────────────────────
  {
    keywords: [
      "bộ tài chính bơm tiền", "ngân sách nhà nước bơm tiền", "fiscal stimulus vietnam",
      "gói kích thích tài khóa", "tăng đầu tư công khẩn cấp", "bơm vốn vào thị trường",
      "government cash injection", "giải ngân đầu tư công khẩn cấp",
      "thúc đẩy giải ngân vốn đầu tư công", "gói phục hồi kinh tế",
      "chương trình phục hồi kinh tế", "economic recovery package vietnam",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.88,
    title: "Bơm tiền tài khóa — thanh khoản thị trường cải thiện mạnh, CTCK hưởng lợi trực tiếp",
  },
  {
    keywords: [
      "bộ tài chính bơm tiền", "gói kích thích tài khóa", "tăng đầu tư công khẩn cấp",
      "bơm vốn vào thị trường", "gói phục hồi kinh tế", "giải ngân đầu tư công khẩn cấp",
      "chương trình phục hồi kinh tế",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.80,
    title: "Gói kích thích tài khóa — thanh khoản hệ thống ngân hàng tăng, nợ xấu áp lực giảm",
  },
  {
    keywords: [
      "bộ tài chính bơm tiền", "gói kích thích tài khóa", "tăng đầu tư công khẩn cấp",
      "giải ngân đầu tư công khẩn cấp", "chương trình phục hồi kinh tế",
      "economic recovery package vietnam",
    ],
    domain: "construction",
    direction: "up",
    confidence: 0.78,
    title: "Giải ngân đầu tư công khẩn cấp — tích cực cho xây dựng và vật liệu",
  },
  {
    keywords: [
      "gói phục hồi kinh tế", "gói kích thích tài khóa",
      "chương trình phục hồi kinh tế", "economic recovery package vietnam",
    ],
    domain: "retail",
    direction: "up",
    confidence: 0.72,
    title: "Gói phục hồi kinh tế — cải thiện sức mua tiêu dùng (VNM, MWG)",
  },

  // ── Task 1004: Market Stabilization Fund — SCIC/Treasury intervention ────
  {
    keywords: [
      "scic mua vào cổ phiếu", "nhà nước mua vào cổ phiếu",
      "tổng công ty đầu tư vốn nhà nước", "scic intervenes",
      "state capital investment corporation", "chính phủ mua lại trái phiếu",
      "mua lại trái phiếu chính phủ", "treasury bond buyback",
      "nhnn mua trái phiếu chính phủ", "sbv bond purchase",
      "open market operations vietnam", "nghiệp vụ thị trường mở",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.90,
    title: "SCIC/NHNN can thiệp mua vào — tín hiệu chính phủ bảo vệ thị trường (bullish reversal mạnh)",
  },
  {
    keywords: [
      "scic mua vào cổ phiếu", "nhà nước mua vào cổ phiếu",
      "chính phủ mua lại trái phiếu", "nhnn mua trái phiếu chính phủ",
      "nghiệp vụ thị trường mở",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.82,
    title: "Nghiệp vụ thị trường mở — bơm thanh khoản hệ thống ngân hàng",
  },

  // ── Task 1004: Systemic stress — banking / liquidity crisis ──────────────
  {
    keywords: [
      "nợ xấu hệ thống vượt", "nợ xấu ngân hàng tăng mạnh", "banking system npl",
      "non-performing loan surge", "khủng hoảng thanh khoản ngân hàng",
      "bank liquidity crisis", "ngân hàng thiếu thanh khoản",
      "lãi suất liên ngân hàng tăng đột biến", "interbank rate spike",
      "overnight rate surge", "hệ thống ngân hàng căng thẳng thanh khoản",
      "bank run vietnam", "rút tiền hàng loạt", "bank stress vietnam",
    ],
    domain: "banking",
    direction: "down",
    confidence: 0.90,
    title: "Căng thẳng hệ thống ngân hàng — nợ xấu / thanh khoản hệ thống (rủi ro hệ thống cao)",
  },
  {
    keywords: [
      "nợ xấu hệ thống vượt", "khủng hoảng thanh khoản ngân hàng",
      "bank liquidity crisis", "bank run vietnam", "rút tiền hàng loạt",
      "bank stress vietnam", "banking system npl",
    ],
    domain: "securities",
    direction: "down",
    confidence: 0.85,
    title: "Khủng hoảng hệ thống ngân hàng — tâm lý sụp đổ, VN-Index rủi ro giảm mạnh",
  },
  {
    keywords: [
      "nợ xấu hệ thống vượt", "khủng hoảng thanh khoản ngân hàng",
      "bank run vietnam", "bank stress vietnam",
    ],
    domain: "real_estate",
    direction: "down",
    confidence: 0.80,
    title: "Khủng hoảng ngân hàng — tín dụng BĐS đóng băng (VHM, NVL rủi ro cao)",
  },

  // ── Task 1004: SOE restructuring / equitisation ──────────────────────────
  {
    keywords: [
      "cổ phần hóa doanh nghiệp nhà nước", "equitisation vietnam",
      "thoái vốn nhà nước", "nhà nước thoái vốn", "scic thoái vốn",
      "privatisation vietnam", "bán vốn nhà nước", "ipo doanh nghiệp nhà nước",
      "state divestment", "soe restructuring vietnam",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.75,
    title: "Cổ phần hóa/thoái vốn DNNN — cung cổ phiếu mới, cơ hội đầu tư dài hạn (CTCK hưởng lợi phí)",
  },
  {
    keywords: [
      "cổ phần hóa doanh nghiệp nhà nước", "thoái vốn nhà nước",
      "scic thoái vốn", "privatisation vietnam", "state divestment",
    ],
    domain: "real_estate",
    direction: "up",
    confidence: 0.68,
    title: "Thoái vốn DNNN — giải phóng quỹ đất và tài sản BĐS (cơ hội M&A)",
  },
  // Task 1206: prime urban land ("đất vàng") → real_estate bullish
  // "vàng" alone does not appear in gold_mining rules, so no collision risk.
  {
    keywords: ["đất vàng", "quỹ đất vàng", "vị trí đất vàng"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.75,
    title: "Đất vàng — quỹ đất vị trí đắc địa, tích cực trực tiếp cho bất động sản",
  },

  {
    keywords: ["giá dầu tăng", "oil price rise", "crude oil up", "giá dầu tăng mạnh", "opec"],
    domain: "oil_gas",
    direction: "up",
    confidence: 0.85,
    title: "Giá dầu tăng — tích cực cho ngành dầu khí",
  },
  {
    keywords: ["giá dầu giảm", "oil price fall", "crude oil down", "oil crash", "oil slump", "oil plunge", "oil drop", "oil decline", "dầu thô giảm", "dầu lao dốc", "worst week", "oil tumble", "crude oil decline", "opec cut", "demand destruction"],
    domain: "oil_gas",
    direction: "down",
    confidence: 0.85,
    title: "Giá dầu giảm — tiêu cực cho ngành dầu khí",
  },
  {
    keywords: ["giá dầu tăng", "oil price rise", "fuel cost", "aviation fuel"],
    domain: "aviation",
    direction: "down",
    confidence: 0.75,
    title: "Giá dầu tăng — tăng chi phí nhiên liệu hàng không",
  },
  // Task 1224: Oil price FALL → aviation BULLISH (inverse relationship)
  // Jet fuel is ~35-40% of airline OPEX. Lower oil = lower fuel cost = VJC bullish.
  {
    keywords: [
      "giá dầu giảm", "oil price fall", "crude oil down", "oil crash", "oil slump",
      "oil plunge", "oil drop", "oil decline", "dầu thô giảm", "dầu lao dốc",
      "worst week", "oil tumble", "crude oil decline",
    ],
    domain: "aviation",
    direction: "up",
    confidence: 0.70,
    title: "Giá dầu giảm — giảm chi phí nhiên liệu hàng không (VJC hưởng lợi)",
  },
  // Task 1224: Fuel tax cut → aviation BULLISH (reduced operating cost)
  {
    keywords: [
      "giảm thuế xăng dầu", "thuế nhiên liệu", "fuel tax", "giảm thuế xăng",
      "thuế xăng dầu về 0", "giảm thuế với xăng dầu", "thuế xăng về 0",
      "tax cut fuel", "fuel tax reduction", "giảm thuế xăng dầu về 0",
    ],
    domain: "aviation",
    direction: "up",
    confidence: 0.72,
    title: "Giảm thuế xăng dầu — chi phí nhiên liệu hàng không giảm (VJC tích cực)",
  },
  {
    keywords: ["lãi suất tăng", "interest rate hike", "fed hike", "fed tăng lãi suất"],
    domain: "banking",
    direction: "up",
    confidence: 0.70,
    title: "Lãi suất tăng — ngắn hạn tích cực cho biên lãi suất ngân hàng",
  },
  {
    keywords: ["lãi suất tăng", "interest rate hike", "fed hike"],
    domain: "real_estate",
    direction: "down",
    confidence: 0.80,
    title: "Lãi suất tăng — tiêu cực cho bất động sản (chi phí vốn tăng)",
  },
  {
    keywords: ["lãi suất giảm", "interest rate cut", "rate cut"],
    domain: "banking",
    direction: "neutral",
    confidence: 0.60,
    title: "Lãi suất giảm — áp lực biên lãi suất ngân hàng",
  },
  {
    keywords: ["lãi suất giảm", "interest rate cut"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.75,
    title: "Lãi suất giảm — tích cực cho bất động sản (vay mua nhà rẻ hơn)",
  },
  {
    keywords: ["giá thép tăng", "steel price rise", "steel price up", "nhu cầu thép"],
    domain: "steel",
    direction: "up",
    confidence: 0.80,
    title: "Giá thép tăng — tích cực cho doanh nghiệp thép",
  },
  {
    keywords: ["giá thép giảm", "steel price fall", "steel price down", "steel slump", "steel crash", "steel decline", "thép giảm giá", "steel overcapacity", "dư thừa thép", "steel dumping", "thép Trung Quốc", "china steel flood", "steel oversupply"],
    domain: "steel",
    direction: "down",
    confidence: 0.80,
    title: "Giá thép giảm — tiêu cực cho doanh nghiệp thép",
  },
  // ── Coal / Mining → utilities (thermal power, energy sector) ─────────────
  // FIX-1299: Changed domain from "oil_gas" to "utilities".
  // Coal/minerals business news directly affects thermal power companies (e.g., POW —
  // Petrovietnam Power, where coal is ~60-70% of fuel COGS). BSR is Binh Son Refinery
  // (crude oil refinery) — it has NO exposure to coal or minerals prices.
  // Using domain "utilities" means: (a) coal articles cascade to thermal power correctly,
  // (b) COMMODITY_TRIGGER_DOMAINS includes "utilities" so market-wide broadcast is
  // restricted — BSR (oil_gas domain) is NOT in alreadyCoveredDomains → skipped.
  // NOTE: "giá than", "giá than tăng", "giá than giảm" are intentionally OMITTED here —
  // they are handled by the more-specific Task 1315a rules below (lines ~1710) with
  // correct directional signals. This rule handles broader coal/mining context only.
  {
    keywords: ["kinh doanh than", "coal mining", "than đá", "coal price", "khoáng sản", "mineral mining"],
    domain: "utilities",
    direction: "up",
    confidence: 0.75,
    title: "Than/khoáng sản — tích cực cho ngành điện/năng lượng (POW hưởng lợi từ giá than cao)",
  },
  {
    keywords: ["coal price drop", "coal price fall", "than đá giảm"],
    domain: "utilities",
    direction: "down",
    confidence: 0.70,
    title: "Giá than giảm — tiêu cực cho doanh nghiệp than, giảm chi phí cho điện than (POW)",
  },
  // ── Large infrastructure projects → aviation + logistics + construction ──
  {
    keywords: ["sân bay long thành", "long thanh airport", "siêu dự án", "dự án hạ tầng", "dự án giao thông", "cao tốc", "dự án 200"],
    domain: "aviation",
    direction: "up",
    confidence: 0.80,
    title: "Dự án hạ tầng lớn — tích cực cho hàng không/logistics",
  },
  {
    keywords: ["sân bay long thành", "long thanh airport", "siêu dự án", "dự án hạ tầng", "dự án giao thông", "cao tốc"],
    domain: "logistics",
    direction: "up",
    confidence: 0.75,
    title: "Dự án hạ tầng lớn — tích cực cho logistics/vận tải",
  },
  {
    keywords: ["vn-index tăng", "vn-index tăng điểm", "market rally", "thị trường tăng"],
    domain: "securities",
    direction: "up",
    confidence: 0.85,
    title: "VN-Index tăng — tích cực trực tiếp cho chứng khoán",
  },
  {
    keywords: ["vn-index giảm", "vn-index giảm điểm", "market decline", "thị trường giảm"],
    domain: "securities",
    direction: "down",
    confidence: 0.85,
    title: "VN-Index giảm — tiêu cực trực tiếp cho chứng khoán",
  },
  // VN-Index → banking (blue-chip constituent, largest sector weight)
  {
    keywords: ["vn-index giảm", "vn-index giảm điểm", "market decline", "thị trường giảm", "mất điểm tháng", "giảm liên tiếp"],
    domain: "banking",
    direction: "down",
    confidence: 0.70,
    title: "VN-Index giảm — tiêu cực cho nhóm ngân hàng blue-chip",
  },
  {
    keywords: ["vn-index tăng", "vn-index tăng điểm", "market rally", "thị trường tăng"],
    domain: "banking",
    direction: "up",
    confidence: 0.70,
    title: "VN-Index tăng — tích cực cho nhóm ngân hàng",
  },
  // VN-Index → real_estate (index-sensitive sector)
  {
    keywords: ["vn-index giảm", "vn-index giảm điểm", "market decline", "thị trường giảm", "mất điểm tháng"],
    domain: "real_estate",
    direction: "down",
    confidence: 0.65,
    title: "VN-Index giảm — tiêu cực cho bất động sản",
  },
  {
    keywords: ["vn-index tăng", "vn-index tăng điểm", "market rally", "thị trường tăng"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.65,
    title: "VN-Index tăng — tích cực cho bất động sản",
  },
  {
    keywords: ["lạm phát cao", "high inflation", "lạm phát tăng"],
    domain: "banking",
    direction: "neutral",
    confidence: 0.65,
    title: "Lạm phát cao — tác động hỗn hợp lên ngân hàng",
  },
  {
    keywords: ["tỷ giá usd", "usd/vnd tăng", "vnd weakens", "đồng đô la tăng"],
    domain: "aviation",
    direction: "down",
    confidence: 0.70,
    title: "USD/VND tăng — tăng chi phí thuê máy bay và nhiên liệu",
  },
  {
    keywords: ["tỷ giá usd", "usd/vnd tăng", "vnd weakens"],
    domain: "steel",
    direction: "up",
    confidence: 0.60,
    title: "USD/VND tăng — tăng giá trị xuất khẩu thép tính bằng VND",
  },
  // ── Logistics: VN fuel-cost-specific phrases (FR-1, Task 1315a) ──────────
  // First-match-wins: VN fuel phrases more specific than generic "giá dầu tăng".
  // Insert BEFORE generic oil rule. GMD/VVN fuel ~30-40% trucking/maritime OPEX.
  {
    keywords: [
      "chi phí xăng dầu tăng",
      "cước nhiên liệu tăng",
      "phí nhiên liệu tăng",
      "giá xăng tăng",
      "xăng dầu tăng giá",
      "fuel surcharge",
      "bunker fuel cost",
      "trucking fuel cost",
    ],
    domain: "logistics",
    direction: "down",
    confidence: 0.72,
    title: "Chi phí xăng dầu tăng — áp lực OPEX nhiên liệu cho logistics (GMD, VVN)",
  },
  // ── Logistics: VN fuel-cost-down (FR-2, Task 1315a) ──────────────────────
  // Insert BEFORE generic "giá dầu giảm" rule. Symmetric inverse of FR-1.
  {
    keywords: [
      "giá xăng giảm",
      "chi phí nhiên liệu giảm",
      "xăng dầu giảm giá",
      "fuel cost down",
      "bunker fuel down",
    ],
    domain: "logistics",
    direction: "up",
    confidence: 0.68,
    title: "Chi phí xăng dầu giảm — OPEX giảm, tích cực cho logistics (GMD, VVN)",
  },
  // ── Logistics: high oil price → cost pressure (bearish) ──────────────────
  {
    keywords: ["giá dầu tăng", "oil price rise", "crude oil up", "fuel cost"],
    domain: "logistics",
    direction: "down",
    confidence: 0.70,
    title: "Giá dầu tăng — tăng chi phí vận chuyển, áp lực lên logistics",
  },
  {
    keywords: ["giá dầu giảm", "oil price fall", "crude oil down"],
    domain: "logistics",
    direction: "up",
    confidence: 0.65,
    title: "Giá dầu giảm — giảm chi phí nhiên liệu, tích cực cho logistics",
  },
  // ── Cement / construction: infrastructure spending → bearish if cut (Task 1200) ─
  // MUST appear BEFORE positive "đầu tư công" → steel rule (first-match-wins per domain).
  {
    keywords: [
      "cắt giảm đầu tư công",
      "giảm đầu tư công",
      "đầu tư công chậm trễ",
      "chậm trễ đầu tư công",
      "đình trệ đầu tư công",
      "đầu tư công đình trệ",
      "đầu tư công giảm",
      "vốn đầu tư công giảm",
      "public investment cut",
      "infrastructure spending cut",
      "capex cut",
    ],
    domain: "steel",
    direction: "down",
    confidence: 0.75,
    title: "Cắt giảm đầu tư công — nhu cầu thép xây dựng giảm (HPG, NKG bị ảnh hưởng)",
  },
  // ── Cement / construction: infrastructure spending → bullish ─────────────
  {
    keywords: ["đầu tư công", "infrastructure spending", "public investment", "gói kích thích", "xây dựng hạ tầng", "cầu đường"],
    domain: "steel",
    direction: "up",
    confidence: 0.72,
    title: "Đầu tư công tăng — tích cực cho thép và vật liệu xây dựng",
  },
  {
    keywords: ["đầu tư công", "infrastructure spending", "public investment", "xây dựng hạ tầng"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.65,
    title: "Đầu tư công tăng — tích cực cho bất động sản khu vực hạ tầng",
  },
  // ── Construction: input-cost squeeze (FR-4, Task 1315a) ──────────────────
  // Insert AFTER demand-side rules (above = "đầu tư công" → infrastructure demand).
  // These rules target commodity price keywords — no overlap with demand rules.
  // CTD/HTI: steel rebar ~20-25% project COGS; cement ~10-15%. Fixed-price contracts.
  {
    keywords: [
      "giá thép xây dựng tăng",
      "giá sắt thép tăng",
      "chi phí thép tăng",
      "thép xây dựng tăng giá",
      "vật liệu xây dựng tăng giá",
      "construction steel price rise",
      "rebar price rise",
      "steel input cost rise",
    ],
    domain: "construction",
    direction: "down",
    confidence: 0.73,
    title: "Giá thép xây dựng tăng — thu hẹp biên lợi nhuận nhà thầu (CTD, HTI)",
  },
  {
    keywords: [
      "giá xi măng tăng",
      "xi măng tăng giá",
      "chi phí xi măng tăng",
      "cement price rise",
      "cement price up",
    ],
    domain: "construction",
    direction: "down",
    confidence: 0.68,
    title: "Giá xi măng tăng — tăng chi phí đầu vào hợp đồng cố định (CTD, HTI)",
  },
  {
    keywords: [
      "giá thép xây dựng giảm",
      "giá xi măng giảm",
      "vật liệu xây dựng giảm giá",
      "construction material cost fall",
      "rebar price fall",
      "cement price fall",
    ],
    domain: "construction",
    direction: "up",
    confidence: 0.65,
    title: "Vật liệu xây dựng giảm — mở rộng biên lợi nhuận hợp đồng cố định (CTD, HTI)",
  },
  // ── Seafood / agriculture: USD/VND rate → export revenue impact ──────────
  {
    keywords: ["tỷ giá usd", "usd/vnd tăng", "vnd weakens", "đồng đô la tăng"],
    domain: "agriculture",
    direction: "up",
    confidence: 0.68,
    title: "USD/VND tăng — tăng doanh thu xuất khẩu thủy sản và nông sản tính bằng VND",
  },
  {
    keywords: ["usd/vnd giảm", "vnd strengthens", "vnd mạnh hơn"],
    domain: "agriculture",
    direction: "down",
    confidence: 0.65,
    title: "USD/VND giảm — giảm doanh thu xuất khẩu thủy sản tính bằng VND",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Global macro → Vietnam cascade (Level 1 → Level 2-3)
  // Triggered by Trading Economics stream data
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Fed / US monetary policy ───────────────────────────────────────────────
  {
    keywords: ["fed rate", "federal reserve", "fomc", "fed funds", "powell", "fed hike", "fed cut"],
    domain: "banking",
    direction: "neutral",
    confidence: 0.72,
    title: "Fed thay đổi chính sách — tác động đến dòng vốn ngoại và lãi suất VN",
  },
  {
    keywords: ["fed rate", "federal reserve", "fomc", "fed tightening", "quantitative tightening"],
    domain: "securities",
    direction: "down",
    confidence: 0.70,
    title: "Fed thắt chặt — rủi ro rút vốn ngoại khỏi thị trường mới nổi (EM outflow)",
  },
  {
    keywords: ["fed cut", "fed easing", "rate cut", "dovish fed"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.68,
    title: "Fed nới lỏng — giảm áp lực tỷ giá, hỗ trợ dòng vốn vào bất động sản",
  },

  // ── US-China trade / tariffs ───────────────────────────────────────────────
  {
    keywords: ["us tariff", "trade war", "china tariff", "trade tension", "us-china"],
    domain: "agriculture",
    direction: "up",
    confidence: 0.65,
    title: "Chiến tranh thương mại Mỹ-Trung — VN hưởng lợi từ chuyển dịch chuỗi cung ứng (thủy sản, nông sản)",
  },
  {
    keywords: ["us tariff", "trade war", "china tariff", "trade tension"],
    domain: "tech",
    direction: "up",
    confidence: 0.60,
    title: "Chiến tranh thương mại — FDI công nghệ chuyển dịch sang VN (Samsung, Apple suppliers)",
  },
  {
    keywords: ["tariff on vietnam", "us vietnam tariff", "vietnam trade deficit"],
    domain: "agriculture",
    direction: "down",
    confidence: 0.75,
    title: "Mỹ áp thuế VN — rủi ro xuất khẩu thủy sản và nông sản sang Mỹ",
  },
  {
    keywords: ["tariff on vietnam", "us vietnam tariff"],
    domain: "retail",
    direction: "down",
    confidence: 0.65,
    title: "Mỹ áp thuế VN — rủi ro xuất khẩu dệt may và hàng tiêu dùng",
  },

  // ── China economy / PMI / slowdown ─────────────────────────────────────────
  {
    keywords: ["china pmi", "china manufacturing", "china slowdown", "china gdp"],
    domain: "steel",
    direction: "down",
    confidence: 0.75,
    title: "Trung Quốc giảm tốc — giảm nhu cầu thép và vật liệu xây dựng khu vực",
  },
  {
    keywords: ["china pmi", "china manufacturing", "china recovery", "china stimulus"],
    domain: "oil_gas",
    direction: "up",
    confidence: 0.65,
    title: "Trung Quốc phục hồi — tăng nhu cầu năng lượng khu vực",
  },
  {
    keywords: ["china stock", "shanghai composite", "hang seng", "china market"],
    domain: "securities",
    direction: "neutral",
    confidence: 0.60,
    title: "Thị trường TQ biến động — tâm lý lan tỏa sang EM Đông Nam Á",
  },

  // ── Commodity prices ───────────────────────────────────────────────────────
  {
    keywords: ["gold price", "giá vàng", "gold surge", "gold rally", "precious metal"],
    domain: "gold_mining",
    direction: "up",
    confidence: 0.85,
    title: "Vàng tăng — tích cực trực tiếp cho PNJ và ngành vàng",
  },
  {
    keywords: ["gold price fall", "giá vàng giảm", "gold drop"],
    domain: "gold_mining",
    direction: "down",
    confidence: 0.80,
    title: "Vàng giảm — tiêu cực cho ngành vàng và trang sức",
  },
  {
    keywords: ["wheat", "soybean", "corn", "grain", "food price", "commodity price"],
    domain: "agriculture",
    direction: "neutral",
    confidence: 0.60,
    title: "Giá nông sản thế giới biến động — tác động đến chi phí/doanh thu nông nghiệp VN",
  },

  // ── Task 1309a: Agriculture commodity export rules ────────────────────────
  // Coffee/rice/seafood export decline → agriculture BEARISH.
  // These are commodity-sector articles — must NOT broadcast to real_estate/banking
  // via market-wide path (COMMODITY_TRIGGER_DOMAINS includes "agriculture").
  // FIX-1286: added "cà phê và gạo", "hụt hơi", "giá cà phê", "giá gạo",
  // "nông sản xuất khẩu", "gạo xuất khẩu" so that Vietnamese-language
  // headlines with reversed word order ("Xuất khẩu cà phê và gạo hụt hơi")
  // still match this rule and trigger the commodity broadcast exclusion guard.
  {
    keywords: [
      "coffee export", "coffee export decline", "cà phê xuất khẩu", "xuất khẩu cà phê",
      "coffee export revenues", "giá cà phê xuất khẩu", "cà phê giảm",
      "cà phê và gạo", "giá cà phê", "hụt hơi",
      "rice export", "rice export decline", "xuất khẩu gạo", "gạo xuất khẩu giảm",
      "rice export revenues", "xuất khẩu nông sản giảm", "agriculture exports drop",
      "vietnam agriculture exports", "nông sản xuất khẩu giảm",
      "nông sản xuất khẩu", "giá gạo", "gạo xuất khẩu",
      "seafood export decline", "xuất khẩu thủy sản giảm", "thủy sản xuất khẩu giảm",
    ],
    domain: "agriculture",
    direction: "down",
    confidence: 0.72,
    title: "Xuất khẩu nông sản/cà phê/gạo giảm — tiêu cực cho ngành nông nghiệp (GVR, VNM, ANV, MPC)",
  },
  {
    keywords: ["copper price", "giá đồng", "copper surge", "industrial metal"],
    domain: "steel",
    direction: "up",
    confidence: 0.55,
    title: "Giá kim loại công nghiệp tăng — tín hiệu tích cực cho ngành vật liệu",
  },

  // ── Global inflation / CPI ─────────────────────────────────────────────────
  {
    keywords: ["us inflation", "us cpi", "consumer price", "inflation surge", "inflation rate"],
    domain: "banking",
    direction: "neutral",
    confidence: 0.65,
    title: "Lạm phát Mỹ — ảnh hưởng kỳ vọng Fed, gián tiếp tác động lãi suất VN",
  },
  {
    keywords: ["global recession", "recession risk", "economic downturn", "slowdown"],
    domain: "securities",
    direction: "down",
    confidence: 0.70,
    title: "Rủi ro suy thoái toàn cầu — giảm dòng vốn vào thị trường mới nổi",
  },
  {
    keywords: ["global recession", "recession risk", "economic downturn"],
    domain: "logistics",
    direction: "down",
    confidence: 0.65,
    title: "Rủi ro suy thoái — giảm khối lượng thương mại và vận tải quốc tế",
  },

  // ── DXY / Dollar strength ──────────────────────────────────────────────────
  {
    keywords: ["dollar index", "dxy", "strong dollar", "dollar surge", "usd rally"],
    domain: "securities",
    direction: "down",
    confidence: 0.68,
    title: "USD mạnh — rút vốn ngoại khỏi thị trường mới nổi (Sell VN → Buy USD assets)",
  },
  {
    keywords: ["dollar index", "dxy", "weak dollar", "dollar fall"],
    domain: "securities",
    direction: "up",
    confidence: 0.65,
    title: "USD yếu — dòng vốn ngoại quay lại thị trường mới nổi",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OIL_SUPPLY_SHOCK_RULES (Task 1246)
  // Hormuz blockade / Suez closure / OPEC cut → sector cascades
  // Must appear BEFORE generic geopolitical / oil-price rules so that
  // the specific supply-shock context takes priority (first-match-wins per domain).
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Oil supply shock → oil_gas BULLISH (price spike benefit for upstream) ─
  {
    keywords: [
      "phong tỏa eo biển hormuz",
      "phong tỏa hormuz",
      "eo biển hormuz bị phong tỏa",
      // FIX-1264: article uses "eo hormuz" (without "biển") — add both short variants
      "eo hormuz bị phong tỏa",
      "hormuz bị phong tỏa",
      "hormuz blockade",
      "strait of hormuz blocked",
      "strait of hormuz blockade",
      "hormuz strait blockade",
      "hormuz strait blocked",
      "suez closure",
      "suez canal closed",
      "suez canal closure",
      "opec cắt giảm",
      "opec cut",
      "opec production cut",
      "opec+ cut",
      "gián đoạn nguồn cung dầu",
      "oil supply disruption",
      "oil supply shock",
      "crude oil supply shock",
    ],
    domain: "oil_gas",
    direction: "up",
    confidence: 0.88,
    title: "Gián đoạn nguồn cung dầu (Hormuz/Suez/OPEC) — giá dầu tăng mạnh, tích cực cho PVD, PVS, GAS, BSR",
    affected_actions: [
      { code: "PVD", direction: "up" },
      { code: "PVS", direction: "up" },
      { code: "GAS", direction: "up" },
      // FIX-1264: BSR (Binh Son Refinery) is oil_gas — Hormuz blockade = oil price up = BULLISH
      { code: "BSR", direction: "up" },
    ],
  },

  // ── Oil supply shock → aviation BEARISH (jet fuel cost spike) ─────────────
  {
    keywords: [
      "phong tỏa eo biển hormuz",
      "phong tỏa hormuz",
      // FIX-1264: article uses "eo hormuz" (without "biển") — add both short variants
      "eo hormuz bị phong tỏa",
      "hormuz bị phong tỏa",
      "hormuz blockade",
      "strait of hormuz blocked",
      "strait of hormuz blockade",
      "hormuz strait blockade",
      "hormuz strait blocked",
      "suez canal closed",
      "suez canal closure",
      "suez closure",
      "opec cắt giảm",
      "opec cut",
      "opec production cut",
      "gián đoạn nguồn cung dầu",
      "oil supply disruption",
      "oil supply shock",
    ],
    domain: "aviation",
    direction: "down",
    confidence: 0.84,
    title: "Gián đoạn nguồn cung dầu — chi phí nhiên liệu hàng không tăng mạnh (VJC, HVN chịu áp lực)",
    affected_actions: [
      { code: "VJC", direction: "down" },
      { code: "HVN", direction: "down" },
    ],
  },

  // ── Oil supply shock → logistics BEARISH (route disruption + fuel cost) ────
  {
    keywords: [
      "phong tỏa eo biển hormuz",
      "phong tỏa hormuz",
      "hormuz blockade",
      "strait of hormuz blocked",
      "strait of hormuz blockade",
      "hormuz strait blockade",
      "hormuz strait blocked",
      "suez canal closed",
      "suez canal closure",
      "suez closure",
      "gián đoạn nguồn cung dầu",
      "oil supply disruption",
      "oil supply shock",
    ],
    domain: "logistics",
    direction: "down",
    confidence: 0.82,
    title: "Gián đoạn nguồn cung dầu — tuyến vận tải bị gián đoạn, chi phí tăng (GMD, PHP chịu áp lực)",
    affected_actions: [
      // FIX-1264: BSR removed — BSR is Binh Son Refinery (oil_gas), not logistics
      { code: "GMD", direction: "down" },
      { code: "PHP", direction: "down" },
    ],
  },

  // ── Oil supply shock → securities BEARISH (market-wide risk-off) ───────────
  {
    keywords: [
      "phong tỏa eo biển hormuz",
      "phong tỏa hormuz",
      "eo biển hormuz bị phong tỏa",
      "hormuz blockade",
      "strait of hormuz blocked",
      "strait of hormuz blockade",
      "hormuz strait blockade",
      "hormuz strait blocked",
      "gián đoạn nguồn cung dầu",
      "oil supply shock",
      "crude oil supply shock",
    ],
    domain: "securities",
    direction: "down",
    confidence: 0.78,
    title: "Gián đoạn nguồn cung dầu — rủi ro địa chính trị cao, tâm lý risk-off ảnh hưởng VN-Index",
  },

  // ── Oil supply shock / Hormuz → retail BEARISH for VNM (Task 1214) ──────────
  // VNM (Vinamilk) exports ~8% revenue to Middle East. Hormuz blockade or
  // oil supply shock disrupts export logistics and raises shipping costs.
  {
    keywords: [
      "strait of hormuz",
      "hormuz blockade",
      "hormuz blocked",
      "phong tỏa hormuz",
      "eo biển hormuz",
      "oil supply shock",
      "gián đoạn nguồn cung dầu",
      "middle east conflict",
      "middle east tension",
      "xuất khẩu sữa",
    ],
    domain: "retail",
    direction: "down",
    confidence: 0.68,
    title: "Gián đoạn Hormuz/Trung Đông — xuất khẩu sữa VNM sang Trung Đông bị ảnh hưởng, chi phí logistics tăng (VNM bearish)",
  },

  // ── Taiwan / semiconductor DE-ESCALATION (before escalation — first match wins) ──
  {
    keywords: [
      "taiwan peace", "taiwan talks", "taiwan de-escalation", "cross-strait dialogue",
      "taiwan strait reopen", "taiwan ceasefire", "đài loan hòa dịu", "hạ nhiệt eo biển đài loan",
    ],
    domain: "tech",
    direction: "up",
    confidence: 0.80,
    title: "Hạ nhiệt eo biển Đài Loan — chuỗi cung ứng bán dẫn phục hồi, tích cực tech/FPT",
  },
  {
    keywords: [
      "taiwan peace", "taiwan talks", "taiwan de-escalation", "cross-strait dialogue",
      "taiwan strait reopen", "đài loan hòa dịu", "hạ nhiệt eo biển đài loan",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.75,
    title: "Hạ nhiệt Đài Loan — risk-on, dòng vốn quay lại thị trường mới nổi",
  },
  {
    keywords: [
      "taiwan peace", "taiwan talks", "taiwan de-escalation", "cross-strait dialogue",
      "taiwan strait reopen", "đài loan hòa dịu",
    ],
    domain: "retail",
    direction: "up",
    confidence: 0.68,
    title: "Hạ nhiệt Đài Loan — chi phí linh kiện điện tử giảm, tích cực bán lẻ điện máy",
  },

  // ── Geopolitical DE-ESCALATION (MUST be before escalation — first match wins) ──
  // When news contains BOTH "war" and "peace", de-escalation wins because
  // peace/ceasefire keywords are checked first.
  // Moved from bottom of array to before escalation rules.
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hòa bình", "ngừng bắn", "hạ nhiệt", "peace talks", "peace deal", "peace prospects", "iran peace", "iran address", "iran talks", "iran deal", "hormuz reopen"],
    domain: "oil_gas",
    direction: "down",
    confidence: 0.80,
    title: "Hạ nhiệt địa chính trị — giá dầu giảm (nguồn cung phục hồi, Hormuz mở lại)",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hòa bình", "hạ nhiệt", "peace talks"],
    domain: "aviation",
    direction: "up",
    confidence: 0.78,
    title: "Hạ nhiệt — giá nhiên liệu giảm, tích cực cho hàng không (VJC, HVN)",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hòa bình", "hạ nhiệt", "hormuz reopen"],
    domain: "logistics",
    direction: "up",
    confidence: 0.75,
    title: "Hạ nhiệt — chuỗi cung ứng phục hồi, vận tải biển bình thường hóa",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hòa bình", "hạ nhiệt", "risk-on"],
    domain: "gold_mining",
    direction: "down",
    confidence: 0.75,
    title: "Hạ nhiệt — vàng giảm (bớt nhu cầu trú ẩn safe haven → risk-on)",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hòa bình", "hạ nhiệt", "risk-on"],
    domain: "securities",
    direction: "up",
    confidence: 0.78,
    title: "Hạ nhiệt — risk-on, dòng vốn ngoại quay lại thị trường mới nổi",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hòa bình", "hạ nhiệt"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.60,
    title: "Hạ nhiệt — kỳ vọng lãi suất ổn định, tâm lý đầu tư BĐS cải thiện",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hạ nhiệt"],
    domain: "retail",
    direction: "up",
    confidence: 0.60,
    title: "Hạ nhiệt — chi phí vận hành giảm, tích cực bán lẻ",
  },
  {
    keywords: ["peace", "ceasefire", "war end", "de-escalation", "hạ nhiệt"],
    domain: "steel",
    direction: "up",
    confidence: 0.55,
    title: "Hạ nhiệt — thương mại quốc tế phục hồi, xuất khẩu cải thiện",
  },

  // ── Geopolitical ESCALATION (after de-escalation — only fires if no peace keyword matched) ──
  // FIX-1298: This rule uses broad keywords ("geopolitical", "conflict") that can match
  // Fed/monetary policy articles (e.g., "geopolitical uncertainty drives Fed rate cut appeal").
  // Guard: requireAnyKeyword ensures oil/energy context must be present.
  // Guard: excludeKeywords skips the rule when article is primarily about monetary policy
  // (Fed, FOMC, central bank, lãi suất) without oil/energy substance.
  {
    keywords: ["war", "conflict", "geopolitical", "middle east", "chiến tranh", "xung đột", "iran attack", "iran strike", "iran war", "strait of hormuz", "military strike"],
    domain: "oil_gas",
    direction: "up",
    confidence: 0.78,
    title: "Rủi ro địa chính trị — đẩy giá dầu lên (supply disruption)",
    // Must contain oil/energy context to cascade to oil_gas domain.
    requireAnyKeyword: [
      "oil", "dầu", "crude", "petroleum", "energy", "năng lượng",
      "opec", "gas", "khí đốt", "refinery", "nhà máy lọc dầu",
      "hormuz", "suez",
    ],
    // Skip if article is about monetary policy / Fed with no oil substance.
    excludeKeywords: [
      "federal reserve", "fed chair", "fed funds", "fomc", "fed rate",
      "monetary policy", "ngân hàng trung ương", "central bank",
      "rate cut", "interest rate", "lãi suất", "net worth",
      "gold selling", "gold reserve",
    ],
  },
  {
    keywords: ["war", "conflict", "geopolitical", "middle east", "strait of hormuz"],
    domain: "logistics",
    direction: "down",
    confidence: 0.72,
    title: "Xung đột — gián đoạn chuỗi cung ứng toàn cầu, tăng chi phí vận tải",
  },
  {
    keywords: ["war", "conflict", "geopolitical", "risk aversion", "safe haven"],
    domain: "gold_mining",
    direction: "up",
    confidence: 0.75,
    title: "Rủi ro địa chính trị — vàng tăng do nhu cầu trú ẩn (safe haven)",
  },

  // ── Taiwan / semiconductor ESCALATION ──────────────────────────────────────
  {
    keywords: [
      "taiwan strait", "taiwan military", "taiwan conflict", "taiwan invasion",
      "china taiwan", "tsmc disruption", "semiconductor supply", "taiwan blockade",
      "eo biển đài loan", "đài loan", "xung đột đài loan", "phong tỏa đài loan",
    ],
    domain: "tech",
    direction: "down",
    confidence: 0.80,
    title: "Căng thẳng eo biển Đài Loan — gián đoạn chuỗi cung ứng bán dẫn (bearish tech/FPT)",
  },
  {
    keywords: [
      "taiwan strait", "taiwan military", "taiwan conflict", "china taiwan",
      "tsmc disruption", "eo biển đài loan", "đài loan căng thẳng",
    ],
    domain: "securities",
    direction: "down",
    confidence: 0.75,
    title: "Căng thẳng Đài Loan — risk-off toàn cầu, dòng vốn rút khỏi thị trường mới nổi",
  },
  {
    keywords: [
      "taiwan strait", "taiwan military", "taiwan conflict", "tsmc disruption",
      "semiconductor supply", "eo biển đài loan", "đài loan",
    ],
    domain: "retail",
    direction: "down",
    confidence: 0.68,
    title: "Căng thẳng Đài Loan — chi phí linh kiện điện tử tăng, tác động bán lẻ điện máy",
  },

  // ── FDI / foreign investment ───────────────────────────────────────────────
  {
    keywords: ["fdi vietnam", "foreign investment vietnam", "đầu tư nước ngoài", "fdi tăng"],
    domain: "real_estate",
    direction: "up",
    confidence: 0.72,
    title: "FDI vào VN tăng — tích cực cho BĐS khu công nghiệp và đô thị",
  },
  {
    keywords: ["fdi vietnam", "foreign investment vietnam", "fdi tăng"],
    domain: "tech",
    direction: "up",
    confidence: 0.70,
    title: "FDI vào VN tăng — tích cực cho công nghệ (outsourcing, R&D centers)",
  },

  // ── Bond yields / treasury ─────────────────────────────────────────────────
  {
    keywords: ["treasury yield", "10-year yield", "bond yield", "government bond"],
    domain: "real_estate",
    direction: "down",
    confidence: 0.62,
    title: "Lợi suất trái phiếu tăng — tăng chi phí vốn, tiêu cực cho BĐS",
  },
  {
    keywords: ["treasury yield", "10-year yield", "bond yield rise"],
    domain: "banking",
    direction: "up",
    confidence: 0.58,
    title: "Lợi suất trái phiếu tăng — mở rộng biên lãi suất cho ngân hàng",
  },

  // ── Automotive / EV ────────────────────────────────────────────────────────
  {
    keywords: ["auto sales", "car sales", "automobile", "honda", "toyota", "ford", "ev sales", "electric vehicle"],
    domain: "automotive",
    direction: "neutral",
    confidence: 0.70,
    title: "Tin ngành ô tô — tác động trực tiếp đến VEAM (Honda/Toyota/Ford VN)",
  },

  // ── Pharma / healthcare ────────────────────────────────────────────────────
  {
    keywords: ["pharma", "healthcare", "drug approval", "dược phẩm", "y tế"],
    domain: "pharma",
    direction: "neutral",
    confidence: 0.60,
    title: "Tin ngành dược — tác động đến DHG, IMP, DMC",
  },

  // ── Insurance: natural disaster / catastrophe ──────────────────────────────
  {
    keywords: ["typhoon", "flood", "natural disaster", "bão", "lũ lụt", "thiên tai", "catastrophe"],
    domain: "insurance",
    direction: "down",
    confidence: 0.75,
    title: "Thiên tai — tăng chi trả bồi thường bảo hiểm (BVH, PVI)",
  },

  // ── Energy transition ──────────────────────────────────────────────────────
  {
    keywords: ["renewable energy", "solar", "wind power", "năng lượng tái tạo", "điện mặt trời", "điện gió"],
    domain: "utilities",
    direction: "up",
    confidence: 0.65,
    title: "Chuyển đổi năng lượng — tích cực cho REE, PC1, GEG (năng lượng sạch)",
  },
  // ── Utilities: coal price → thermal power COGS (FR-3, Task 1315a) ─────────
  // POW (Petrovietnam Power): coal ~60-70% fuel COGS. First utilities commodity-input rule.
  {
    keywords: [
      "giá than tăng",
      "than đá tăng giá",
      "chi phí than tăng",
      "giá than nhiệt điện tăng",
      "coal price rise",
      "coal price up",
      "thermal coal surge",
    ],
    domain: "utilities",
    direction: "down",
    confidence: 0.75,
    title: "Giá than tăng — chi phí nhiên liệu điện tăng (POW bị ảnh hưởng)",
  },
  // ── Utilities: gas price → gas-fired + city gas distribution COGS (FR-3) ──
  // HNG (Hà Nội Gas): city gas distribution — gas is primary input cost.
  {
    keywords: [
      "giá khí đốt tăng",
      "giá lng tăng",
      "giá khí tự nhiên tăng",
      "chi phí khí đốt tăng",
      "gas price rise",
      "lng price rise",
      "natural gas price up",
      "gas price surge",
    ],
    domain: "utilities",
    direction: "down",
    confidence: 0.70,
    title: "Giá khí đốt/LNG tăng — áp lực chi phí điện khí và phân phối khí (HNG)",
  },
  // ── Utilities: coal fall (FR-3) ───────────────────────────────────────────
  {
    keywords: [
      "giá than giảm",
      "than đá giảm giá",
      "coal price fall",
      "coal price down",
    ],
    domain: "utilities",
    direction: "up",
    confidence: 0.68,
    title: "Giá than giảm — giảm chi phí nhiên liệu, tích cực cho điện than (POW)",
  },
  // ── Utilities: gas fall (FR-3) ────────────────────────────────────────────
  {
    keywords: [
      "giá khí đốt giảm",
      "giá lng giảm",
      "lng price fall",
      "gas price fall",
    ],
    domain: "utilities",
    direction: "up",
    confidence: 0.65,
    title: "Giá khí đốt giảm — tích cực cho điện khí và phân phối khí (HNG)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPPLY_CHAIN_RULES (Sprint 041 — Task 255)
  // Shipping cost surges / port disruptions → logistics + steel + exporters
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Shipping cost surge → logistics (direct: GMD revenue up) ─────────────
  {
    keywords: ["shipping cost surge", "cước vận tải tăng", "bdi surge", "baltic dry", "freight cost rise", "shipping cost rise"],
    domain: "logistics",
    direction: "up",
    confidence: 0.78,
    title: "Cước vận tải tăng — tích cực cho logistics (GMD, PHP doanh thu tăng)",
  },
  // ── Shipping cost surge → steel (inverse: HPG import cost up) ────────────
  {
    keywords: ["shipping cost surge", "cước vận tải tăng", "bdi surge", "freight cost rise", "shipping cost rise"],
    domain: "steel",
    direction: "down",
    confidence: 0.75,
    title: "Cước vận tải tăng — tăng chi phí nhập phế liệu thép (HPG bị ảnh hưởng)",
  },
  // ── Shipping cost surge → consumer goods (inverse: export margins fall) ──
  {
    keywords: ["shipping cost surge", "cước vận tải tăng", "freight cost rise", "container rate surge"],
    domain: "retail",
    direction: "down",
    confidence: 0.68,
    title: "Cước vận tải tăng — giảm biên lợi nhuận xuất khẩu hàng tiêu dùng (VNM)",
  },
  // ── Port disruption → logistics (negative: congestion hurts efficiency) ──
  {
    keywords: ["port congestion", "tắc nghẽn cảng", "dock strike", "đình công cảng", "cảng tắc nghẽn"],
    domain: "logistics",
    direction: "down",
    confidence: 0.80,
    title: "Tắc nghẽn cảng — gián đoạn hoạt động logistics/vận tải (GMD, PHP)",
  },
  // ── Canal blockage → all export sectors ─────────────────────────────────
  {
    keywords: ["suez canal", "panama canal", "kênh suez", "kênh panama", "canal blockage"],
    domain: "steel",
    direction: "down",
    confidence: 0.82,
    title: "Tắc kênh đào — gián đoạn xuất nhập khẩu thép (HPG bị ảnh hưởng)",
  },
  {
    keywords: ["suez canal", "panama canal", "kênh suez", "kênh panama", "canal blockage"],
    domain: "agriculture",
    direction: "down",
    confidence: 0.78,
    title: "Tắc kênh đào — tăng chi phí/thời gian xuất khẩu nông sản (GVR, VNM)",
  },
  // ── Container shortage → exporters ───────────────────────────────────────
  {
    keywords: ["container shortage", "thiếu container", "container scarcity"],
    domain: "retail",
    direction: "down",
    confidence: 0.72,
    title: "Thiếu container — cản trở xuất khẩu hàng tiêu dùng (VNM xuất sữa)",
  },
  // ── Supply chain disruption — broad negative for import-dependent ─────────
  {
    keywords: ["supply chain disruption", "gián đoạn chuỗi cung ứng", "supply chain crisis"],
    domain: "steel",
    direction: "down",
    confidence: 0.70,
    title: "Gián đoạn chuỗi cung ứng — ảnh hưởng đến nguồn nguyên liệu nhập khẩu",
  },
  {
    keywords: ["supply chain disruption", "gián đoạn chuỗi cung ứng", "supply chain crisis"],
    domain: "logistics",
    direction: "neutral",
    confidence: 0.65,
    title: "Gián đoạn chuỗi cung ứng — tác động hỗn hợp cho logistics",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLIMATE_RULES (Sprint 042 — Task 261)
  // Weather events → sector/stock cascades
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Typhoon / Bão ─────────────────────────────────────────────────────────
  {
    keywords: ["bão số", "typhoon vietnam", "áp thấp nhiệt đới", "cơn bão mạnh", "bão đổ bộ"],
    domain: "insurance",
    direction: "down",
    confidence: 0.80,
    title: "Bão — tăng chi trả bồi thường bảo hiểm (BVH, PVI)",
  },
  {
    keywords: ["bão số", "typhoon vietnam", "bão đổ bộ", "bão lớn"],
    domain: "agriculture",
    direction: "down",
    confidence: 0.75,
    title: "Bão — thiệt hại ao nuôi tôm/cá và nông sản (MPC, ANV, VNM)",
  },

  // ── Drought / Hạn hán ─────────────────────────────────────────────────────
  {
    keywords: ["hạn hán nghiêm trọng", "thiếu nước hồ thủy điện", "mùa khô thiếu nước", "drought vietnam"],
    domain: "utilities",
    direction: "up",
    confidence: 0.75,
    title: "Hạn hán — thủy điện thiếu nước → nhu cầu solar/wind thay thế tăng (REE, GEG)",
  },
  {
    keywords: ["hạn hán nghiêm trọng", "hạn hán kéo dài", "thiếu nước ao nuôi", "drought vietnam"],
    domain: "agriculture",
    direction: "down",
    confidence: 0.70,
    title: "Hạn hán — thiếu nước ao nuôi, thiệt hại thủy sản và nông nghiệp (MPC, ANV)",
  },

  // ── Power shortage / Thiếu điện ───────────────────────────────────────────
  {
    keywords: ["thiếu điện nghiêm trọng", "cắt điện luân phiên", "power shortage vietnam"],
    domain: "real_estate",  // industrial parks (IDC, KBC) classified under real_estate
    direction: "down",
    confidence: 0.82,
    title: "Thiếu điện — khu công nghiệp bị cắt điện luân phiên, FDI lo ngại (IDC, KBC)",
  },
  {
    keywords: ["thiếu điện nghiêm trọng", "cắt điện luân phiên", "power shortage vietnam"],
    domain: "utilities",
    direction: "up",
    confidence: 0.78,
    title: "Thiếu điện — chính phủ đẩy mạnh năng lượng tái tạo khẩn cấp (REE, GEG)",
  },

  // ── Flood / Lũ lụt ───────────────────────────────────────────────────────
  {
    keywords: ["lũ lụt nghiêm trọng", "lũ lớn kéo dài", "flood vietnam"],
    domain: "insurance",
    direction: "down",
    confidence: 0.75,
    title: "Lũ lụt — tăng bồi thường bảo hiểm tài sản (BVH, PVI)",
  },

  // ── El Niño / La Niña ─────────────────────────────────────────────────────
  {
    keywords: ["el niño", "el nino", "hiện tượng el niño"],
    domain: "utilities",
    direction: "up",
    confidence: 0.72,
    title: "El Niño — hạn hán dài hạn, thủy điện giảm → cơ hội NLTT (REE, GEG)",
  },
  {
    keywords: ["la niña", "la nina", "hiện tượng la niña"],
    domain: "insurance",
    direction: "down",
    confidence: 0.68,
    title: "La Niña — gia tăng mưa lũ → rủi ro bồi thường bảo hiểm",
  },


  // ── CAPEX / Public Investment rules (task 250) ───────────────────────────
  // Task 1200: BEARISH "đầu tư công" rules — must appear BEFORE the bullish rule
  // so first-match-wins fires on negative context (cắt giảm, chậm trễ, đình trệ).
  {
    keywords: [
      "cắt giảm đầu tư công",
      "giảm đầu tư công",
      "đầu tư công bị cắt",
      "đầu tư công chậm trễ",
      "chậm trễ đầu tư công",
      "đình trệ đầu tư công",
      "đầu tư công đình trệ",
      "đầu tư công giảm",
      "vốn đầu tư công giảm",
      "public investment cut",
      "public investment decline",
      "capex cut",
      "infrastructure spending cut",
    ],
    domain: "construction",
    direction: "down",
    confidence: 0.80,
    title: "Cắt giảm/đình trệ đầu tư công — tiêu cực cho ngành xây dựng (CTD, HBC, LCG)",
  },
  {
    keywords: [
      "cắt giảm đầu tư công",
      "giảm đầu tư công",
      "đầu tư công chậm trễ",
      "đình trệ đầu tư công",
      "đầu tư công đình trệ",
      "đầu tư công giảm",
      "vốn đầu tư công giảm",
      "public investment cut",
      "infrastructure spending cut",
      "capex cut",
    ],
    domain: "steel",
    direction: "down",
    confidence: 0.75,
    title: "Cắt giảm đầu tư công — nhu cầu thép xây dựng giảm (HPG, NKG bị ảnh hưởng)",
  },
  {
    keywords: [
      "cao tốc", "đầu tư công", "giải ngân đầu tư", "hạ tầng giao thông",
      "sân bay long thành", "đường sắt", "xây cầu", "cầu đường bộ",
      "cầu vượt", "cầu cao tốc", "cảng biển", "capex",
      "public investment", "infrastructure investment",
    ],
    domain: "construction",
    direction: "up",
    confidence: 0.80,
    title: "Đầu tư công tăng — tích cực cho ngành xây dựng hạ tầng",
  },
  {
    keywords: [
      "năng lượng tái tạo", "điện mặt trời", "điện gió", "renewable energy",
      "solar farm", "wind power", "hệ thống điện", "nhà máy điện",
    ],
    domain: "energy",
    direction: "up",
    confidence: 0.75,
    title: "Đầu tư năng lượng tái tạo tăng — tích cực cho cổ phiếu điện",
  },

  // ── CREDIT / NHNN rules (task 250) ───────────────────────────────────────
  {
    keywords: [
      "nới room tín dụng bất động sản", "tín dụng bất động sản tăng",
      "room tín dụng bđs", "tín dụng bds tăng",
    ],
    domain: "real_estate",
    direction: "up",
    confidence: 0.80,
    title: "Nới room tín dụng BĐS — tích cực cho bất động sản",
  },
  {
    keywords: [
      "siết tín dụng bất động sản", "giảm room tín dụng bđs",
      "hạn chế tín dụng bất động sản", "siết tín dụng bds",
    ],
    domain: "real_estate",
    direction: "down",
    confidence: 0.80,
    title: "Siết tín dụng BĐS — tiêu cực cho bất động sản",
  },
  {
    keywords: [
      "tăng room tín dụng cho ngân hàng", "nới room tín dụng ngân hàng",
      "room tín dụng tăng", "tín dụng ngân hàng tăng trưởng",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.70,
    title: "Nới room tín dụng ngân hàng — hỗ trợ tăng trưởng cho vay",
  },

  // ── Cross-sector: aviation debt default → banking systemic risk ──────────
  {
    keywords: [
      "hàng không nợ", "nợ hàng không", "thu giữ tài sản", "tịch thu tài sản",
      "collateral seizure", "debt default airline", "airline debt",
      "bamboo airways nợ", "vietjet nợ", "seizing land", "thu hồi sổ đỏ",
      "nợ xấu hàng không", "bad debt airline", "airline collateral",
    ],
    domain: "banking",
    direction: "down",
    confidence: 0.72,
    title: "Nợ xấu hàng không → rủi ro hệ thống ngân hàng (tài sản thế chấp giảm giá trị)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHARMA_RULES (Sprint 044)
  // Pharmaceutical sector cascade rules
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Epidemic / outbreak → pharma demand surge ─────────────────────────────
  {
    keywords: [
      "dịch sốt xuất huyết",
      "dịch cúm",
      "cúm a",
      "bùng phát dịch",
      "dịch bệnh lây lan",
      "epidemic",
      "pandemic",
      "outbreak",
      "vaccine distribution demand",
      "nhu cầu thuốc",
      "nhu cầu vaccine",
    ],
    domain: "pharmaceutical",
    direction: "up",
    confidence: 0.75,
    title: "Dịch bệnh bùng phát — tích cực cho ngành dược phẩm",
  },
  // ── Drug price ceiling → pharma margin pressure ───────────────────────────
  {
    keywords: [
      "giá trần thuốc",
      "trần giá thuốc",
      "điều chỉnh trần giá thuốc",
      "price cap drug",
      "drug price ceiling",
      "drug price regulation",
    ],
    domain: "pharmaceutical",
    direction: "down",
    confidence: 0.80,
    title: "Quy định giá trần thuốc — tiêu cực cho biên lợi nhuận dược phẩm",
  },
  // ── Health budget increase → pharma revenue boost ─────────────────────────
  {
    keywords: [
      "tăng ngân sách mua thuốc",
      "tăng ngân sách y tế",
      "hospital budget increase",
      "tăng chi tiêu y tế",
      "health spending increase",
    ],
    domain: "pharmaceutical",
    direction: "up",
    confidence: 0.70,
    title: "Tăng ngân sách y tế — tích cực cho ngành dược phẩm và thiết bị y tế",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CHEMICALS_RULES (Task 1850e)
  // Chemicals/petrochemicals sector cascade rules (DGC, DPM)
  // Upstream: crude oil, natural gas prices
  // Downstream: fertilizer, plastic supply chains
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Crude oil price spike → chemicals input cost increase (BEARISH) ────────
  {
    keywords: [
      "giá dầu tăng",
      "oil price rise",
      "crude oil up",
      "giá dầu tăng mạnh",
      "crude oil surge",
      "oil rally",
      "dầu tăng giá",
    ],
    domain: "chemicals",
    direction: "down",
    confidence: 0.75,
    title: "Giá dầu tăng — tăng chi phí nguyên liệu hóa chất (input cost pressure)",
  },

  // ── Crude oil price fall → chemicals input cost decrease (BULLISH) ────────
  {
    keywords: [
      "giá dầu giảm",
      "oil price fall",
      "crude oil down",
      "oil crash",
      "oil slump",
      "dầu lao dốc",
      "crude oil decline",
      "oil tumble",
      "oil drop",
    ],
    domain: "chemicals",
    direction: "up",
    confidence: 0.75,
    title: "Giá dầu giảm — giảm chi phí nguyên liệu, tích cực cho hóa chất (cost relief)",
  },

  // ── Natural gas price surge → fertilizer cost increase (BEARISH) ──────────
  {
    keywords: [
      "giá khí đốt tăng",
      "natural gas price rise",
      "gas price spike",
      "khí đốt tăng giá",
      "natural gas surge",
      "gas rally",
      "giá gas tăng",
    ],
    domain: "chemicals",
    direction: "down",
    confidence: 0.72,
    title: "Giá khí đốt tăng — tăng chi phí phân bón & hóa chất (feedstock pressure)",
  },

  // ── Fertilizer price ceiling → margin compression (BEARISH) ───────────────
  {
    keywords: [
      "giá trần phân bón",
      "trần giá phân bón",
      "điều chỉnh giá phân bón",
      "fertilizer price cap",
      "phân bón giá trần",
      "hạn giá phân bón",
      "price regulation fertilizer",
    ],
    domain: "chemicals",
    direction: "down",
    confidence: 0.78,
    title: "Quy định giá trần phân bón — tiêu cực cho biên lợi nhuận hóa chất",
  },

  // ── Environmental regulation → compliance cost (BEARISH) ─────────────────
  {
    keywords: [
      "quy định môi trường hóa chất",
      "chemical emissions regulation",
      "environmental compliance",
      "quy định phát thải hóa chất",
      "tiêu chuẩn môi trường",
      "environmental standard",
      "pollution control chemical",
      "tiêu chuẩn phát thải",
    ],
    domain: "chemicals",
    direction: "down",
    confidence: 0.70,
    title: "Quy định môi trường — tăng chi phí tuân thủ hóa chất (compliance cost)",
  },

  // ── Supply chain disruption → supply crunch (BEARISH) ────────────────────
  {
    keywords: [
      "cắt nguồn cung hóa chất",
      "chemical supply disruption",
      "refinery shutdown",
      "nguồn cung hóa chất bị gián đoạn",
      "production halt",
      "supply chain disruption",
      "cung cấp hóa chất bị đình trệ",
      "feedstock shortage",
    ],
    domain: "chemicals",
    direction: "down",
    confidence: 0.73,
    title: "Gián đoạn chuỗi cung hóa chất — áp lực cung ứng tiêu cực (supply crunch)",
  },

  // ── Export support policy → demand boost (BULLISH) ───────────────────────
  {
    keywords: [
      "hỗ trợ xuất khẩu hóa chất",
      "chemical export support",
      "export promotion chemical",
      "xuất khẩu hóa chất tăng",
      "thỏa thuận thương mại hóa chất",
      "trade agreement chemical",
      "expand chemical exports",
      "hóa chất thị trường",
    ],
    domain: "chemicals",
    direction: "up",
    confidence: 0.72,
    title: "Hỗ trợ xuất khẩu hóa chất — tích cực cho nhu cầu & doanh thu (export boost)",
  },

  // ── Petrochemical project approval → expansion benefit (BULLISH) ─────────
  {
    keywords: [
      "dự án dầu khí mới",
      "petrochemical project approval",
      "new refinery",
      "chấp thuận dự án hóa dầu",
      "expansion plan chemical",
      "petrochemical facility",
      "dự án lọc dầu",
      "capacity expansion",
    ],
    domain: "chemicals",
    direction: "up",
    confidence: 0.71,
    title: "Phê duyệt dự án hóa dầu/khí — tích cực cho tăng trưởng dài hạn (capex benefit)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 1223 — VNDiamond index exclusion → ETF forced selling (BEARISH)
  // When a stock is excluded from VNDiamond, passive ETFs tracking that index
  // are forced to sell, creating systematic downward price pressure.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    keywords: [
      "bị loại khỏi vndiamond",
      "vndiamond loại",
      "rổ vndiamond",
      "loại khỏi vndiamond",
      "vndiamond exclusion",
      "vndiamond remove",
    ],
    domain: "securities",
    direction: "down",
    confidence: 0.78,
    title: "VNDiamond exclusion — ETF forced selling: quỹ thụ động buộc phải bán cổ phiếu bị loại (etf_forced_selling)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 1229 — Broader ETF / index rebalance rules
  // Any index rebalance removal → BEARISH (etf_forced_selling, confidence 0.75).
  // Any index addition → BULLISH (etf_inclusion, confidence 0.75).
  // VNDiamond-specific rules (Task 1223) take first-match-wins per domain;
  // these cover VN30/VN100/generic ETF rebalance events.
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Index inclusion → forced passive buying (BULLISH) ─────────────────────
  {
    keywords: [
      "được thêm vào vn30",
      "thêm vào vn30",
      "được thêm vào chỉ số",
      "thêm vào chỉ số",
      "được thêm vào rổ etf",
      "thêm vào rổ etf",
      "etf inclusion",
      "index inclusion",
      "được đưa vào rổ",
      "gia nhập chỉ số",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.75,
    title: "Index inclusion — ETF forced buying: cổ phiếu được thêm vào chỉ số hưởng dòng tiền thụ động (etf_inclusion)",
  },

  // ── Index removal → forced passive selling (BEARISH) ─────────────────────
  {
    keywords: [
      "bị loại khỏi vn30",
      "loại khỏi vn30",
      "bị loại khỏi vn100",
      "loại khỏi vn100",
      "loại khỏi chỉ số",
      "bị loại khỏi chỉ số",
      "cơ cấu lại rổ",
      "etf cơ cấu",
      "rebalance",
      "index rebalance",
      "quỹ etf loại",
      "loại khỏi rổ etf",
    ],
    domain: "securities",
    direction: "down",
    confidence: 0.75,
    title: "Index rebalance — ETF forced selling: cổ phiếu bị loại khỏi chỉ số chịu áp lực bán ròng (etf_forced_selling)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 1226 — FTSE/MSCI index upgrade → massive passive fund inflows (BULLISH)
  // Vietnam upgrade from Frontier to Emerging Market status triggers billions
  // in passive fund inflows, especially benefiting banking and large-cap stocks.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    keywords: [
      "ftse nâng hạng",
      "nâng hạng thị trường mới nổi",
      "emerging market",
      "ftse russell",
      "msci nâng hạng",
      "vietnam upgrade",
      "nâng hạng emerging",
      "frontier to emerging",
      "thị trường mới nổi",
      "vn nâng hạng",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.85,
    title: "FTSE/MSCI nâng hạng Việt Nam lên Emerging Market — dòng vốn thụ động khổng lồ, ngân hàng hưởng lợi trực tiếp (index_upgrade_inflow)",
  },
  {
    keywords: [
      "ftse nâng hạng",
      "nâng hạng thị trường mới nổi",
      "emerging market",
      "ftse russell",
      "msci nâng hạng",
      "vietnam upgrade",
      "nâng hạng emerging",
      "frontier to emerging",
      "thị trường mới nổi",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.82,
    title: "FTSE/MSCI nâng hạng — CTCK hưởng lợi từ thanh khoản tăng vọt và dòng vốn ngoại (index_upgrade_inflow)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 1237 — ETF/passive fund inflow articles → BULLISH cascade
  // Articles about capital inflows from passive/ETF funds following index events
  // were previously misclassified as NEUTRAL. These keywords signal direct
  // buying pressure from foreign passive fund flows.
  // ═══════════════════════════════════════════════════════════════════════════
  {
    keywords: [
      "dòng vốn etf",
      "quỹ etf đổ vào",
      "passive fund inflow",
      "fund flow vào vn",
      "dòng tiền etf",
      "etf mua ròng",
      "foreign fund inflow",
      "vốn etf vào",
      "khối ngoại mua ròng liên tiếp",
      "foreign passive fund",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.78,
    title: "Dòng vốn ETF/passive fund vào VN — thanh khoản tăng, hỗ trợ thị trường chứng khoán (passive_fund_inflow)",
  },
  {
    keywords: [
      "dòng vốn etf",
      "quỹ etf đổ vào",
      "passive fund inflow",
      "fund flow vào vn",
      "dòng tiền etf",
      "etf mua ròng",
      "foreign fund inflow",
      "vốn etf vào",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.72,
    title: "Dòng vốn ETF/passive fund — ngân hàng lớn (VCB, BID) hưởng lợi do chiếm tỷ trọng cao trong chỉ số (passive_fund_inflow)",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Task 1255 — Retail net-buying at scale → securities sector BULLISH
  //
  // "Nhà đầu tư cá nhân mua ròng" at large VND amounts (>1,000 tỷ) is a
  // direct revenue signal for brokerages: higher retail activity → higher
  // commission income for SSI/VCI/VIX/VND/HCM.
  //
  // Previously: article classified bullish impact 9 but no alert generated
  // for securities sector (bug 1261 from unified-agent 2026-04-14).
  // ═══════════════════════════════════════════════════════════════════════════
  {
    keywords: [
      "nhà đầu tư cá nhân mua ròng",
      "cá nhân mua ròng",
      "retail mua ròng",
      "nhà đầu tư cá nhân tăng mua",
      "thanh khoản thị trường tăng",
      "khối cá nhân mua ròng",
      "nhà đầu tư nội mua ròng",
      "dòng tiền cá nhân vào",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.78,
    title: "Nhà đầu tư cá nhân mua ròng quy mô lớn — phí môi giới CTCK (SSI/VCI/VIX/VND) tăng; VCB/BID/CTG/ACB hưởng lợi từ thanh khoản tăng (retail_netbuy_securities)",
    affected_actions: [
      { code: "VCB", direction: "up" },
      { code: "BID", direction: "up" },
      { code: "CTG", direction: "up" },
      { code: "ACB", direction: "up" },
    ],
  },
  {
    keywords: [
      "nhà đầu tư cá nhân mua ròng",
      "cá nhân mua ròng",
      "retail mua ròng",
      "nhà đầu tư cá nhân tăng mua",
      "thanh khoản thị trường tăng",
      "khối cá nhân mua ròng",
      "nhà đầu tư nội mua ròng",
      "dòng tiền cá nhân vào",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.62,
    title: "Nhà đầu tư cá nhân mua ròng — thanh khoản tăng hỗ trợ hoạt động ngân hàng (retail_netbuy_banking)",
  },
  // ── FR-1: VPBankS/OKX → VPB (parent) + TCB (peer) BULLISH (Sprint 1335) ──
  // Must come BEFORE FR-3 — first-match-wins. vpbanks+okx article hits FR-1 first.
  {
    keywords: [
      "vpbanks",
      "vp bank securities",
      "vpbank securities",
      "tăng vốn vpbanks",
      "vpbanks tăng vốn",
      "vpbanks.*okx",
      "okx.*vpbanks",
    ],
    domain: "banking",
    direction: "up",
    confidence: 0.88,
    requireAnyKeyword: [
      "tăng vốn",
      "vốn",
      "hợp tác",
      "partnership",
      "okx",
      "crypto",
      "digital asset",
      "tài sản số",
    ],
    title:
      "VPBankS tăng vốn/hợp tác OKX — VPB (công ty mẹ) và TCB (chiến lược tương đồng) hưởng lợi trực tiếp",
    affected_actions: [
      { code: "VPB", direction: "up" },
      { code: "TCB", direction: "up" },
    ],
  },
  // ── FR-3: banking NEUTRAL for crypto/digital-asset headlines (Sprint 1335) ──
  // Comes AFTER FR-1 — pure okx-only/generic crypto articles land here (no vpbanks keyword).
  // Bug 1315: affected_actions added — VCB/BID/EIB/HDB have no digital-asset strategy and
  // face competitive pressure from VPBankS/OKX → bearish (direction: "down").
  {
    keywords: [
      "okx",
      "crypto custody",
      "lưu ký tài sản số",
      "tài sản số vietnam",
      "sàn tiền mã hóa",
    ],
    domain: "banking",
    direction: "neutral",
    confidence: 0.65,
    title:
      "Crypto partnership/lưu ký tài sản số — ngân hàng truyền thống không có chiến lược digital-asset: tác động trung lập",
    affected_actions: [
      { code: "VCB", direction: "down" },
      { code: "BID", direction: "down" },
      { code: "EIB", direction: "down" },
      { code: "HDB", direction: "down" },
    ],
  },
  // ── FR-2: crypto/digital-asset custody → securities brokers BULLISH (Sprint 1335) ──
  {
    keywords: [
      "okx",
      "crypto custody",
      "lưu ký tài sản số",
      "tài sản số",
      "digital asset vietnam",
      "tiền mã hóa hợp pháp",
      "crypto hợp pháp",
      "sàn tiền mã hóa",
      "hợp tác crypto",
      "crypto partnership",
      "tài sản kỹ thuật số",
      "lưu ký crypto",
    ],
    domain: "securities",
    direction: "up",
    confidence: 0.72,
    requireAnyKeyword: [
      "chứng khoán",
      "securities",
      "vpbanks",
      "môi giới",
      "broker",
      "lưu ký",
      "custody",
    ],
    title:
      "Hợp tác crypto/lưu ký tài sản số — tín hiệu cạnh tranh/cơ hội mới cho CTCK (SSI/VCI/VIX/VND)",
    affected_actions: [
      { code: "SSI", direction: "up" },
      { code: "VCI", direction: "up" },
      { code: "VIX", direction: "up" },
      { code: "VND", direction: "up" },
    ],
  },
  // ── BK-1: Brokerage-outlook → securities sector bearish (Bug 1314) ──────────
  // CEO/analyst outlooks on brokerage sector, VPBankS competitive pressure, and
  // brokerage commission/margin compression signals cascade to securities domain.
  // Keywords use NFD-stripped Vietnamese so pattern matching is diacritic-agnostic.
  // Domain: "securities" — does not trigger banking (brokerage-only scope).
  {
    keywords: [
      "triển vọng ngành môi giới",
      "trien vong nganh moi gioi",
      "triển vọng môi giới chứng khoán",
      "trien vong moi gioi chung khoan",
      "áp lực cạnh tranh môi giới",
      "ap luc canh tranh moi gioi",
      "brokerage outlook",
      "brokerage competitive pressure",
      "phí môi giới giảm",
      "phi moi gioi giam",
      "cạnh tranh môi giới",
      "canh tranh moi gioi",
    ],
    domain: "securities",
    direction: "down",
    confidence: 0.72,
    title:
      "Triển vọng ngành môi giới chịu áp lực — CTCK truyền thống (SSI/VCI/VIX/VND) bị ảnh hưởng cạnh tranh từ VPBankS/OKX",
    affected_actions: [
      { code: "SSI", direction: "down" },
      { code: "VCI", direction: "down" },
      { code: "VIX", direction: "down" },
      { code: "VND", direction: "down" },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Helper functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map ImpactDirection to Sentiment.
 */
function direction2sentiment(dir: ImpactDirection): Sentiment {
  if (dir === "up") return "bullish";
  if (dir === "down") return "bearish";
  return "neutral";
}

/**
 * Find the first matching keyword from a list in text.
 * Returns the matched keyword or null.
 */
function findKeyword(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Market-wide detection helper (Task 162)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns true when the article text and metadata indicate a market-wide event.
 *
 * An article is market-wide if ANY of the following:
 *   (a) Contains "vn-index"
 *   (b) Contains ("toan thi truong" OR "thi truong chung khoan") AND at least
 *       one price/movement token ("giam", "tang", "mat diem", "diem", "%")
 *   (c) seedEntry.level is "country" or "global" AND impactScore >= minImpact
 *
 * All string comparisons use NFD-normalised, lowercased text.
 * Private — not exported.
 *
 * @param seedTextLower - Article title+summary, lowercased before calling
 * @param level         - AnalysisLevel of the seed entry
 * @param impactScore   - impactScore of the seed entry
 * @param minImpact     - Minimum impact score threshold for criteria (c)
 */
function isMarketWide(
  seedTextLower: string,
  level: AnalysisLevel,
  impactScore: number,
  minImpact: number,
): boolean {
  // Apply NFD normalisation to strip Vietnamese diacritics for substring matching.
  // Sources may emit text with or without diacritics; NFD strip gives uniform comparison.
  const normText = seedTextLower
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  // (a) VN-Index mention
  if (normText.includes("vn-index")) return true;

  // (b) Broad market vocabulary + price movement token
  const broadMarket =
    normText.includes("toan thi truong") ||
    normText.includes("thi truong chung khoan");
  if (broadMarket) {
    const hasMovement =
      normText.includes("giam") ||
      normText.includes("tang") ||
      normText.includes("mat diem") ||
      normText.includes("diem") ||
      normText.includes("%");
    if (hasMovement) return true;
  }

  // (c) Country or global level with sufficient impact
  if ((level === "country" || level === "global") && impactScore >= minImpact) {
    return true;
  }

  // (d) Analyst / CEO bearish market-warning pattern.
  // "điều chỉnh sâu", "rất sâu và đau", "cảnh báo nhà đầu tư" are analyst-sourced
  // bearish market warnings that must broadcast regardless of impactScore threshold.
  // Note: NFD strips combining diacritics but NOT the d-with-stroke (đ, U+0111),
  // which is a precomposed base character with no Unicode decomposition.
  // Patterns use đ directly to match the NFD-normalised text.
  // Bug 1314: brokerage-outlook patterns added — CEO/analyst warnings about brokerage
  // sector competitive pressure must also bypass impactScore gate (same logic as above).
  const ANALYST_WARNING_PATTERNS = [
    "đieu chinh sau",          // điều chỉnh sâu — deep correction
    "rat sau va đau",          // rất sâu và đau — very deep and painful
    "canh bao nha đau tu",     // cảnh báo nhà đầu tư — investor warning
    "trien vong nganh moi gioi",   // triển vọng ngành môi giới — brokerage sector outlook
    "ap luc canh tranh moi gioi",  // áp lực cạnh tranh môi giới — brokerage competitive pressure
    "canh tranh moi gioi",         // cạnh tranh môi giới — brokerage competition
  ];
  if (ANALYST_WARNING_PATTERNS.some((p) => normText.includes(p))) return true;

  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// Legal Risk + Policy cascade rules (Task 244)
// ═══════════════════════════════════════════════════════════════════════════

/** Simplified cascade rule for legal risk and policy events. */
export interface CascadeKeywordRule {
  /** Machine-readable rule identifier */
  key: string;
  /** Vietnamese keyword that triggers this rule */
  keyword: string;
  /** Affected sector (DomainType as string) */
  sector: string;
  /** Optional: Impact type for weather cascades (rainfall, drought, storm, cold_snap) */
  impactType?: string;
}

/**
 * Legal risk cascade rules: news with these keywords → sector-level impact.
 */
export const LEGAL_RISK_RULES: CascadeKeywordRule[] = [
  { key: "prosecution_banking", keyword: "khởi tố", sector: "banking" },
  { key: "prosecution_realestate", keyword: "khởi tố", sector: "real_estate" },
  { key: "asset_freeze_realestate", keyword: "phong tỏa tài sản", sector: "real_estate" },
  { key: "asset_freeze_banking", keyword: "kê biên", sector: "banking" },
  { key: "tax_penalty_all", keyword: "truy thu thuế", sector: "other" },
  { key: "license_revocation_realestate", keyword: "thu hồi giấy phép", sector: "real_estate" },
  { key: "anti_dumping_steel", keyword: "chống bán phá giá", sector: "steel" },
  { key: "anti_dumping_agriculture", keyword: "anti-dumping", sector: "agriculture" },
  { key: "investigation_securities", keyword: "điều tra", sector: "securities" },
  { key: "administrative_penalty", keyword: "xử phạt hành chính", sector: "other" },
];

/**
 * Policy cascade rules: government policy keywords → sector-level impact.
 */
export const POLICY_RULES: CascadeKeywordRule[] = [
  { key: "credit_room_banking", keyword: "room tín dụng", sector: "banking" },
  { key: "interest_rate_banking", keyword: "lãi suất điều hành", sector: "banking" },
  { key: "tax_ttdb_automotive", keyword: "thuế TTĐB", sector: "automotive" },
  { key: "industrial_zone_dev", keyword: "khu công nghiệp", sector: "other" },
  { key: "energy_policy_utilities", keyword: "quy hoạch điện", sector: "utilities" },
  { key: "fit_utilities", keyword: "FIT", sector: "utilities" },
  { key: "realestate_credit_tighten", keyword: "siết tín dụng BĐS", sector: "real_estate" },
  { key: "land_law_realestate", keyword: "luật đất đai", sector: "real_estate" },
  { key: "fta_steel", keyword: "FTA", sector: "steel" },
  { key: "exchange_rate_banking", keyword: "tỷ giá", sector: "banking" },
  { key: "monetary_policy_banking", keyword: "dự trữ bắt buộc", sector: "banking" },
  // Task 1004 — VN stabilization + systemic stress additions
  { key: "sbv_rate_cut_banking", keyword: "hạ lãi suất điều hành", sector: "banking" },
  { key: "sbv_rate_cut_securities", keyword: "nhnn hạ lãi suất", sector: "securities" },
  { key: "fiscal_stimulus_securities", keyword: "gói kích thích tài khóa", sector: "securities" },
  { key: "scic_intervention", keyword: "scic mua vào cổ phiếu", sector: "securities" },
  { key: "systemic_npl_banking", keyword: "nợ xấu hệ thống vượt", sector: "banking" },
  { key: "bank_liquidity_crisis", keyword: "khủng hoảng thanh khoản ngân hàng", sector: "banking" },
  { key: "interbank_rate_spike", keyword: "lãi suất liên ngân hàng tăng đột biến", sector: "banking" },
  { key: "soe_equitisation", keyword: "cổ phần hóa doanh nghiệp nhà nước", sector: "securities" },
  { key: "open_market_operations", keyword: "nghiệp vụ thị trường mở", sector: "banking" },
  { key: "fiscal_capex_emergency", keyword: "tăng đầu tư công khẩn cấp", sector: "construction" },
];

/**
 * Insider dump cascade rules: CEO/leadership exit selling (xả hàng, bán sạch, thoái sạch)
 * signals systemic banking sector distress.
 *
 * Business logic:
 *   - Insider dumps represent loss of leadership confidence in company fundamentals
 *   - In banking sector (VN's systemic hub), confidence loss at one bank cascades
 *     to peer banks via deposit flight + investor reputational contagion
 *   - Rule fires when:
 *       1. News contains insider dump keyword (already classified BEARISH in sentimentClassifier.ts)
 *       2. Original stock is banking sector
 *       3. Confidence threshold >0.6 (insider action is unambiguous)
 *
 * Peer impact: Generate HIGH-severity alerts on PEER banking stocks (not original).
 *
 * Why this pattern? (same as LEGAL_RISK_RULES)
 *   - Mirrors existing legal/policy keyword-based cascade rules
 *   - Pure domain function, no I/O, testable in isolation
 *   - Flexible: can extend to other sectors (e.g., retail founder exit → consumer contagion)
 *
 * Task 1272: Sentiment classification (keywords added)
 * Task 1278: Cascade rule + peer alert generation (this task)
 */
export const INSIDER_DUMP_RULES: CascadeKeywordRule[] = [
  { key: "insider_dump_banking_peers", keyword: "xả hàng", sector: "banking" },
  { key: "insider_dump_banking_peers", keyword: "bán sạch", sector: "banking" },
  { key: "insider_dump_banking_peers", keyword: "thoái sạch", sector: "banking" },
];

/**
 * MSCI inclusion cascade rules: News about MSCI index inclusion eligibility.
 *
 * Business logic:
 *   - MSCI index inclusion is a major bullish catalyst (proven multi-quarter price impact)
 *   - Affects large-cap stocks across all sectors (cross-sector, not sector-specific)
 *   - Keywords: "nộp danh sách" (submit list), "đáp ứng tiêu chí" (meet criteria), "chỉ số msci" (MSCI index)
 *   - Targets "all_largecp" pseudo-sector (application layer filters watchlist to large-cap only)
 *
 * Contrast with INSIDER_DUMP_RULES:
 *   - Insider dump: bearish, sector-specific (banking), peer contagion
 *   - MSCI inclusion: bullish, cross-sector, large-cap specific (no peer cascade)
 *
 * Task 1279: MSCI inclusion cascade detection + application integration
 */
export const MSCI_INCLUSION_RULES: CascadeKeywordRule[] = [
  { key: "msci_large_cap_1", keyword: "nộp danh sách", sector: "all_largecp" },
  { key: "msci_large_cap_2", keyword: "đáp ứng tiêu chí", sector: "all_largecp" },
  { key: "msci_large_cap_3", keyword: "chỉ số msci", sector: "all_largecp" },
];

/**
 * MSCI watchlist cascade rules: News about Vietnam being added to MSCI watchlist.
 *
 * Business logic:
 *   - MSCI watchlist (precursor step) = early signal for potential full inclusion
 *   - Triggers passive fund allocation planning before formal inclusion decision
 *   - Keywords: "danh sách theo dõi msci" (watchlist), "watchlist", "xem xét nâng hạng" (consider upgrade)
 *   - Targets large-cap stocks (all_largecp pseudo-sector)
 *
 * Task 1329: MSCI watchlist cascade rules
 */
export const MSCI_WATCHLIST_RULES: CascadeKeywordRule[] = [
  { key: "msci_watchlist_1", keyword: "danh sách theo dõi msci", sector: "all_largecp" },
  { key: "msci_watchlist_2", keyword: "msci watchlist", sector: "all_largecp" },
  { key: "msci_watchlist_3", keyword: "xem xét nâng hạng msci", sector: "all_largecp" },
];

/**
 * MSCI exclusion cascade rules: News about Vietnam being removed from MSCI index.
 *
 * Business logic:
 *   - MSCI exclusion = forced selling, large passive fund outflows
 *   - Negative catalyst for all stocks, especially large-caps with heavy foreign ownership
 *   - Keywords: "loại khỏi msci" (removed), "msci loại việt nam" (MSCI removes Vietnam), "bị xóa khỏi" (deleted from)
 *   - Targets large-cap stocks (all_largecp pseudo-sector)
 *   - Direction: bearish (opposite of inclusion)
 *
 * Task 1329: MSCI exclusion cascade rules
 */
export const MSCI_EXCLUSION_RULES: CascadeKeywordRule[] = [
  { key: "msci_exclusion_1", keyword: "loại khỏi msci", sector: "all_largecp" },
  { key: "msci_exclusion_2", keyword: "msci loại việt nam", sector: "all_largecp" },
  { key: "msci_exclusion_3", keyword: "bị xóa khỏi chỉ số", sector: "all_largecp" },
];

/**
 * Agriculture weather cascade rules: Rainfall, drought, storm, cold snap events
 * trigger alerts to agriculture-domain stocks.
 *
 * Business logic:
 *   - Rainfall events: positive for aquaculture (QNT, ANV, MPC), neutral/negative for land crops
 *   - Drought events: negative for all agriculture (lower yields, higher input costs)
 *   - Storm events: negative for agriculture (structural damage, lost harvests)
 *   - Cold snap: negative for tropical crops, risk of animal loss
 *
 * Keywords are detected by agricultureDetector.ts; rules define severity + sector mapping.
 * Application layer (cascadeExecutor) filters watchlist to agriculture-domain stocks only.
 *
 * Task 1281: Agriculture weather cascade detection + application integration
 */
export const AGRICULTURE_WEATHER_RULES: CascadeKeywordRule[] = [
  // Rainfall rules (3 keywords → positive for aquaculture, neutral/negative for land crops)
  { key: "rainfall_heavy_vn", keyword: "mưa lớn", sector: "agriculture", impactType: "rainfall" },
  { key: "rainfall_continuous_vn", keyword: "mưa kiên kéo", sector: "agriculture", impactType: "rainfall" },
  { key: "flooding_vn", keyword: "lũ lụt", sector: "agriculture", impactType: "rainfall" },
  { key: "flooding_submersion_vn", keyword: "ngập lụt", sector: "agriculture", impactType: "rainfall" },

  // Drought rules (3 keywords → negative for all agriculture)
  { key: "drought_long_term_vn", keyword: "hạn hán", sector: "agriculture", impactType: "drought" },
  { key: "drought_water_shortage_vn", keyword: "thiếu nước", sector: "agriculture", impactType: "drought" },
  { key: "drought_dry_impact_vn", keyword: "khô hạn", sector: "agriculture", impactType: "drought" },

  // Storm rules (2 keywords → negative for agriculture)
  { key: "storm_typhoon_vn", keyword: "bão", sector: "agriculture", impactType: "storm" },
  { key: "storm_wind_damage_vn", keyword: "thiệt hại bão", sector: "agriculture", impactType: "storm" },

  // Cold snap rules (2 keywords → negative for tropical crops)
  { key: "cold_snap_strong_vn", keyword: "rét đậm", sector: "agriculture", impactType: "cold_snap" },
  { key: "cold_snap_siberia_vn", keyword: "gió lạnh siberia", sector: "agriculture", impactType: "cold_snap" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Task 1004 — Policy intervention combo detection
// ─────────────────────────────────────────────────────────────────────────────

const POLICY_INTERVENTION_CATEGORIES: Array<{ key: string; keywords: string[] }> = [
  {
    key: "sbv_rate",
    keywords: [
      "nhnn hạ lãi suất", "hạ lãi suất điều hành", "giảm lãi suất điều hành",
      "sbv rate cut", "cắt giảm lãi suất điều hành",
    ],
  },
  {
    key: "fiscal_stimulus",
    keywords: [
      "gói kích thích tài khóa", "bộ tài chính bơm tiền", "gói phục hồi kinh tế",
      "giải ngân đầu tư công khẩn cấp", "fiscal stimulus vietnam",
    ],
  },
  {
    key: "credit_room_expansion",
    keywords: [
      "nới room tín dụng", "tăng room tín dụng cho ngân hàng",
      "tín dụng ngân hàng tăng trưởng", "room tín dụng tăng",
    ],
  },
  {
    key: "market_stabilization",
    keywords: [
      "quỹ bình ổn", "bình ổn thị trường", "scic mua vào cổ phiếu",
      "stabilization fund", "nhnn mua trái phiếu chính phủ",
      "nghiệp vụ thị trường mở", "chính phủ hỗ trợ thị trường",
    ],
  },
  {
    key: "forex_intervention",
    keywords: [
      "nhnn bán ngoại tệ", "sbv fx intervention", "bán ngoại tệ bình ổn tỷ giá",
      "can thiệp tỷ giá",
    ],
  },
];

/**
 * Count how many distinct policy-intervention categories are present in the
 * seed text. Returns a confidence boost multiplier:
 *
 *   0–1 category  → 1.00 (no combo boost)
 *   2 categories  → 1.10 (+10% confidence on banking/securities domain entries)
 *   3+ categories → 1.18 (+18% — systemic policy response, rare event)
 *
 * Pure function: no I/O, no side effects.
 */
export function detectPolicyInterventionCombo(textLower: string): {
  matchedCategories: string[];
  multiplier: number;
} {
  const matched: string[] = [];

  for (const cat of POLICY_INTERVENTION_CATEGORIES) {
    if (cat.keywords.some((kw) => textLower.includes(kw))) {
      matched.push(cat.key);
    }
  }

  let multiplier = 1.0;
  if (matched.length >= 3) multiplier = 1.18;
  else if (matched.length === 2) multiplier = 1.10;

  return { matchedCategories: matched, multiplier };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main exported function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FIX NER-PLACE-1 — Vietnamese place-prefix detector for direct-code ticker NER.
 *
 * An all-caps token can collide with a watchlist ticker while actually being a
 * geographic reference: "TP HCM" / "TP.HCM" / "Thành phố HCM" all denote Ho Chi
 * Minh City, not the broker ticker HCM. Returns true when the token ending just
 * before `idx` (the start of the matched ticker) is a Vietnamese place prefix.
 *
 * Data-light + generalized (covers any ticker that follows a place prefix, not a
 * hardcoded HCM case). Diacritic-tolerant and case-insensitive: we strip
 * Unicode combining marks before comparing, so "Thành phố" → "thanh pho".
 *
 * Recognised prefixes (after stripping trailing punctuation `.`):
 *   - "tp"        → TP, TP., Tp., and the joined form "TP.HCM" (the "tp." token)
 *   - "t.p"       → T.P
 *   - "thanh pho" → Thành phố / thanh pho (two-word prefix)
 *   - "tinh"      → tỉnh (province)
 */
const PLACE_PREFIX_SINGLE = new Set(["tp", "t.p", "tinh"]);

function stripDiacriticsLower(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function isPrecededByPlacePrefix(text: string, idx: number): boolean {
  // Slice everything before the match, drop a trailing run of separators
  // (spaces / "." that glue the joined "TP.HCM" form), then inspect the
  // immediately-preceding token(s).
  const before = text.slice(0, idx).replace(/[\s.]+$/u, "");
  if (before.length === 0) return false;

  // Tokenise the tail on whitespace; keep the last up-to-two tokens so we can
  // match the two-word "thành phố" prefix as well as single-word prefixes.
  const tokens = before.split(/\s+/u);
  const last = stripDiacriticsLower(tokens[tokens.length - 1] ?? "");

  // Single-token prefixes: "tp", "tp." (→ "tp" after trailing-dot strip on the
  // glue above leaves "...tp"), "t.p", "tinh". Strip a trailing dot on the token
  // itself too (e.g. "Tp." → "tp.").
  const lastNoDot = last.replace(/\.+$/u, "");
  if (PLACE_PREFIX_SINGLE.has(lastNoDot)) return true;

  // Two-token prefix: "thanh pho".
  if (tokens.length >= 2) {
    const prev = stripDiacriticsLower(tokens[tokens.length - 2] ?? "");
    if (prev === "thanh" && lastNoDot === "pho") return true;
  }

  return false;
}

/**
 * Build a causal chain from a seed AnalysisEntry.
 *
 * Traces global/country macro events down to specific Vietnamese stocks
 * in the watchlist via sector impact rules.
 *
 * Pure function — synchronous, no I/O, no side effects.
 *
 * @param seedEntry    - Normalized news entry (from normalizeNews or pre-built)
 * @param watchlist    - User's stock watchlist
 * @param ragResults   - Pre-fetched historical context (optional, injected by app layer)
 * @param macroContext - Real-time macro indicators for confidence adjustments (optional).
 *                       When omitted or null, behavior is identical to pre-Sprint-008.
 * @param broadcastMinImpact - Minimum impactScore required to trigger market-wide broadcast.
 *                             Default: 6. Market-wide events (e.g. "VN-Index drops 5%")
 *                             cascade to ALL watchlist stocks not already covered by domain rules.
 * @returns                  - CausalChain with all levels: seed → domain → action
 */
export function buildCausalChain(
  seedEntry: AnalysisEntry,
  watchlist: WatchlistEntry[],
  ragResults?: SearchResult[],
  macroContext?: MacroContext | null,
  macroStats?: MacroStats[],
  broadcastMinImpact?: number,
): CausalChain {
  const chainId = `chain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const summaryLower = seedEntry.summary.toLowerCase();

  // ── Step 1: Seed entry → first chain entry ────────────────────────────
  const seedChainEntry: CausalChainEntry = {
    level: seedEntry.level,
    title: seedEntry.sourceTitle,
    summary: seedEntry.summary,
    affectedDomains: seedEntry.affectedDomains,
    affectedActions: seedEntry.affectedActions,
    sentiment: seedEntry.sentiment,
    impactScore: seedEntry.impactScore,
    confidence: seedEntry.confidence,
    reasoning: seedEntry.reasoning,
  };

  const entries: CausalChainEntry[] = [seedChainEntry];

  // ── Step 2: Domain entries from SECTOR_RULES ──────────────────────────
  // Classify sentiment from seed summary before building domain entries.
  // This allows directional adjustment of confidence per rule.
  const seedSentimentResult = classifySentiment(seedEntry.summary);
  const seedSentimentDirection = seedSentimentResult.direction; // 'bullish' | 'bearish' | 'neutral'

  // Group by domain — keep only the first matching rule per domain.
  const triggeredDomains = new Map<DomainType, { rule: SectorRule; matchedKeyword: string }>();

  for (const rule of SECTOR_RULES) {
    if (triggeredDomains.has(rule.domain)) continue; // first match wins
    const matchedKeyword = findKeyword(summaryLower, rule.keywords);
    if (matchedKeyword !== null) {
      // FIX-1298/1299: excludeKeywords guard — skip rule if any exclusion term present
      if (rule.excludeKeywords && findKeyword(summaryLower, rule.excludeKeywords) !== null) {
        continue;
      }
      // FIX-1298/1299: requireAnyKeyword guard — skip rule unless at least one co-occurrence term present
      if (rule.requireAnyKeyword && findKeyword(summaryLower, rule.requireAnyKeyword) === null) {
        continue;
      }
      triggeredDomains.set(rule.domain, { rule, matchedKeyword });
    }
  }

  // Also add domains from seedEntry.affectedDomains not already covered by rules
  const uncoveredDomains = seedEntry.affectedDomains.filter(
    (d) => !triggeredDomains.has(d),
  );

  // Build domain-level CausalChainEntries
  const domainEntryMap = new Map<DomainType, CausalChainEntry>();

  // From SECTOR_RULES matches
  for (const [domain, { rule, matchedKeyword }] of triggeredDomains) {
    // Sentiment-direction alignment check:
    //   - rule.direction "up"   ↔ seedSentiment "bullish"  → matching   → +0.05
    //   - rule.direction "down" ↔ seedSentiment "bearish"  → matching   → +0.05
    //   - opposing direction                                → contradicting → -0.10
    //   - rule.direction "neutral" or seedSentiment "neutral" → no adjustment
    let sentimentAdjustment = 0;
    let sentimentNote = "";
    if (seedSentimentDirection !== "neutral" && rule.direction !== "neutral") {
      const ruleIsBullish = rule.direction === "up";
      const seedIsBullish = seedSentimentDirection === "bullish";
      if (ruleIsBullish === seedIsBullish) {
        sentimentAdjustment = +0.05;
        sentimentNote = ` [Sentiment: matches rule direction (${rule.direction}) → +0.05]`;
      } else {
        sentimentAdjustment = -0.10;
        sentimentNote = ` [Sentiment: contradicts rule direction (${rule.direction}) → -0.10]`;
      }
    }

    const adjustedConfidence = Math.min(0.99, Math.max(0.05, rule.confidence + sentimentAdjustment));

    // Derive the effective sentiment from the rule direction, combining with
    // the seed classifier result. For inverse relationships (e.g., oil up → aviation down),
    // the domain sentiment should INVERT the seed sentiment, not inherit it.
    let effectiveSentiment: Sentiment = direction2sentiment(rule.direction);
    if (
      seedSentimentResult.confidence >= 0.6 &&
      seedSentimentDirection !== "neutral"
    ) {
      // If rule direction matches seed direction → keep seed sentiment
      // If rule direction opposes seed direction → invert seed sentiment
      const ruleIsBullish = rule.direction === "up";
      const seedIsBullish = seedSentimentDirection === "bullish";
      if (ruleIsBullish === seedIsBullish) {
        effectiveSentiment = seedSentimentDirection;
      } else {
        // Invert: bullish seed + down rule → bearish domain
        effectiveSentiment = seedIsBullish ? "bearish" : "bullish";
      }
    }

    const domainEntry: CausalChainEntry = {
      level: "domain",
      title: rule.title,
      summary: `${rule.title}. Seed: "${seedEntry.sourceTitle}"`,
      affectedDomains: [domain],
      affectedActions: [],
      sentiment: effectiveSentiment,
      impactScore: Math.round(seedEntry.impactScore * adjustedConfidence),
      confidence: adjustedConfidence,
      reasoning: `Keyword match: "${matchedKeyword}". Domain ${domain} expected to move ${rule.direction}.${sentimentNote}`,
    };
    entries.push(domainEntry);
    domainEntryMap.set(domain, domainEntry);
  }

  // From seedEntry.affectedDomains not covered by SECTOR_RULES (default confidence 0.55)
  for (const domain of uncoveredDomains) {
    const domainEntry: CausalChainEntry = {
      level: "domain",
      title: `Ngành ${domain} — tác động từ sự kiện nguồn`,
      summary: `Ngành ${domain} bị ảnh hưởng bởi: "${seedEntry.sourceTitle}"`,
      affectedDomains: [domain],
      affectedActions: [],
      sentiment: seedEntry.sentiment,
      impactScore: Math.round(seedEntry.impactScore * 0.55),
      confidence: 0.55,
      reasoning: `Domain ${domain} detected from seed entry affectedDomains. Default confidence applied.`,
    };
    entries.push(domainEntry);
    domainEntryMap.set(domain, domainEntry);
  }

  // ── Step 2b: Apply macro adjustments to domain entries ───────────────
  // Only runs when macroContext is provided and non-null.
  // Modifies domain entries in-place; adjusts confidence + annotates reasoning.
  if (macroContext != null) {
    applyMacroAdjustments(entries, macroContext);
  }

  // ── Step 2c: Apply σ-based dynamic adjustments (when stats available) ──
  if (macroStats && macroStats.length > 0) {
    applyDynamicMacroAdjustments(entries, macroStats);
  }

  // ── Step 2d: Policy-intervention combo boost (Task 1004) ──────────────
  // Only applies when ≥ 2 independent government policy categories co-occur.
  // Targets banking + securities (most direct beneficiaries of VN policy combos).
  const comboResult = detectPolicyInterventionCombo(summaryLower);
  if (comboResult.multiplier > 1.0) {
    const comboTargets: DomainType[] = ["banking", "securities"];
    for (const [domain, domainEntry] of domainEntryMap) {
      if (!comboTargets.includes(domain)) continue;
      const boosted = Math.min(0.99, domainEntry.confidence * comboResult.multiplier);
      domainEntry.confidence = boosted;
      domainEntry.reasoning +=
        ` [PolicyCombo: ${comboResult.matchedCategories.join("+")} → ×${comboResult.multiplier.toFixed(2)} ${domain}]`;
    }
  }

  // ── Step 2e: MSCI Inclusion Cascade (Task 1279) ─────────────────────────
  // Detect MSCI index inclusion keywords + create domain-level cascade entry.
  // MSCI inclusion is a cross-sector bullish catalyst affecting large-cap stocks.
  // Application layer (detectMsciCascadePeers) filters watchlist to large-cap only.
  const msciResult = detectMsciInclusion(summaryLower, seedEntry.confidence ?? 0.6);
  if (msciResult.matched) {
    const msciDomainEntry: CausalChainEntry = {
      level: "domain",
      title: "MSCI Inclusion Cascade",
      summary: `${seedEntry.sourceTitle} — MSCI inclusion keywords detected`,
      affectedDomains: [],  // MSCI is cross-sector
      affectedActions: [],  // Populated by application layer via detectMsciCascadePeers()
      sentiment: "bullish",
      impactScore: Math.round(seedEntry.impactScore * msciResult.confidence),
      confidence: msciResult.confidence,
      reasoning: `MSCI inclusion detected: ${msciResult.keywords.join(", ")}. Targets large-cap watchlist stocks.`,
    };
    entries.push(msciDomainEntry);
  }

  // ── Step 2f: MSCI Watchlist Cascade (Task 1329) ────────────────────────
  // Detect MSCI watchlist keywords + create bullish cascade entry.
  // Watchlist = precursor to full inclusion, triggers passive allocation planning.
  const msciWatchlistResult = detectMsciWatchlist(summaryLower, seedEntry.confidence ?? 0.6);
  if (msciWatchlistResult.matched) {
    const msciWatchlistEntry: CausalChainEntry = {
      level: "domain",
      title: "MSCI Watchlist Cascade",
      summary: `${seedEntry.sourceTitle} — MSCI watchlist keywords detected`,
      affectedDomains: [],  // MSCI is cross-sector
      affectedActions: [],  // Populated by application layer
      sentiment: "bullish",
      impactScore: Math.round(seedEntry.impactScore * msciWatchlistResult.confidence),
      confidence: msciWatchlistResult.confidence,
      reasoning: `MSCI watchlist detected: ${msciWatchlistResult.keywords.join(", ")}. Precursor to full inclusion.`,
    };
    entries.push(msciWatchlistEntry);
  }

  // ── Step 2g: MSCI Exclusion Cascade (Task 1329) ────────────────────────
  // Detect MSCI exclusion keywords + create bearish cascade entry.
  // Exclusion = forced selling, large passive fund outflows from Vietnam.
  const msciExclusionResult = detectMsciExclusion(summaryLower, seedEntry.confidence ?? 0.6);
  if (msciExclusionResult.matched) {
    const msciExclusionEntry: CausalChainEntry = {
      level: "domain",
      title: "MSCI Exclusion Cascade",
      summary: `${seedEntry.sourceTitle} — MSCI exclusion keywords detected`,
      affectedDomains: [],  // MSCI is cross-sector
      affectedActions: [],  // Populated by application layer
      sentiment: "bearish",
      impactScore: Math.round(seedEntry.impactScore * msciExclusionResult.confidence),
      confidence: msciExclusionResult.confidence,
      reasoning: `MSCI exclusion detected: ${msciExclusionResult.keywords.join(", ")}. Triggers forced selling.`,
    };
    entries.push(msciExclusionEntry);
  }

  // ── Step 2h: Non-watchlist company event confidence cap (Task 1207) ──────
  // When a news article is about a specific company (affectedActions non-empty)
  // that is NOT in the user's watchlist, cap all domain-level confidence at 0.6.
  // Rationale: non-watchlist company noise should never generate high-confidence alerts.
  //
  // Cap applies when:
  //   1. seedEntry.affectedActions has at least one company code (company-specific event)
  //   2. NONE of those companies appear in the watchlist
  //
  // Cap is skipped when:
  //   - affectedActions is empty (market-wide event)
  //   - At least one affected company is in the watchlist
  const NON_WATCHLIST_CONFIDENCE_CAP = 0.6;
  if (seedEntry.affectedActions.length > 0) {
    const watchlistCodes = new Set(watchlist.map((w) => w.actionCode));
    const anyInWatchlist = seedEntry.affectedActions.some((code) => watchlistCodes.has(code));

    if (!anyInWatchlist) {
      for (const entry of entries) {
        if (entry.level !== "domain") continue;
        const before = entry.confidence;
        if (entry.confidence > NON_WATCHLIST_CONFIDENCE_CAP) {
          entry.confidence = NON_WATCHLIST_CONFIDENCE_CAP;
        }
        // Always annotate — cap was applied (or was already below threshold)
        entry.reasoning += ` [NonWatchlistCap: company not in watchlist → confidence capped at ${NON_WATCHLIST_CONFIDENCE_CAP} (was ${before.toFixed(2)})]`;
      }
    }
  }

  // ── Step 2h: Action entries from rule affected_actions (Task 1264) ──────
  // When a SectorRule has explicit affected_actions (e.g., Hormuz rule directly
  // mapping to VJC, BSR), create direct action entries for those tickers.
  // These bypass the watchlist membership check and create high-confidence alerts.
  const ruleAffectedCodesSeen = new Set<string>();

  for (const [domain, { rule, matchedKeyword }] of triggeredDomains) {
    if (!rule.affected_actions || rule.affected_actions.length === 0) continue;

    const domainEntry = domainEntryMap.get(domain);
    if (!domainEntry) continue;

    for (const affected of rule.affected_actions) {
      if (ruleAffectedCodesSeen.has(affected.code)) continue; // no duplicates
      ruleAffectedCodesSeen.add(affected.code);

      // Find watchlist entry to get domain (needed for action entry)
      const watchlistStock = watchlist.find((w) => w.actionCode === affected.code);
      if (!watchlistStock) continue; // Skip if ticker not in watchlist

      const affectedSentiment: Sentiment = affected.direction === "up" ? "bullish" : affected.direction === "down" ? "bearish" : "neutral";

      const ruleAffectedEntry: CausalChainEntry = {
        level: "action",
        title: `${affected.code} — tác động trực tiếp từ quy tắc ${domain}`,
        summary: `Cổ phiếu ${affected.code} bị ảnh hưởng trực tiếp bởi: ${rule.title}`,
        affectedDomains: [watchlistStock.domain],
        affectedActions: [affected.code],
        sentiment: affectedSentiment,
        impactScore: Math.round(seedEntry.impactScore * domainEntry.confidence),
        confidence: domainEntry.confidence * 0.95,
        reasoning: `[RuleAffected: ${affected.code}] Direct mapping from ${domain} rule: ${rule.title}`,
      };

      entries.push(ruleAffectedEntry);
    }
  }

  // ── Step 3: Action entries from watchlist ─────────────────────────────
  // Deduplicate watchlist by actionCode
  const seenStocks = new Set<string>();
  const deduplicatedWatchlist = watchlist.filter((w) => {
    if (seenStocks.has(w.actionCode)) return false;
    seenStocks.add(w.actionCode);
    return true;
  });

  const actionEntries: CausalChainEntry[] = [];

  // Seed text used for alias detection — pre-computed once outside the loop
  const seedText = `${seedEntry.sourceTitle} ${seedEntry.summary}`;
  // Normalised seed text for direct ticker-code NER (Task 1251)
  const seedTextNorm = seedText.toLowerCase();

  /**
   * Task 1251 — Direct ticker-code NER helper.
   *
   * detectStocksInText() only checks company-name aliases. When the raw ticker
   * code appears in the headline (e.g. "TCB bị loại khỏi rổ VNDiamond"), NER
   * fails because "tcb" is not in TCB's alias list.
   *
   * This helper checks whether the raw 2-5 character ticker code appears in the
   * normalised seed text as a whole-word (word-boundary) match. Only codes that
   * are 2-5 characters are eligible to avoid matching very short tokens.
   *
   * Word-boundary: character before must be non-alphanumeric (or start-of-string),
   * character after must be non-alphanumeric (or end-of-string).
   *
   * Task 1266 — False positive guard: Vietnamese stock tickers ALWAYS appear
   * in ALL-CAPS in news articles (e.g. "HUT", "TCB", "VNM"). Common Vietnamese
   * words that happen to spell a ticker when diacritics are removed (e.g. "hụt"
   * from "thiếu hụt" → "hut") are never written all-uppercase. Therefore we
   * require the ticker to match in the ORIGINAL (non-lowercased) seedText as
   * well, ensuring that case-folded common-word matches are rejected.
   */
  function hasUppercaseWordBoundary(text: string, upperCode: string): boolean {
    let startIdx = 0;
    while (true) {
      const idx = text.indexOf(upperCode, startIdx);
      if (idx === -1) return false;

      const beforeOk = idx === 0 || !/[A-Za-z0-9]/.test(text[idx - 1]!);
      const afterIdx = idx + upperCode.length;
      const afterOk = afterIdx >= text.length || !/[A-Za-z0-9]/.test(text[afterIdx]!);

      // FIX NER-PLACE-1: place-name preceding-token guard. An all-caps token
      // collides with a watchlist ticker when it is actually a geographic
      // reference (e.g. "TP HCM" / "TP.HCM" / "Thành phố HCM" = Ho Chi Minh
      // City, not the broker ticker HCM). Reject this occurrence when the
      // immediately-preceding token is a Vietnamese place prefix, and keep
      // scanning for another (genuine) all-caps occurrence. Generalized to the
      // whole place-prefix + all-caps-ticker collision class (not HCM-specific).
      if (beforeOk && afterOk && !isPrecededByPlacePrefix(text, idx)) return true;
      startIdx = idx + 1;
    }
  }

  function isDirectTickerMention(code: string): boolean {
    const upper = code.toUpperCase();
    if (upper.length < 2 || upper.length > 5) return false;

    // Require the ticker to appear ALL-CAPS in the original text (Task 1266).
    // This eliminates false positives from Vietnamese words that match a ticker
    // only after diacritic stripping (e.g. "hụt" → "hut" matching "HUT").
    if (!hasUppercaseWordBoundary(seedText, upper)) return false;

    // Also verify it appears at word boundary in the lowercased text
    // (guards against mid-word uppercase substrings, e.g. "HPGAS" vs "HPG").
    const lower = upper.toLowerCase();
    let startIdx = 0;
    while (true) {
      const idx = seedTextNorm.indexOf(lower, startIdx);
      if (idx === -1) return false;

      const beforeOk = idx === 0 || !/[a-z0-9]/.test(seedTextNorm[idx - 1]!);
      const afterIdx = idx + lower.length;
      const afterOk = afterIdx >= seedTextNorm.length || !/[a-z0-9]/.test(seedTextNorm[afterIdx]!);

      if (beforeOk && afterOk) return true;
      startIdx = idx + 1;
    }
  }

  for (const stock of deduplicatedWatchlist) {
    const domainEntry = domainEntryMap.get(stock.domain);

    // Alias fallback (Task 161): check if seed text mentions this stock by trade name
    const aliasHits = detectStocksInText(seedText, [stock.actionCode]);
    const resolvedViaAlias = aliasHits.length > 0;

    // Task 1251: Direct ticker-code NER — check if the raw ticker (e.g. "TCB")
    // appears as a word-boundary match in the headline/summary.
    // This catches cases where the alias list lacks the 3-letter code itself.
    const resolvedViaDirectCode = !resolvedViaAlias && isDirectTickerMention(stock.actionCode);

    if (!domainEntry && !resolvedViaAlias && !resolvedViaDirectCode) continue; // neither path matched — skip

    let actionEntry: CausalChainEntry;

    if (domainEntry && !resolvedViaDirectCode) {
      // Primary path: domain rule fired — use domain-rule confidence
      actionEntry = {
        level: "action",
        title: `${stock.actionCode} — tác động gián tiếp`,
        summary: `Cổ phiếu ${stock.actionCode} thuộc ngành ${stock.domain}.`,
        affectedDomains: [stock.domain],
        affectedActions: [stock.actionCode],
        sentiment: domainEntry.sentiment,
        impactScore: Math.round(domainEntry.impactScore * 0.9),
        confidence: domainEntry.confidence * 0.9,
        reasoning: `Cổ phiếu ${stock.actionCode} thuộc ngành ${stock.domain}, bị ảnh hưởng bởi: ${domainEntry.title}`,
      };
    } else if (resolvedViaDirectCode) {
      // Task 1251: Direct ticker-code NER path — ticker appears explicitly in headline.
      // Use the domain entry's confidence if available (domain rule also matched),
      // otherwise use a higher confidence than alias-only (0.70) since explicit
      // code mention is a strong signal (stronger than company-name alias: 0.55).
      const hasDomainRule = domainEntry !== undefined;
      actionEntry = {
        level: "action",
        title: `${stock.actionCode} — đề cập trực tiếp mã cổ phiếu`,
        summary: `Cổ phiếu ${stock.actionCode} được nhắc đến trực tiếp bằng mã trong bài viết.`,
        affectedDomains: [stock.domain],
        affectedActions: [stock.actionCode],
        sentiment: hasDomainRule ? domainEntry!.sentiment : seedEntry.sentiment,
        impactScore: hasDomainRule
          ? Math.round(domainEntry!.impactScore * 0.9)
          : Math.round(seedEntry.impactScore * 0.7),
        confidence: hasDomainRule ? domainEntry!.confidence * 0.9 : 0.70,
        reasoning: hasDomainRule
          ? `[DirectCodeNER+DomainRule: ${stock.actionCode}] Mã cổ phiếu được nhắc trực tiếp; quy tắc ngành ${stock.domain} cũng khớp. ${domainEntry!.title}`
          : `[DirectCodeNER: ${stock.actionCode}] Mã cổ phiếu được nhắc trực tiếp trong tiêu đề. Không có quy tắc ngành khớp.`,
      };
    } else {
      // Alias fallback path: company trade name found in text, no domain rule fired
      // Use fixed confidence 0.55 (same as uncoveredDomains default)
      actionEntry = {
        level: "action",
        title: `${stock.actionCode} — phát hiện qua tên thương hiệu`,
        summary: `Cổ phiếu ${stock.actionCode} được phát hiện qua tên thương hiệu trong bài viết.`,
        affectedDomains: [stock.domain],
        affectedActions: [stock.actionCode],
        sentiment: seedEntry.sentiment,
        impactScore: Math.round(seedEntry.impactScore * 0.55),
        confidence: 0.55,
        reasoning: `[AliasResolved: ${stock.actionCode}] Cổ phiếu được phát hiện qua tên thương hiệu. Không có quy tắc ngành khớp.`,
      };
    }

    actionEntries.push(actionEntry);
  }

  entries.push(...actionEntries);

  // ── Step 3b: Market-wide broadcast pass (Task 162) ────────────────────
  // If this is a market-wide event (VN-Index, "toàn thị trường", or a
  // country/global article with sufficient impact score), cascade to ALL
  // watchlist stocks not already covered by domain rules or alias resolution.
  const effectiveBroadcastMin = broadcastMinImpact ?? 6;
  const seedTextForBroadcast = `${seedEntry.sourceTitle} ${seedEntry.summary}`;

  // Task 1256: Commodity-source broadcast exclusion.
  // If the article triggered a commodity-specific domain rule (gold_mining, oil_gas),
  // restrict market-wide broadcast to domains already covered by cascade rules.
  // This prevents gold/oil price articles from falsely alerting real_estate, banking, etc.
  // via the generic "global article + high impact score → broadcast all" path.
  // Only applies when domainEntryMap is non-empty (at least one rule matched) AND
  // the article does NOT contain explicit VN market-wide signals (those override).
  // Task 1309a: add "agriculture" — commodity-sector articles (coffee/rice/seafood export)
  // must not broadcast to unrelated sectors (real_estate, banking) via market-wide path.
  // FIX-1299: add "utilities" — coal/minerals articles cascade to utilities (thermal power),
  // not oil_gas. Adding utilities here restricts broadcast so BSR (oil refinery) is not
  // reached when coal/minerals news has no oil/energy context.
  const COMMODITY_TRIGGER_DOMAINS = new Set<string>(["gold_mining", "oil_gas", "agriculture", "utilities"]);
  const matchedDomains = Array.from(domainEntryMap.keys());
  const hasCommodityTrigger =
    matchedDomains.some((d) => COMMODITY_TRIGGER_DOMAINS.has(d));
  // A VN market-wide signal (VN-Index, "toàn thị trường") always broadcasts — don't suppress.
  const seedLowerForVnCheck = seedTextForBroadcast.toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const hasVnMarketWideSignal =
    seedLowerForVnCheck.includes("vn-index") ||
    seedLowerForVnCheck.includes("toan thi truong") ||
    seedLowerForVnCheck.includes("thi truong chung khoan");

  // Domains already covered by cascade rules (broadcast only extends these)
  const alreadyCoveredDomains = new Set<string>(matchedDomains);

  // Task 1334: analyst-warning articles bypass the impactScore gate — they are
  // quality signals regardless of their numeric score (e.g. CEO warnings at score 4).
  // Note: đ (U+0111) survives NFD normalization — use it directly in patterns.
  // Bug 1314: brokerage-outlook patterns added — must stay in sync with ANALYST_WARNING_PATTERNS
  // in isMarketWide() above. Both arrays gate the same bypass logic at different call sites.
  const ANALYST_WARNING_PATTERNS_BROADCAST = [
    "đieu chinh sau",
    "rat sau va đau",
    "canh bao nha đau tu",
    "trien vong nganh moi gioi",   // triển vọng ngành môi giới
    "ap luc canh tranh moi gioi",  // áp lực cạnh tranh môi giới
    "canh tranh moi gioi",         // cạnh tranh môi giới
  ];
  const seedNormForBroadcast = seedTextForBroadcast
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  const hasAnalystWarningPattern = ANALYST_WARNING_PATTERNS_BROADCAST.some((p) =>
    seedNormForBroadcast.includes(p),
  );

  if (
    isMarketWide(seedTextForBroadcast.toLowerCase(), seedEntry.level, seedEntry.impactScore, effectiveBroadcastMin) &&
    (seedEntry.impactScore >= effectiveBroadcastMin || hasAnalystWarningPattern)
  ) {
    // Compute the set of action codes already covered — no double broadcast
    const alreadyCoveredCodes = new Set(
      actionEntries.map((ae) => ae.affectedActions[0] ?? ""),
    );

    for (const stock of deduplicatedWatchlist) {
      if (alreadyCoveredCodes.has(stock.actionCode)) continue; // no double broadcast

      // Task 1256: Commodity-source exclusion guard.
      // If a commodity rule fired AND there is no VN market-wide signal,
      // only broadcast to stocks whose domain is already covered by cascade rules.
      // This prevents gold/oil articles from alerting real_estate, banking, etc.
      if (
        hasCommodityTrigger &&
        !hasVnMarketWideSignal &&
        !alreadyCoveredDomains.has(stock.domain)
      ) {
        continue; // Commodity article — skip unrelated sectors
      }

      const broadcastConfidence = Math.min(0.7, seedEntry.impactScore / 10);

      const broadcastEntry: CausalChainEntry = {
        level: "action",
        title: `${stock.actionCode} — ảnh hưởng toàn thị trường`,
        summary: `Cổ phiếu ${stock.actionCode} bị ảnh hưởng theo diễn biến chung của thị trường.`,
        affectedDomains: [stock.domain],
        affectedActions: [stock.actionCode],
        sentiment: seedEntry.sentiment,
        impactScore: Math.round(seedEntry.impactScore * broadcastConfidence),
        confidence: broadcastConfidence,
        reasoning: `market-wide cascade: ${seedEntry.sourceTitle.slice(0, 80)}`,
      };

      actionEntries.push(broadcastEntry);
      entries.push(broadcastEntry);
    }
  }

  // ── Step 4: RAG enrichment ────────────────────────────────────────────
  if (ragResults && ragResults.length > 0) {
    const top3 = ragResults.slice(0, 3);
    for (const rag of top3) {
      // Find most relevant entry by level match; fall back to seed entry
      const matchByLevel = entries.find((e) => e.level === rag.level);
      const target = matchByLevel ?? entries[0];
      if (target === undefined) continue;
      const ragSnippet = ` [Historical: "${rag.title}" — ${rag.summary.slice(0, 120)}]`;
      target.reasoning += ragSnippet;
    }
  }

  // ── Step 5: Build watchlistImpacts from action entries ─────────────────
  // Collect all action-level entries (from watchlist, broadcast, and rule affected_actions)
  const allActionEntries = entries.filter((e) => e.level === "action");
  const watchlistImpacts: WatchlistImpact[] = allActionEntries.map((ae) => {
    const actionCode = ae.affectedActions[0] ?? "";
    const domain = ae.affectedDomains[0] ?? ("other" as DomainType);
    const impactDirection: ImpactDirection =
      ae.sentiment === "bullish"
        ? "up"
        : ae.sentiment === "bearish"
          ? "down"
          : "neutral";

    return {
      actionCode,
      domain,
      impactDirection,
      confidence: ae.confidence,
      reasoning: ae.reasoning,
    };
  });

  // ── Step 6: Collect matched rules for instrumentation (Task 247) ──────
  const matchedRules: MatchedRule[] = [];
  for (const entry of entries) {
    if (entry.level === "domain" && entry.affectedDomains.length > 0) {
      const direction = entry.sentiment === "bullish" ? "up" : entry.sentiment === "bearish" ? "down" : "neutral";
      for (const domain of entry.affectedDomains) {
        matchedRules.push({
          key: `${domain}_${direction}`,
          matchedKeyword: entry.title.slice(0, 80),
          sector: domain,
        });
      }
    }
  }

  return {
    id: chainId,
    seedTitle: seedEntry.sourceTitle,
    createdAt: new Date().toISOString(),
    entries,
    watchlistImpacts,
    matchedRules,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// IMF Cascade Rules (Task 1296b)
// Sentiment-score-based rules triggered by imfSentiment field on signals.
// 11 rules: fire when imfSentiment.sentiment exceeds threshold AND
//           imfSentiment.confidence >= IMF_CONFIDENCE_MIN (default 0.55).
// These rules are exported for use in chainSynthesizer and tests.
// ═══════════════════════════════════════════════════════════════════════════

export interface ImfCascadeRule {
  id: string;
  name: string;
  /** Sentiment threshold (signal must exceed this to fire) */
  sentimentThreshold: number;
  /** ">" for bullish rules, "<" for bearish rules */
  operator: ">" | "<";
  /** Sector names affected */
  targetSectors: string[];
  /** Signed impact delta for conviction scoring */
  impact: number;
  reasoning: string;
  /** Example stocks for this rule */
  examples: string[];
}

export const IMF_CASCADE_RULES: ImfCascadeRule[] = [
  {
    id: "imf_rule_01",
    name: "IMF Global Growth ↑ → Banking NIM Expansion",
    sentimentThreshold: 0.5,
    operator: ">",
    targetSectors: ["banking"],
    impact: 0.45,
    reasoning: "Higher global growth → ↑ credit demand, ↑ NIM, ↓ defaults",
    examples: ["VCB", "BID", "MBB", "HDB"],
  },
  {
    id: "imf_rule_02",
    name: "IMF Global Growth ↓ → Real Estate Contraction",
    sentimentThreshold: -0.5,
    operator: "<",
    targetSectors: ["real_estate"],
    impact: -0.35,
    reasoning: "Lower growth → ↓ investment appetite, financing stress, 2Q lag",
    examples: ["VRE", "NVL", "DXG"],
  },
  {
    id: "imf_rule_03",
    name: "IMF Advanced Economy Growth ↑ → VN Export Boom",
    sentimentThreshold: 0.3,
    operator: ">",
    targetSectors: ["export", "manufacturing"],
    impact: 0.35,
    reasoning: "US/EU growth → ↑ demand for VN textiles, electronics, components",
    examples: ["FPT", "ELC", "VCG", "SAB"],
  },
  {
    id: "imf_rule_04",
    name: "IMF USD Strength ↑ → Agriculture Export Competitiveness ↑",
    sentimentThreshold: 0.3,
    operator: ">",
    targetSectors: ["agriculture"],
    impact: 0.10,
    reasoning: "USD strength → VND weakness → ↑ export revenue (in USD terms)",
    examples: ["BVF", "DHG", "MSN", "HAG"],
  },
  {
    id: "imf_rule_05",
    name: "IMF Inflation ↑ → Banking NIM Compression",
    sentimentThreshold: -0.4,
    operator: "<",
    targetSectors: ["banking"],
    impact: -0.08,
    reasoning: "↑ inflation → real lending rates ↓ → NIM pressure (mitigated by SBV policy)",
    examples: ["VCB", "BID", "HDB"],
  },
  {
    id: "imf_rule_06",
    name: "IMF EM Capital Flight ↑ → Real Estate Capital Outflow",
    sentimentThreshold: -0.6,
    operator: "<",
    targetSectors: ["real_estate"],
    impact: -0.25,
    reasoning: "EM debt crisis → ↓↓ FDI, property market stress (rare, severe)",
    examples: ["VRE", "NVL", "DXG"],
  },
  {
    id: "imf_rule_07",
    name: "IMF VN Fiscal Risk ↑ → Banking Credit Tightening",
    sentimentThreshold: -0.4,
    operator: "<",
    targetSectors: ["banking"],
    impact: -0.12,
    reasoning: "↑ VN debt → ↑ sovereign risk → ↑ bond yield, credit contraction",
    examples: ["VCB", "BID", "PSI"],
  },
  {
    id: "imf_rule_08",
    name: "IMF Oil Price ↑ → Energy Sector Outperformance",
    sentimentThreshold: 0.4,
    operator: ">",
    targetSectors: ["energy", "oil_gas"],
    impact: 0.14,
    reasoning: "↑ oil forecast → ↑ revenue for GAS, PVD, PVOil",
    examples: ["GAS", "PVD", "POW"],
  },
  {
    id: "imf_rule_09",
    name: "IMF FDI Outlook ↑ → Tech/Industrials Rally",
    sentimentThreshold: 0.3,
    operator: ">",
    targetSectors: ["tech", "manufacturing"],
    impact: 0.11,
    reasoning: "↑ IMF FDI confidence → ↑ foreign investment inflows, supply chain relocation to VN",
    examples: ["FPT", "ELC", "VCG", "LPB"],
  },
  {
    id: "imf_rule_10",
    name: "IMF ASEAN Growth ↑ → VN Retail/Tourism Rally",
    sentimentThreshold: 0.2,
    operator: ">",
    targetSectors: ["retail", "tourism"],
    impact: 0.09,
    reasoning: "↑ ASEAN growth → ↑ regional demand, tourism recovery (spillover effect)",
    examples: ["MWG", "VJC", "VIC", "HVN"],
  },
  {
    id: "imf_rule_11",
    name: "IMF Capital Account Stress ↑ → FX Derivatives Demand",
    sentimentThreshold: -0.3,
    operator: "<",
    targetSectors: ["banking"],
    impact: 0.08,
    reasoning: "↑ capital account pressure → ↑ currency hedging demand, derivatives trading volume",
    examples: ["VCB", "BID", "HDB", "CTS"],
  },
];
