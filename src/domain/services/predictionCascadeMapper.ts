/**
 * Prediction Cascade Mapper — Task 165
 *
 * Pure domain function that maps a prediction market question string to
 * affected Vietnamese stock sectors (DomainType) and individual stock codes.
 *
 * Design notes:
 *  - Synchronous, no I/O, no side effects.
 *  - ZERO imports from infrastructure/ or application/.
 *  - Keyword matching: AND across groups, OR within each group (case-insensitive).
 *  - All matching rules contribute sectors/stocks (union); first match wins for direction.
 *  - Rules with stocks=[] automatically include all watchlistCodes.
 *  - Custom rules (injected at call-site) are evaluated BEFORE built-in rules,
 *    so they can override direction for a given question.
 *
 * Layer: domain/services
 */

import type { DomainType } from "../../../bctc-schema.js";

// ═══════════════════════════════════════════════════════════════════════════
// Public types
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single keyword rule.
 *
 * `keywordGroups` is an array of groups — AND across groups, OR within each group.
 *
 * Examples:
 *   [["fed"], ["rate cut", "cut rates"]]
 *     → question must contain "fed" AND ("rate cut" OR "cut rates")
 *
 *   [["oil", "crude", "brent", "opec"]]
 *     → question must contain at least one of "oil", "crude", "brent", "opec"
 */
export interface KeywordRule {
  keywordGroups: string[][];
  domains: DomainType[];
  /** Specific stock codes. Empty array means "use entire watchlist". */
  stocks: string[];
  direction: "bullish" | "bearish" | "neutral";
  reasoning: string;
}

export interface CascadeMapping {
  /** All affected sectors (union across matched rules, deduplicated). */
  sectors: DomainType[];
  /** All affected stock codes (union across matched rules, deduplicated). */
  stocks: string[];
  direction: "bullish" | "bearish" | "neutral";
  /** True when at least one rule matched. */
  matched: boolean;
  /** Concatenated reasoning from all matching rules. */
  reasoning: string;
  /** Confidence score in [0, 1]: proportion of matched rules that agree on direction. */
  confidence: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Built-in keyword rules (R01–R14)
// ═══════════════════════════════════════════════════════════════════════════

const BUILT_IN_RULES: KeywordRule[] = [
  // R01 — Fed rate CUT → banking bullish
  {
    keywordGroups: [["fed", "federal reserve"], ["rate cut", "cut rates", "interest rate cut", "rate reduction"]],
    domains: ["banking"],
    stocks: ["VCB", "TCB", "BID", "CTG"],
    direction: "bullish",
    reasoning: "Fed rate cut lowers global borrowing costs → positive for VN banking sector (lower funding costs, credit growth)",
  },

  // R02 — Fed rate HIKE → banking bearish
  {
    keywordGroups: [["fed", "federal reserve"], ["rate hike", "rate rise", "tighten", "raise rates", "increase rates"]],
    domains: ["banking"],
    stocks: ["VCB", "TCB", "BID", "CTG"],
    direction: "bearish",
    reasoning: "Fed rate hike tightens global liquidity → capital outflows from VN, pressure on VND, NIM squeeze for banks",
  },

  // R03 — China tariffs / trade barriers (explicit China mention) → steel/manufacturing bearish
  {
    keywordGroups: [["china"], ["tariff", "trade war", "trade barrier"]],
    domains: ["steel"],
    stocks: ["HPG", "GAS"],
    direction: "bearish",
    reasoning: "China trade friction reduces regional supply chain activity → steel demand drop hurts HPG",
  },

  // R04 — US-China trade war (broader phrasing) → steel bearish
  {
    keywordGroups: [["us-china", "sino-american", "america china"]],
    domains: ["steel"],
    stocks: ["HPG", "GAS"],
    direction: "bearish",
    reasoning: "US-China trade tensions reduce regional manufacturing orders, hurting VN steel exports",
  },

  // R05 — Oil / crude / brent / OPEC → oil_gas neutral (price-direction-dependent)
  {
    keywordGroups: [["oil", "crude", "brent", "opec", "petroleum"]],
    domains: ["oil_gas"],
    stocks: ["GAS", "PLX"],
    direction: "neutral",
    reasoning: "Oil market news affects GAS/PLX directly; direction depends on whether price is rising or falling",
  },

  // R06 — Vietnam GDP / economy → all watchlist bullish
  {
    keywordGroups: [["vietnam"], ["gdp", "growth", "economy", "economic"]],
    domains: ["banking", "real_estate", "tech", "retail"],
    stocks: [],   // empty → inject watchlist
    direction: "bullish",
    reasoning: "Strong Vietnam GDP growth lifts broad market sentiment, benefits entire watchlist",
  },

  // R07 — ASEAN / Southeast Asia → all watchlist neutral
  {
    keywordGroups: [["asean", "southeast asia", "sea region"]],
    domains: ["banking", "real_estate", "logistics"],
    stocks: [],
    direction: "neutral",
    reasoning: "ASEAN-level events have broad but modest impact on VN equities; direction depends on context",
  },

  // R08 — War / conflict / sanctions / military → all watchlist bearish
  {
    keywordGroups: [["war", "conflict", "sanctions", "military", "invasion", "geopolit"]],
    domains: ["banking", "oil_gas", "steel", "aviation"],
    stocks: [],
    direction: "bearish",
    reasoning: "Geopolitical conflict and sanctions elevate global risk-off sentiment, hurting VN equities broadly",
  },

  // R09 — China economy slowdown → manufacturing/steel/tech bearish
  {
    keywordGroups: [["china"], ["gdp", "economy", "slowdown", "recession", "slow growth"]],
    domains: ["steel", "tech"],
    stocks: ["HPG", "FPT"],
    direction: "bearish",
    reasoning: "China slowdown reduces demand for VN exports (steel, electronics assembly components)",
  },

  // R10 — Dollar / DXY strength → banking+retail bearish
  {
    keywordGroups: [["dollar", "dxy", "usd strength", "strong usd", "us dollar"]],
    domains: ["banking", "retail"],
    stocks: ["VCB", "VNM"],
    direction: "bearish",
    reasoning: "USD strength pressures VND, increases import costs for retail and squeezes bank FX margins",
  },

  // R11 — Inflation / CPI → banking+retail bearish
  {
    keywordGroups: [["inflation", "cpi", "consumer price"]],
    domains: ["banking", "retail"],
    stocks: ["VCB", "MWG"],
    direction: "bearish",
    reasoning: "High inflation erodes consumer purchasing power (retail) and prompts rate hikes (banking pressure)",
  },

  // R12 — Tariff / import duty / trade barrier (generic, not China-specific) → manufacturing bearish
  {
    keywordGroups: [["tariff", "import duty", "trade barrier", "anti-dumping"]],
    domains: ["steel", "agriculture"],
    stocks: ["HPG", "VNM"],
    direction: "bearish",
    reasoning: "Trade barriers reduce export competitiveness for VN steel and agriculture",
  },

  // R13 — Taiwan / Taiwan Strait → tech+manufacturing bearish
  {
    keywordGroups: [["taiwan", "taiwan strait"]],
    domains: ["tech", "steel"],
    stocks: ["FPT", "HPG"],
    direction: "bearish",
    reasoning: "Taiwan Strait tensions disrupt semiconductor supply chain → VN tech/manufacturing sector disruption",
  },

  // R14 — Federal Reserve (standalone mention, no specific direction) → banking neutral
  {
    keywordGroups: [["federal reserve"]],
    domains: ["banking"],
    stocks: ["VCB", "TCB", "BID", "CTG"],
    direction: "neutral",
    reasoning: "Federal Reserve policy changes broadly affect VN banking via global liquidity channels",
  },

  // R15 — Gold → banking+retail (safe haven demand, inflation hedge)
  {
    keywordGroups: [["gold", "gold price", "precious metal"]],
    domains: ["gold_mining", "banking", "retail"],
    stocks: ["PNJ", "VCB"],
    direction: "bullish",
    reasoning: "Rising gold prices benefit PNJ (jewellery/retail gold) and signal global risk-off (mixed for banks)",
  },

  // R16 — Interest rates (generic, no Fed qualifier)
  {
    keywordGroups: [["interest rate", "central bank rate", "policy rate"]],
    domains: ["banking", "real_estate"],
    stocks: ["VCB", "TCB"],
    direction: "neutral",
    reasoning: "Generic interest rate changes affect banking NIM and real estate financing costs",
  },

  // R17 — US recession → broad market bearish
  {
    keywordGroups: [["us recession", "american recession", "recession in the us", "recession in us"]],
    domains: ["tech", "banking", "logistics"],
    stocks: ["FPT", "VCB", "GMD"],
    direction: "bearish",
    reasoning: "US recession shrinks export demand (tech/manufacturing) and tightens global credit",
  },

  // R18 — Seafood / shrimp / fisheries export
  {
    keywordGroups: [["seafood", "shrimp", "fisheries", "aquaculture"]],
    domains: ["agriculture"],
    stocks: ["VHC", "ANV", "IDI"],
    direction: "neutral",
    reasoning: "Seafood trade news directly affects VN seafood exporters (VHC, ANV)",
  },

  // R19 — Real estate / property market
  {
    keywordGroups: [["real estate", "property market", "housing market", "mortgage"]],
    domains: ["real_estate", "banking"],
    stocks: ["VIC", "NVL", "PDR"],
    direction: "neutral",
    reasoning: "Real estate market conditions affect VIC/NVL/PDR valuations and bank mortgage books",
  },

  // R20 — Energy transition / EV / electric vehicle
  {
    keywordGroups: [["electric vehicle", "ev sales", "energy transition", "renewable energy"]],
    domains: ["automotive", "utilities"],
    stocks: ["VEA", "REE", "POW"],
    direction: "bullish",
    reasoning: "EV and renewable energy growth benefits VEA (automotive JV) and utilities (REE/POW)",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Matching helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns true if ALL keyword groups have at least one match in the question.
 * Matching is case-insensitive.
 */
function ruleMatches(q: string, rule: KeywordRule): boolean {
  return rule.keywordGroups.every((group) =>
    group.some((kw) => q.includes(kw.toLowerCase())),
  );
}

function dedup<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

// ═══════════════════════════════════════════════════════════════════════════
// Public entry point
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Maps a prediction market question to affected VN sectors and stocks.
 *
 * @param question       - The market question string (any case).
 * @param watchlistCodes - All stock codes currently in the user's watchlist.
 *                         Used when a rule has an empty stocks[] array.
 * @param customRules    - Optional additional rules injected at runtime.
 *                         Evaluated BEFORE built-in rules (custom rules win direction).
 * @returns CascadeMapping with matched=true when at least one rule fired.
 */
export function mapPredictionToCascade(
  question: string,
  watchlistCodes: string[],
  customRules?: KeywordRule[],
): CascadeMapping {
  const q = question.toLowerCase();

  const allRules: KeywordRule[] = [
    ...(customRules ?? []),
    ...BUILT_IN_RULES,
  ];

  const matchedRules = allRules.filter((rule) => ruleMatches(q, rule));

  if (matchedRules.length === 0) {
    return {
      sectors: [],
      stocks: [],
      direction: "neutral",
      matched: false,
      reasoning: "",
      confidence: 0,
    };
  }

  // Union of all sectors
  const sectors = dedup(matchedRules.flatMap((r) => r.domains)) as DomainType[];

  // Union of all stocks; rules with empty stocks[] inject the full watchlist
  const stocks = dedup(
    matchedRules.flatMap((r) => (r.stocks.length > 0 ? r.stocks : watchlistCodes)),
  );

  // First matching rule determines the primary direction (matchedRules.length >= 1 guaranteed above)
  const firstRule = matchedRules[0]!;
  const direction = firstRule.direction;

  // Concatenate all reasoning strings
  const reasoning = matchedRules.map((r) => r.reasoning).join("; ");

  // Confidence: proportion of matched rules that agree with the primary direction
  const agreeing = matchedRules.filter((r) => r.direction === direction).length;
  const confidence = parseFloat((agreeing / matchedRules.length).toFixed(4));

  return {
    sectors,
    stocks,
    direction,
    matched: true,
    reasoning,
    confidence,
  };
}
