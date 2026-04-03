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

interface SectorRule {
  /** Any single keyword match triggers this rule */
  keywords: string[];
  domain: DomainType;
  direction: ImpactDirection;
  confidence: number;
  /** Human-readable rule description, used as CausalChainEntry.title */
  title: string;
}

const SECTOR_RULES: SectorRule[] = [
  {
    keywords: ["giá dầu tăng", "oil price rise", "crude oil up", "giá dầu tăng mạnh", "opec"],
    domain: "oil_gas",
    direction: "up",
    confidence: 0.85,
    title: "Giá dầu tăng — tích cực cho ngành dầu khí",
  },
  {
    keywords: ["giá dầu giảm", "oil price fall", "crude oil down"],
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
    keywords: ["giá thép tăng", "steel price rise", "steel price up"],
    domain: "steel",
    direction: "up",
    confidence: 0.80,
    title: "Giá thép tăng — tích cực cho doanh nghiệp thép",
  },
  {
    keywords: ["giá thép giảm", "steel price fall", "steel price down"],
    domain: "steel",
    direction: "down",
    confidence: 0.80,
    title: "Giá thép giảm — tiêu cực cho doanh nghiệp thép",
  },
  // ── Coal / Mining → oil_gas (energy sector) ─────────────────────────────
  {
    keywords: ["kinh doanh than", "coal mining", "than đá", "coal price", "giá than", "khoáng sản", "mineral mining"],
    domain: "oil_gas",
    direction: "up",
    confidence: 0.75,
    title: "Than/khoáng sản — tích cực cho ngành năng lượng",
  },
  {
    keywords: ["giá than giảm", "coal price drop", "coal price fall", "than đá giảm"],
    domain: "oil_gas",
    direction: "down",
    confidence: 0.70,
    title: "Giá than giảm — tiêu cực cho doanh nghiệp than/năng lượng",
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
  {
    keywords: ["war", "conflict", "geopolitical", "middle east", "chiến tranh", "xung đột", "iran attack", "iran strike", "iran war", "strait of hormuz", "military strike"],
    domain: "oil_gas",
    direction: "up",
    confidence: 0.78,
    title: "Rủi ro địa chính trị — đẩy giá dầu lên (supply disruption)",
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
    domain: "consumer_goods",
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
    domain: "consumer_goods",
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
];

// ═══════════════════════════════════════════════════════════════════════════
// Main exported function
// ═══════════════════════════════════════════════════════════════════════════

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

  for (const stock of deduplicatedWatchlist) {
    const domainEntry = domainEntryMap.get(stock.domain);

    // Alias fallback (Task 161): check if seed text mentions this stock by trade name
    const aliasHits = detectStocksInText(seedText, [stock.actionCode]);
    const resolvedViaAlias = aliasHits.length > 0;

    if (!domainEntry && !resolvedViaAlias) continue; // neither path matched — skip

    let actionEntry: CausalChainEntry;

    if (domainEntry) {
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

  if (
    isMarketWide(seedTextForBroadcast.toLowerCase(), seedEntry.level, seedEntry.impactScore, effectiveBroadcastMin) &&
    seedEntry.impactScore >= effectiveBroadcastMin
  ) {
    // Compute the set of action codes already covered — no double broadcast
    const alreadyCoveredCodes = new Set(
      actionEntries.map((ae) => ae.affectedActions[0] ?? ""),
    );

    for (const stock of deduplicatedWatchlist) {
      if (alreadyCoveredCodes.has(stock.actionCode)) continue; // no double broadcast

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
  const watchlistImpacts: WatchlistImpact[] = actionEntries.map((ae) => {
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
