/**
 * Prediction Cascade Mapper — Task 165
 *
 * Maps a prediction question (text + tags) to affected Vietnamese sectors
 * and stocks via 14 keyword rules (R01–R14).
 *
 * Rules cover:
 *   R01 — Fed rate cut
 *   R02 — Fed rate hike
 *   R03 — Oil price rise
 *   R04 — Oil price fall
 *   R05 — Gold price rise
 *   R06 — US-China trade tensions (AND-groups: tariff context + China context)
 *   R07 — Vietnam GDP / economic growth
 *   R08 — ASEAN / regional integration
 *   R09 — War / armed conflict
 *   R10 — Sanctions
 *   R11 — Inflation
 *   R12 — Currency / USD strength
 *   R13 — Tech / semiconductor boom
 *   R14 — China economy slowdown
 *
 * Keyword matching semantics:
 *   - keywordGroups: string[][] — AND across groups, OR within each group.
 *     Every group must have at least one keyword present in the combined
 *     text (questionText + tags joined).
 *   - Matching is case-insensitive.
 *
 * Pure domain service — no I/O, no side effects.
 *
 * Layer: domain/services
 */

import type { DomainType } from "../../../bctc-schema.js";

// ═══════════════════════════════════════════════════════════════════════════
// Public interfaces
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A single keyword rule mapping a macro event to affected VN sectors/stocks.
 *
 * keywordGroups semantics:
 *   AND across groups — every group must match.
 *   OR within a group — any keyword in the group is sufficient.
 *
 * @example
 * // R06: US-China trade — requires BOTH a tariff word AND a China word
 * {
 *   id: "R06",
 *   keywordGroups: [
 *     ["tariff", "trade war", "trade tension"],   // group 1 — tariff context
 *     ["china", "beijing", "prc", "chinese"],     // group 2 — China context
 *   ],
 *   ...
 * }
 */
export interface KeywordRule {
  /** Unique rule identifier, e.g. "R01" */
  id: string;
  /**
   * Two-dimensional keyword matrix.
   * Outer array: AND-groups (all must match).
   * Inner array: OR-alternatives within a group (any one suffices).
   */
  keywordGroups: string[][];
  /** VN sectors affected by this macro event */
  sectors: DomainType[];
  /** Representative VN stock codes affected */
  stocks: string[];
  /** Net directional bias for these sectors/stocks */
  direction: "bullish" | "bearish" | "neutral";
}

/**
 * Result of a single rule firing for the given input.
 */
export interface CascadeMapping {
  /** Which rule produced this mapping */
  ruleId: string;
  /** Affected VN sectors */
  sectors: DomainType[];
  /** Affected VN stock codes */
  stocks: string[];
  /** Directional bias for the sectors/stocks */
  direction: "bullish" | "bearish" | "neutral";
  /** The specific keywords that triggered the match (one per AND-group) */
  matchedKeywords: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Keyword rules R01–R14
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The 14 macro keyword rules.
 *
 * Each keywordGroups entry is an AND-group of OR-alternatives.
 * A rule fires when EVERY group has at least one matching keyword in the text.
 */
const KEYWORD_RULES: KeywordRule[] = [
  // ── R01: Fed rate cut ──────────────────────────────────────────────────
  {
    id: "R01",
    keywordGroups: [
      [
        "rate cut", "rate cuts", "lãi suất giảm", "cắt giảm lãi suất",
        "interest rate cut", "fed cuts", "dovish", "lower rates",
        "easing", "lowers rates", "cuts interest", "cut interest",
        "cuts rates", "cut rates", "reducing rates", "reduce rates",
      ],
    ],
    sectors: ["real_estate", "banking", "securities", "utilities"],
    stocks: ["VIC", "VHM", "NVL", "VCB", "TCB", "SSI", "REE"],
    direction: "bullish",
  },

  // ── R02: Fed rate hike ─────────────────────────────────────────────────
  {
    id: "R02",
    keywordGroups: [
      [
        "rate hike", "rate hikes", "lãi suất tăng", "tăng lãi suất",
        "interest rate hike", "interest rate increase", "fed hike",
        "fed raises", "hawkish", "tightening", "hikes interest",
        "hike interest", "hikes rates", "hike rates", "raises rates",
        "raise rates", "raising rates", "increases rates",
      ],
    ],
    sectors: ["real_estate", "banking", "securities"],
    stocks: ["VIC", "VHM", "NVL", "KDH", "VCB", "SSI"],
    direction: "bearish",
  },

  // ── R03: Oil price rise ────────────────────────────────────────────────
  {
    id: "R03",
    keywordGroups: [
      [
        "oil price rise", "oil price surge", "oil price up", "oil prices rise",
        "oil prices surge", "oil prices up", "crude oil up", "crude oil rise",
        "crude surging", "crude prices surge", "crude prices surging",
        "oil rise", "oil surge", "oil surging", "oil prices surging",
        "giá dầu tăng", "dầu thô tăng", "opec cut", "opec cuts",
      ],
    ],
    sectors: ["oil_gas", "aviation"],
    stocks: ["GAS", "PLX", "PVD", "PVS", "BSR", "OIL"],
    direction: "bullish",
  },

  // ── R04: Oil price fall ────────────────────────────────────────────────
  {
    id: "R04",
    keywordGroups: [
      [
        "oil price fall", "oil price drop", "oil price down", "oil prices fall",
        "oil prices drop", "oil price decline", "crude oil down", "crude oil fall",
        "crude falls", "crude drops", "oil fall", "oil drop",
        "giá dầu giảm", "dầu thô giảm",
      ],
    ],
    sectors: ["oil_gas", "aviation"],
    stocks: ["GAS", "PLX", "PVD", "HVN", "VJC"],
    direction: "bearish",
  },

  // ── R05: Gold price rise ───────────────────────────────────────────────
  {
    id: "R05",
    keywordGroups: [
      [
        "gold price", "gold prices", "gold rise", "gold surge", "gold rally",
        "gold up", "gold hit", "gold record", "giá vàng", "vàng tăng",
        "vàng lên", "gold", "vàng",
      ],
    ],
    sectors: ["gold_mining", "banking", "insurance"],
    stocks: ["PNJ", "SJC", "BVH", "PVI"],
    direction: "bullish",
  },

  // ── R06: US-China trade tensions (AND: tariff context + China context) ─
  {
    id: "R06",
    keywordGroups: [
      [
        "tariff", "tariffs", "trade war", "trade tension", "trade tensions",
        "trade dispute", "trade conflict", "trade restriction", "trade ban",
        "import duty", "export control", "decoupling",
      ],
      [
        "china", "chinese", "beijing", "prc", "sino", "trung quốc",
        "bắc kinh", "chiến tranh thương mại",
      ],
    ],
    sectors: ["tech", "steel", "agriculture", "retail"],
    stocks: ["FPT", "HPG", "HSG", "VHC", "ANV", "MWG"],
    direction: "bearish",
  },

  // ── R07: Vietnam GDP / economic growth ────────────────────────────────
  {
    id: "R07",
    keywordGroups: [
      [
        "vietnam gdp", "vietnam economy", "gdp vietnam", "vn gdp",
        "vietnam growth", "tăng trưởng gdp", "tăng trưởng kinh tế",
        "kinh tế việt nam", "gdp việt nam", "việt nam tăng trưởng",
      ],
    ],
    sectors: ["securities", "banking", "real_estate", "retail"],
    stocks: ["SSI", "VND", "HCM", "VCB", "BID", "VIC", "MWG"],
    direction: "bullish",
  },

  // ── R08: ASEAN / regional integration ─────────────────────────────────
  {
    id: "R08",
    keywordGroups: [
      [
        "asean", "rcep", "afta", "regional trade", "southeast asia trade",
        "regional integration", "free trade agreement", "fta", "hiệp định thương mại",
        "cộng đồng kinh tế asean", "aec",
      ],
    ],
    sectors: ["retail", "logistics", "agriculture", "tech"],
    stocks: ["MWG", "FRT", "DGW", "GMD", "STG", "VHC", "FPT"],
    direction: "bullish",
  },

  // ── R09: War / armed conflict ──────────────────────────────────────────
  {
    id: "R09",
    keywordGroups: [
      [
        "war", "armed conflict", "military conflict", "warfare", "combat",
        "invasion", "attack", "missile", "airstrike", "bombing",
        "chiến tranh", "xung đột vũ trang", "tấn công quân sự",
        "xung đột", "bùng nổ chiến sự",
      ],
    ],
    sectors: ["aviation", "oil_gas", "insurance", "securities"],
    stocks: ["HVN", "VJC", "GAS", "PLX", "BVH", "SSI"],
    direction: "bearish",
  },

  // ── R10: Sanctions ─────────────────────────────────────────────────────
  {
    id: "R10",
    keywordGroups: [
      [
        "sanction", "sanctions", "sanctioned", "economic sanction",
        "financial sanction", "trade sanction", "export ban",
        "cấm vận", "trừng phạt kinh tế", "trừng phạt tài chính",
      ],
    ],
    sectors: ["banking", "steel", "oil_gas"],
    stocks: ["VCB", "BID", "HPG", "HSG", "GAS", "PVS"],
    direction: "bearish",
  },

  // ── R11: Inflation ─────────────────────────────────────────────────────
  {
    id: "R11",
    keywordGroups: [
      [
        "inflation", "cpi", "consumer price", "price pressure",
        "inflationary", "price surge", "cost of living",
        "lạm phát", "chỉ số giá tiêu dùng", "giá cả tăng",
        "áp lực lạm phát",
      ],
    ],
    sectors: ["banking", "real_estate", "retail", "utilities"],
    stocks: ["VCB", "BID", "VIC", "MWG", "REE"],
    direction: "neutral",
  },

  // ── R12: Currency / USD strength ──────────────────────────────────────
  {
    id: "R12",
    keywordGroups: [
      [
        "usd", "dollar", "dxy", "dollar strength", "dollar rally",
        "usd/vnd", "usd vnd", "vnd weakens", "dong depreciates",
        "đồng đô la", "tỷ giá usd", "đô la tăng", "usd mạnh",
      ],
    ],
    sectors: ["aviation", "steel", "oil_gas", "agriculture"],
    stocks: ["HVN", "VJC", "HPG", "GAS", "VHC"],
    direction: "bearish",
  },

  // ── R13: Tech / semiconductor boom ────────────────────────────────────
  {
    id: "R13",
    keywordGroups: [
      [
        "semiconductor", "chip", "ai chip", "silicon", "wafer",
        "nvidia", "tsmc", "tech boom", "tech rally", "technology boom",
        "ai boom", "artificial intelligence", "data center",
        "bán dẫn", "chip bán dẫn", "công nghệ", "trí tuệ nhân tạo",
      ],
    ],
    sectors: ["tech", "utilities", "real_estate"],
    stocks: ["FPT", "CMG", "ELC", "REE"],
    direction: "bullish",
  },

  // ── R14: China economy slowdown ───────────────────────────────────────
  {
    id: "R14",
    keywordGroups: [
      [
        "china slowdown", "china gdp miss", "china economy slows",
        "china economy slowdown", "chinese economy slowdown",
        "chinese economy", "china growth slows", "china weakness",
        "china deflation", "china contraction", "china misses",
        "china gdp misses", "china economy", "chinese economy slows",
        "kinh tế trung quốc", "trung quốc tăng trưởng chậm",
        "suy thoái trung quốc", "trung quốc chậm lại",
      ],
    ],
    sectors: ["steel", "agriculture", "oil_gas", "aviation"],
    stocks: ["HPG", "HSG", "NKG", "VHC", "ANV", "GAS", "HVN"],
    direction: "bearish",
  },

  // ── R15: Taiwan conflict / strait tension — supply chain disruption ────
  // Task 1233: Polymarket markets about Taiwan conflict have clear exposure
  // to VN stocks via semiconductor and electronics supply chains.
  //   - FPT: tech supply chain (semiconductors sourced from Taiwan/TSMC)
  //   - VEA (Vinamotor): auto parts supply chain from Taiwan
  //   - GEX (Gelex): electronics manufacturing with Taiwan components
  // Keyword matching requires a Taiwan context; war/conflict context is
  // OR-within-group, so any single Taiwan-related keyword fires the rule.
  {
    id: "R15",
    keywordGroups: [
      [
        "taiwan", "taiwan strait", "taiwan conflict", "taiwan invasion",
        "taiwan war", "taiwan crisis", "cross-strait", "strait of taiwan",
        "đài loan", "eo biển đài loan", "xung đột đài loan",
        "taiwan semiconductor", "tsmc conflict",
      ],
    ],
    sectors: ["tech", "automotive"],
    stocks: ["FPT", "VEA", "GEX"],
    direction: "bearish",
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Sports / Entertainment filter — Task 1219
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Keywords that identify sports or entertainment prediction markets.
 * These have no relevance to the Vietnamese financial market and should be
 * discarded before any VN sector mapping is attempted.
 *
 * Matching is case-insensitive substring search on the question title.
 */
const SPORTS_ENTERTAINMENT_KEYWORDS: ReadonlyArray<string> = [
  // Sports competitions
  "world cup",
  "super bowl",
  "champions league",
  "nba championship",
  "nba finals",
  "nfl ",
  "nba ",
  "mlb ",
  "nhl ",
  "fifa",
  "uefa",
  "premier league",
  "la liga",
  "bundesliga",
  "serie a",
  "olympic",
  "olympics",
  "formula 1",
  "formula one",
  "wimbledon",
  "grand slam",
  "boxing",
  "heavyweight",
  "ufc",
  "wrestle",
  "wrestling",
  "esports",
  "e-sports",
  // Awards / entertainment
  "oscar",
  "academy award",
  "grammy",
  "emmy",
  "bafta",
  "golden globe",
  "cannes",
  "film festival",
  "box office",
  "music award",
];

/**
 * Returns true when the prediction market title is about sports or entertainment
 * and has no VN financial market relevance.
 *
 * Task 1219: Polymarket and similar markets about sports outcomes / entertainment
 * events should be excluded from VN sector mapping.
 *
 * @param questionText - The prediction market question / title
 * @returns true if the question is about sports or entertainment
 */
export function isSportsOrEntertainmentMarket(questionText: string): boolean {
  const lower = questionText.toLowerCase();
  return SPORTS_ENTERTAINMENT_KEYWORDS.some((kw) => lower.includes(kw));
}

// ═══════════════════════════════════════════════════════════════════════════
// Core matching logic
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a rule fires for the given normalized text.
 *
 * AND-across-groups: every group must have at least one keyword matched.
 * OR-within-group: any keyword in the group is sufficient.
 *
 * @returns Array of matched keywords (one representative per AND-group),
 *          or null if the rule does not fire.
 */
function matchRule(rule: KeywordRule, normalizedText: string): string[] | null {
  const matchedPerGroup: string[] = [];

  for (const group of rule.keywordGroups) {
    let groupMatch: string | null = null;
    for (const keyword of group) {
      if (normalizedText.includes(keyword.toLowerCase())) {
        groupMatch = keyword;
        break; // OR — first match in the group wins
      }
    }
    if (groupMatch === null) {
      // This AND-group has no match — rule does not fire
      return null;
    }
    matchedPerGroup.push(groupMatch);
  }

  return matchedPerGroup;
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map a prediction question to affected Vietnamese sectors and stocks.
 *
 * Evaluates all 14 keyword rules against the combined input text
 * (questionText + space-joined tags).  Returns one CascadeMapping per
 * rule that fires.  No rule fires twice — each ruleId appears at most once.
 *
 * Pure function — synchronous, no I/O, no side effects.
 *
 * @param questionText - Free-form prediction question or news headline
 * @param tags         - Optional structured tags (appended to search text)
 * @returns            Array of CascadeMapping, one per fired rule
 */
export function mapPredictionToVn(
  questionText: string,
  tags: string[],
): CascadeMapping[] {
  // Combine all input into a single normalised string for matching
  const combined = [questionText, ...tags].join(" ").toLowerCase();

  // Early exit — nothing to match
  if (combined.trim().length === 0) {
    return [];
  }

  // Task 1219: discard sports/entertainment markets — they have no VN relevance
  if (isSportsOrEntertainmentMarket(questionText)) {
    return [];
  }

  const results: CascadeMapping[] = [];

  for (const rule of KEYWORD_RULES) {
    const matchedKeywords = matchRule(rule, combined);
    if (matchedKeywords === null) continue; // rule did not fire

    results.push({
      ruleId: rule.id,
      sectors: rule.sectors,
      stocks: rule.stocks,
      direction: rule.direction,
      matchedKeywords,
    });
  }

  return results;
}
