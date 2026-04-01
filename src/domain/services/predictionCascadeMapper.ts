/**
 * Prediction Cascade Mapper — Domain Service
 *
 * Maps prediction market questions to affected Vietnamese stock sectors
 * and individual stocks via ordered keyword rules.
 *
 * Matching semantics: AND across keywordGroups, OR within each group.
 * e.g. [["fed"], ["rate cut", "cut rates"]] means:
 *   question must contain "fed" AND ("rate cut" OR "cut rates").
 *
 * For multi-rule matches: sectors and stocks are unioned; direction is taken
 * from the first matching rule; reasoning concatenates all matching reasonings.
 *
 * Rules with stocks=[] expand to the provided watchlistCodes at runtime.
 *
 * Layer: domain/services — pure, no I/O, no infrastructure imports.
 */

import type { DomainType } from "../../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface KeywordRule {
  /**
   * Matching semantics: AND across groups, OR within each group.
   * e.g. [["fed"], ["rate cut", "cut rates"]] means:
   *   question must contain "fed" AND ("rate cut" OR "cut rates").
   * For simple single-keyword rules: [["oil"]] or [["oil","crude","brent"]].
   */
  keywordGroups: string[][];
  domains: DomainType[];
  /** Stock codes this rule applies to. Empty array means "all watchlist codes". */
  stocks: string[];
  direction: "bullish" | "bearish" | "neutral";
  reasoning: string;
}

export interface CascadeMapping {
  domains: DomainType[];
  stocks: string[];
  direction: "bullish" | "bearish" | "neutral";
  /** True if at least one keyword rule matched. */
  matched: boolean;
  reasoning: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in keyword rules (ordered by specificity — most specific first)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 15 built-in rules covering major macro/geopolitical themes that affect the
 * Vietnamese stock market. Rule order matters: the first match wins for
 * direction when rules conflict.
 */
const BUILT_IN_RULES: KeywordRule[] = [
  // R01: Fed rate cut → banking bullish
  {
    keywordGroups: [
      ["fed"],
      ["rate cut", "cut rates", "interest rate cut", "rate reduction"],
    ],
    domains: ["banking"],
    stocks: ["VCB", "TCB", "BID", "CTG"],
    direction: "bullish",
    reasoning: "Fed rate cut reduces borrowing costs → VN banking sector bullish (VCB, TCB, BID, CTG)",
  },

  // R02: Fed rate hike → banking bearish
  {
    keywordGroups: [
      ["fed"],
      ["rate hike", "rate rise", "tighten", "raise rates"],
    ],
    domains: ["banking"],
    stocks: ["VCB", "TCB", "BID", "CTG"],
    direction: "bearish",
    reasoning: "Fed rate hike tightens global liquidity → VN banking sector bearish (VCB, TCB, BID, CTG)",
  },

  // R03: China tariff/trade war → steel + oil_gas bearish
  {
    keywordGroups: [
      ["china"],
      ["tariff", "trade war", "trade barrier"],
    ],
    domains: ["steel", "oil_gas"],
    stocks: ["HPG", "GAS"],
    direction: "bearish",
    reasoning: "China trade barriers reduce VN steel and energy export demand → HPG, GAS bearish",
  },

  // R04: US–China trade war → steel + oil_gas bearish
  {
    keywordGroups: [
      ["us-china", "us china", "sino-american"],
    ],
    domains: ["steel", "oil_gas"],
    stocks: ["HPG", "GAS"],
    direction: "bearish",
    reasoning: "US–China trade war disrupts global supply chains → VN steel and energy bearish (HPG, GAS)",
  },

  // R05: Oil/crude/Brent/OPEC → oil_gas neutral (price direction unclear without trend)
  {
    keywordGroups: [
      ["oil", "crude", "brent", "opec"],
    ],
    domains: ["oil_gas", "aviation"],
    stocks: ["GAS", "PLX", "HVN", "VJC"],
    direction: "neutral",
    reasoning: "Oil price movement affects oil_gas (GAS, PLX) and aviation costs (HVN, VJC) — direction depends on price trend",
  },

  // R06: Vietnam GDP/growth/economy → all watchlist bullish
  {
    keywordGroups: [
      ["vietnam", "vietnamese"],
      ["gdp", "growth", "economy", "economic"],
    ],
    domains: ["banking", "tech", "retail", "real_estate"],
    stocks: [],
    direction: "bullish",
    reasoning: "Strong Vietnam GDP / economic growth → broad VN market bullish; all watchlist stocks benefit",
  },

  // R07: ASEAN / Southeast Asia → all watchlist neutral
  {
    keywordGroups: [
      ["asean", "southeast asia", "south-east asia"],
    ],
    domains: ["banking", "logistics", "retail"],
    stocks: [],
    direction: "neutral",
    reasoning: "ASEAN regional event → moderate broad VN market impact; watchlist stocks neutral",
  },

  // R08: War / conflict / sanctions / military → all watchlist bearish
  {
    keywordGroups: [
      ["war", "conflict", "sanctions", "military strike", "invasion"],
    ],
    domains: ["oil_gas", "aviation", "steel"],
    stocks: [],
    direction: "bearish",
    reasoning: "Geopolitical conflict / sanctions → risk-off sentiment; all VN watchlist stocks bearish",
  },

  // R09: China GDP/economy/slowdown/recession → steel + tech bearish
  {
    keywordGroups: [
      ["china"],
      ["gdp", "economy", "slowdown", "recession", "slump"],
    ],
    domains: ["steel", "tech"],
    stocks: ["HPG", "FPT"],
    direction: "bearish",
    reasoning: "China economic slowdown reduces demand for VN steel exports and tech outsourcing → HPG, FPT bearish",
  },

  // R10: Dollar / DXY / USD strength → banking + retail bearish
  {
    keywordGroups: [
      ["dollar", "dxy", "usd strength", "us dollar"],
    ],
    domains: ["banking", "retail"],
    stocks: ["VCB", "VNM"],
    direction: "bearish",
    reasoning: "Strong USD / DXY weakens VND → VN banks face higher USD debt costs (VCB), import-dependent retail (VNM) bearish",
  },

  // R11: Inflation / CPI → banking + retail bearish
  {
    keywordGroups: [
      ["inflation", "cpi", "consumer price"],
    ],
    domains: ["banking", "retail"],
    stocks: ["VCB", "MWG"],
    direction: "bearish",
    reasoning: "High inflation erodes consumer purchasing power → VN retail (MWG) and banking (VCB) margin pressure bearish",
  },

  // R12: Tariff / import duty / trade barrier (standalone, non-China-specific) → manufacturing bearish
  {
    keywordGroups: [
      ["tariff", "import duty", "trade barrier", "import tariff"],
    ],
    domains: ["steel", "logistics"],
    stocks: ["HPG", "VNM"],
    direction: "bearish",
    reasoning: "New tariffs / import duties raise input costs → VN manufacturers (HPG) and consumer goods (VNM) bearish",
  },

  // R13: Taiwan / Taiwan Strait → tech + steel bearish
  {
    keywordGroups: [
      ["taiwan", "taiwan strait"],
    ],
    domains: ["tech", "steel"],
    stocks: ["FPT", "HPG"],
    direction: "bearish",
    reasoning: "Taiwan Strait tensions disrupt semiconductor supply chains → VN tech (FPT) and steel (HPG) bearish",
  },

  // R14: Federal Reserve standalone (catches broader Fed mentions without specific rate action)
  {
    keywordGroups: [
      ["federal reserve"],
    ],
    domains: ["banking"],
    stocks: ["VCB", "TCB", "BID", "CTG"],
    direction: "neutral",
    reasoning: "Federal Reserve policy uncertainty → VN banking sector neutral until direction is clear (VCB, TCB, BID, CTG)",
  },

  // R15: Gold → gold_mining + banking neutral (SBV reserves)
  {
    keywordGroups: [
      ["gold", "gold price", "precious metal"],
    ],
    domains: ["gold_mining", "banking"],
    stocks: ["PNJ", "VCB"],
    direction: "neutral",
    reasoning: "Gold price movement affects gold retailer PNJ and SBV foreign reserves (VCB) — direction depends on trend",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Rule matching logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the question satisfies all keyword groups of the rule.
 * AND across groups, OR within each group.
 */
function ruleMatches(rule: KeywordRule, questionLower: string): boolean {
  return rule.keywordGroups.every((group) =>
    group.some((keyword) => questionLower.includes(keyword.toLowerCase())),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a prediction market question to affected VN sectors and stocks.
 *
 * @param question       - The market question string (any case)
 * @param watchlistCodes - All stock codes currently in the user's watchlist
 *                         Used to expand rules with stocks=[]
 * @param customRules    - Optional additional rules injected at runtime
 *                         (for testing or future extension). Evaluated BEFORE
 *                         built-in rules so callers can override defaults.
 * @returns CascadeMapping with matched=false and empty arrays if no rule fires
 */
export function mapPredictionToCascade(
  question: string,
  watchlistCodes: string[],
  customRules?: KeywordRule[],
): CascadeMapping {
  const questionLower = question.toLowerCase();
  const allRules = [...(customRules ?? []), ...BUILT_IN_RULES];

  const matchingRules = allRules.filter((rule) =>
    ruleMatches(rule, questionLower),
  );

  if (matchingRules.length === 0) {
    return {
      domains: [],
      stocks: [],
      direction: "neutral",
      matched: false,
      reasoning: "",
    };
  }

  // Union all domains (deduplicated)
  const domainsSet = new Set<DomainType>();
  for (const rule of matchingRules) {
    for (const d of rule.domains) {
      domainsSet.add(d);
    }
  }

  // Union all stocks (deduplicated)
  // Rules with stocks=[] contribute all watchlistCodes
  const stocksSet = new Set<string>();
  for (const rule of matchingRules) {
    if (rule.stocks.length === 0) {
      for (const code of watchlistCodes) {
        stocksSet.add(code);
      }
    } else {
      for (const code of rule.stocks) {
        stocksSet.add(code);
      }
    }
  }

  // Direction from the first matching rule (matchingRules.length > 0 is guaranteed above)
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const direction = matchingRules[0]!.direction;

  // Reasoning: concatenate all matching rule reasonings
  const reasoning = matchingRules.map((r) => r.reasoning).join("; ");

  return {
    domains: Array.from(domainsSet),
    stocks: Array.from(stocksSet),
    direction,
    matched: true,
    reasoning,
  };
}
