/**
 * Macro adjustment orchestration — cascadeEngine helper module
 *
 * size-justification: ~400L — exceeds the 120L logic cap but is one cohesive
 * unit: the legacy hardcoded MACRO_ADJUSTMENTS table (~200L, 28 rules) +
 * applyMacroAdjustments that consumes it, PLUS the newer σ-based
 * DYNAMIC_MACRO_MAP (~45L) + applyDynamicMacroAdjustments that consumes it.
 * Both paths are called back-to-back from buildCausalChain (dynamic first,
 * legacy as fallback) and share MAX_MACRO_NEGATIVE_DELTA capping semantics —
 * splitting the two data/function pairs apart would separate each table from
 * its sole consumer for no maintainability gain. Extracted from
 * cascadeEngine.ts (FACTORY-DOMAIN-split-cascade-engine, Step 3) — pure move
 * of already-exported symbols (applyMacroAdjustments, applyDynamicMacroAdjustments),
 * no behavior change. MacroRule/DynamicMacroMapping/MACRO_ADJUSTMENTS/
 * DYNAMIC_MACRO_MAP/MAX_MACRO_NEGATIVE_DELTA/deriveDisplayValue were already
 * module-private in cascadeEngine.ts and remain private here.
 *
 * Layer: domain/services
 */

import type { DomainType } from "../../../../bctc-schema";
import type { CausalChainEntry, MacroContext } from "../cascadeEngine.js";
import { classifyDeviation, deviationToDelta, type MacroStats, type MacroDeviation } from "../macroThresholds.js";

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

