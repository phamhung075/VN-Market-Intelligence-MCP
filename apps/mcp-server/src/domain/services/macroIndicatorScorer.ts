/**
 * Macro Indicator Scorer — Task 1199
 *
 * Tiered impact scoring for Trading Economics / macro indicator articles.
 * Replaces the flat 10.0 impact score that was applied to all TE articles
 * regardless of their relevance to the Vietnamese market.
 *
 * Three tiers based on VN-market proximity:
 *
 *   VN_DIRECT   → 8–10   Vietnam GDP, CPI, interest rate, SBV rate, VND/USD
 *   REGIONAL    → 5–7    Fed rate, China PMI, oil price, gold, ASEAN data
 *   US_DOMESTIC → 2–4    US housing starts, US retail, UK/EU domestic data
 *
 * Tier resolution uses keyword matching against the indicator name string
 * (case-insensitive). The first tier whose keywords match wins.
 * Unknown indicators default to REGIONAL.
 *
 * Design:
 *   - Pure function — no I/O, no side effects, no async.
 *   - Layer: domain/services — no infrastructure imports.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Relevance tier for a macro indicator relative to the VN market.
 */
export enum MacroIndicatorTier {
  /** Vietnam-specific indicator — highest impact (8–10) */
  VN_DIRECT = "VN_DIRECT",
  /** Regional / global indicator with indirect VN impact (5–7) */
  REGIONAL = "REGIONAL",
  /** US-domestic or other non-VN-relevant indicator — low impact (2–4) */
  US_DOMESTIC = "US_DOMESTIC",
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier keyword sets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keywords that identify a VN-direct indicator.
 * Presence of ANY keyword in the indicator name → tier VN_DIRECT.
 */
const VN_DIRECT_KEYWORDS: ReadonlyArray<string> = [
  "vietnam",
  "việt nam",
  "viet nam",
  "vn gdp",
  "vn cpi",
  "sbv",
  "nhnn",
  "vnd",
  "dong",
  "vnindex",
  "vn-index",
  "hose",
  "hnx",
];

/**
 * Keywords that identify a regional / globally-relevant indicator.
 * Presence of ANY keyword → tier REGIONAL (applied only if VN_DIRECT did not match).
 */
const REGIONAL_KEYWORDS: ReadonlyArray<string> = [
  // Central bank / monetary
  "federal reserve",
  "fed rate",
  "fed fund",
  "fomc",
  "ecb",
  "pboc",
  "boc",
  "rba",
  "boe",
  // Commodities
  "oil",
  "crude",
  "brent",
  "wti",
  "gold",
  "copper",
  "iron ore",
  "coal",
  "lng",
  "natural gas",
  // Regional economies
  "china",
  "chinese",
  "asean",
  "southeast asia",
  "japan",
  "korea",
  "singapore",
  "thailand",
  "indonesia",
  "malaysia",
  // Global aggregates
  "global pmi",
  "world gdp",
  "global inflation",
  "global trade",
  "imf",
  "world bank",
  "usd",
  "us dollar",
  "dxy",
  // Commodity/trade indices
  "pmi",
  "cpi",
  "inflation",
  "interest rate",
  "gdp",
];

/**
 * Keywords that identify a US-domestic or otherwise low-VN-relevance indicator.
 * Applied only when neither VN_DIRECT nor REGIONAL keywords matched.
 */
const US_DOMESTIC_KEYWORDS: ReadonlyArray<string> = [
  "us housing",
  "us retail",
  "us consumer",
  "us employment",
  "us nonfarm",
  "us jobless",
  "us durable",
  "us factory",
  "us trade balance",
  "united states housing",
  "united states retail",
  "american consumer",
  "uk gdp",
  "uk cpi",
  "uk inflation",
  "uk housing",
  "uk retail",
  "united kingdom gdp",
  "united kingdom cpi",
  "united kingdom inflation",
  "eurozone",
  "euro area",
  "german",
  "france gdp",
  "canada gdp",
  "australia gdp",
];

// ─────────────────────────────────────────────────────────────────────────────
// Tier → score range mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Midpoint impact score for each tier.
 *
 * VN_DIRECT   → 9  (range 8–10)
 * REGIONAL    → 6  (range 5–7)
 * US_DOMESTIC → 3  (range 2–4)
 */
const TIER_SCORE: Record<MacroIndicatorTier, number> = {
  [MacroIndicatorTier.VN_DIRECT]: 9,
  [MacroIndicatorTier.REGIONAL]: 6,
  [MacroIndicatorTier.US_DOMESTIC]: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// Core logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolve the relevance tier for a macro indicator by keyword matching.
 *
 * @param indicatorName - Free-form indicator name string (e.g. "Vietnam GDP Growth Rate")
 * @returns The resolved MacroIndicatorTier
 */
export function resolveTier(indicatorName: string): MacroIndicatorTier {
  const lower = indicatorName.toLowerCase().trim();

  // Tier 1 check first (highest priority)
  for (const kw of VN_DIRECT_KEYWORDS) {
    if (lower.includes(kw)) return MacroIndicatorTier.VN_DIRECT;
  }

  // Tier 3 check before Tier 2 — US_DOMESTIC keywords are specific enough
  // to distinguish from generic REGIONAL ones ("us housing" vs "gdp")
  for (const kw of US_DOMESTIC_KEYWORDS) {
    if (lower.includes(kw)) return MacroIndicatorTier.US_DOMESTIC;
  }

  // Tier 2 — broad regional/global indicators
  for (const kw of REGIONAL_KEYWORDS) {
    if (lower.includes(kw)) return MacroIndicatorTier.REGIONAL;
  }

  // Default: treat as REGIONAL (most macro news has some indirect VN relevance)
  return MacroIndicatorTier.REGIONAL;
}

/**
 * Compute an integer impact score (0–10) for a macro indicator article.
 *
 * Tiered scoring rules:
 *   VN_DIRECT   → 9 (range 8–10)
 *   REGIONAL    → 6 (range 5–7)
 *   US_DOMESTIC → 3 (range 2–4)
 *
 * The midpoint of each tier's range is returned as the canonical score.
 * Callers may apply ±1 adjustments within the tier range based on
 * sentiment strength (e.g. "Vietnam GDP beats expectations" → 10).
 *
 * @param indicatorName - The indicator name or article headline from TE
 * @returns Integer impact score in [2, 10]
 */
export function scoreMacroIndicator(indicatorName: string): number {
  const tier = resolveTier(indicatorName);
  return TIER_SCORE[tier];
}
