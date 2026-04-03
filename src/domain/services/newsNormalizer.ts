/**
 * News Normalizer — Task 061
 *
 * Pure domain function that converts a raw RssItem into a typed AnalysisEntry
 * domain object for consumption by the causal cascade engine.
 *
 * Design notes:
 *  - No async, no I/O, no side effects.
 *  - RssItem is imported from infrastructure/fetchers/rss.ts because it is a
 *    plain data interface with no behavior — permitted per FR-061-7 and the
 *    DDD import boundary note in TECH-004.
 *  - DomainType is imported from bctc-schema.ts (root-level schema).
 *
 * Layer: domain/services — must not import from application/ or infrastructure/
 * adapters. The RssItem structural import is the sole approved exception.
 */

import type { RssItem } from "../../infrastructure/fetchers/rss.js";
import type { DomainType } from "../../../bctc-schema.js";

// ═══════════════════════════════════════════════════════════════════════════
// Exported types
// ═══════════════════════════════════════════════════════════════════════════

export type AnalysisLevel = "global" | "country" | "domain" | "action";
export type Sentiment = "bullish" | "bearish" | "neutral";
export type ImpactDirection = "up" | "down" | "neutral";
export type TimeHorizon = "short" | "medium" | "long";

export interface AnalysisEntry {
  /** Unique identifier: `analysis-${Date.now()}-${random}` */
  id: string;
  level: AnalysisLevel;
  /** RssItem.title or '(no title)' if empty */
  sourceTitle: string;
  /** RssItem.url */
  sourceUrl: string;
  /** Always 'news' for RSS items */
  sourceType: "news";
  /** ISO 8601 timestamp derived from RssItem.publishedAt */
  publishedAt: string;
  sentiment: Sentiment;
  /** 0–10 integer */
  impactScore: number;
  impactDirection: ImpactDirection;
  /** 0–1 confidence estimate */
  confidence: number;
  timeHorizon: TimeHorizon;
  /** (title + '. ' + content).slice(0, 500) */
  summary: string;
  /** Short classification justification */
  reasoning: string;
  /** ['VN'] for Vietnamese sources by default */
  affectedCountries: string[];
  affectedDomains: DomainType[];
  /** Matched VN stock tickers */
  affectedActions: string[];
  /** Always [] at normalization time */
  parentIds: string[];
  /** Matched keywords, deduplicated, lowercase, max 10 */
  tags: string[];
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal constants
// ═══════════════════════════════════════════════════════════════════════════

const GLOBAL_KEYWORDS: string[] = [
  "fed",
  "fomc",
  "federal reserve",
  "oil price",
  "crude oil",
  "opec",
  "usd",
  "us dollar",
  "gdp",
  "inflation",
  "interest rate",
  "rate hike",
  "rate cut",
  "world bank",
  "imf",
  "g7",
  "g20",
  "nasdaq",
  "dow jones",
  "s&p 500",
  "s&p500",
  "giá dầu",
  "dầu thô",
  "fed tăng lãi suất",
  "fed cắt giảm",
  "lạm phát toàn cầu",
  "chiến tranh thương mại",
];

const COUNTRY_KEYWORDS: string[] = [
  "vn-index",
  "vnindex",
  "hose",
  "hnx",
  "upcom",
  "sbv",
  "nhnn",
  "ngân hàng nhà nước",
  "state bank of vietnam",
  "chính phủ việt nam",
  "bộ tài chính",
  "bộ kế hoạch đầu tư",
  "vietnam",
  "việt nam",
  "vnd",
  "đồng việt nam",
  "thị trường chứng khoán việt",
  "ủy ban chứng khoán",
];

const DOMAIN_KEYWORD_MAP: Record<DomainType, string[]> = {
  oil_gas: [
    "dầu khí",
    "khí đốt",
    "petrovietnam",
    "pvn",
    "xăng dầu",
    "giá xăng",
    "pvgas",
    "pvd",
    "oil",
    "gas",
    "petroleum",
    "lng",
  ],
  banking: [
    "ngân hàng",
    "bank",
    "lãi suất",
    "tín dụng",
    "huy động vốn",
    "npl",
    "nợ xấu",
    "vcb",
    "vietcombank",
    "bidv",
    "vietinbank",
    "tcb",
    "techcombank",
    "vpbank",
    "mb bank",
    "sacombank",
    "acb",
    "banking sector",
  ],
  real_estate: [
    "bất động sản",
    "real estate",
    "căn hộ",
    "nhà đất",
    "phân khúc",
    "dự án nhà ở",
    "vingroup",
    "vinhomes",
    "novaland",
    "phát đạt",
    "khang điền",
    "property",
    "housing",
  ],
  steel: [
    "thép",
    "steel",
    "hòa phát",
    "hsg",
    "nkg",
    "hpg",
    "tôn mạ",
    "cuộn cán",
    "phôi thép",
    "giá thép",
    "iron ore",
    "quặng sắt",
  ],
  aviation: [
    "hàng không",
    "aviation",
    "vietnam airlines",
    "hvn",
    "vietjet",
    "vjc",
    "máy bay",
    "sân bay",
    "airport",
    "airline",
    "nhiên liệu bay",
    "jet fuel",
  ],
  retail: [
    "bán lẻ",
    "retail",
    "mwg",
    "thế giới di động",
    "frt",
    "fpt retail",
    "dgw",
    "digiworld",
    "siêu thị",
    "chuỗi bán lẻ",
    "consumer electronics",
  ],
  tech: [
    "công nghệ",
    "technology",
    "tech",
    "fpt",
    "cmg",
    "phần mềm",
    "software",
    "it",
    "digital",
    "chuyển đổi số",
    "fintech",
    "startup",
  ],
  utilities: [
    "điện",
    "electricity",
    "năng lượng",
    "energy",
    "ree",
    "pc1",
    "pow",
    "điện lực",
    "evn",
    "thủy điện",
    "hydropower",
    "solar",
    "wind",
  ],
  agriculture: [
    "nông nghiệp",
    "agriculture",
    "thủy sản",
    "seafood",
    "hag",
    "vhc",
    "anv",
    "lúa gạo",
    "rice",
    "cà phê",
    "coffee",
    "cây trồng",
    "xuất khẩu nông sản",
  ],
  insurance: [
    "bảo hiểm",
    "insurance",
    "bvh",
    "baoviet",
    "pvi",
    "tái bảo hiểm",
    "reinsurance",
    "life insurance",
    "bảo hiểm nhân thọ",
  ],
  securities: [
    "chứng khoán",
    "securities",
    "ssi",
    "vnd",
    "hcm",
    "môi giới",
    "broker",
    "margin",
    "ký quỹ",
    "tự doanh",
    "custodian",
  ],
  pharma: [
    "dược",
    "pharma",
    "dhg",
    "imp",
    "dmc",
    "thuốc",
    "medicine",
    "pharmaceutical",
    "y tế",
    "healthcare",
    "vaccine",
  ],
  pharmaceutical: [
    "dược phẩm",
    "pharmaceutical",
    "dược hậu giang",
    "imexpharm",
    "bidiphar",
    "pymepharco",
    "traphaco",
    "opc pharma",
    "thuốc điều trị",
    "đăng ký lưu hành",
    "cục quản lý dược",
    "dav",
    "bệnh viện công",
    "đấu thầu thuốc",
    "vaccine distributor",
  ],
  other: [],
};

const BULLISH_KEYWORDS: string[] = [
  "tăng",
  "tăng trưởng",
  "lợi nhuận tăng",
  "vượt kế hoạch",
  "vượt dự báo",
  "khởi sắc",
  "tích cực",
  "surge",
  "rise",
  "rally",
  "growth",
  "profit",
  "beats",
  "exceeds",
  "bullish",
  "up",
  "higher",
  "strong",
  "record",
];

const BEARISH_KEYWORDS: string[] = [
  "giảm",
  "giảm mạnh",
  "thua lỗ",
  "khủng hoảng",
  "sụt giảm",
  "tiêu cực",
  "rủi ro",
  "fall",
  "drop",
  "decline",
  "loss",
  "crash",
  "crisis",
  "bearish",
  "down",
  "lower",
  "weak",
  "miss",
  "disappoints",
];

/**
 * Known VN stock tickers (HOSE / HNX / UPCOM).
 * Used for action-level classification and affectedActions population.
 */
const KNOWN_VN_STOCKS: Set<string> = new Set([
  // Banking
  "VCB", "BID", "CTG", "TCB", "VPB", "MBB", "STB", "ACB", "HDB", "EIB",
  // Oil & Gas
  "GAS", "PVD", "PVS", "OIL", "PLX", "BSR",
  // Real Estate
  "VIC", "VHM", "NVL", "PDR", "KDH", "DXG", "NLG",
  // Steel
  "HPG", "HSG", "NKG",
  // Aviation
  "HVN", "VJC",
  // Retail
  "MWG", "FRT", "DGW",
  // Tech
  "FPT", "CMG",
  // Utilities
  "REE", "PC1", "POW",
  // Agriculture
  "HAG", "VHC", "ANV",
  // Insurance
  "BVH", "PVI",
  // Securities
  "SSI", "VND", "HCM",
  // Pharma
  "DHG", "IMP", "DMC",
  // Others
  "VNM", "SAB", "MSN",
]);

// ═══════════════════════════════════════════════════════════════════════════
// Classification helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scan text for any keyword from a list.
 * Returns the matched keyword or null.
 */
function findKeyword(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

/**
 * Collect all matching keywords from a list (deduplicated).
 */
function collectKeywords(text: string, keywords: string[]): string[] {
  return keywords.filter((kw) => text.includes(kw));
}

/**
 * Extract all VN stock tickers mentioned in text.
 * Looks for 2–5 uppercase letter sequences that are in KNOWN_VN_STOCKS.
 */
function extractStockTickers(text: string): string[] {
  // Match sequences of 2-5 uppercase letters surrounded by word boundaries or spaces
  const matches = text.match(/\b[A-Z]{2,5}\b/g) ?? [];
  const found: string[] = [];
  const seen = new Set<string>();
  for (const m of matches) {
    if (KNOWN_VN_STOCKS.has(m) && !seen.has(m)) {
      found.push(m);
      seen.add(m);
    }
  }
  return found;
}

/**
 * Detect affected domains by scanning text for domain-specific keywords.
 * Returns both detected domains and all matched keywords.
 */
function detectDomains(text: string): {
  domains: DomainType[];
  matchedKeywords: string[];
} {
  const domains: DomainType[] = [];
  const matchedKeywords: string[] = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORD_MAP) as [
    DomainType,
    string[],
  ][]) {
    if (domain === "other") continue;
    const hit = findKeyword(text, keywords);
    if (hit) {
      domains.push(domain);
      matchedKeywords.push(...collectKeywords(text, keywords));
    }
  }

  return { domains, matchedKeywords };
}

/**
 * Classify the analysis level.
 *
 * Priority order (highest → lowest):
 *   1. Country keywords → 'country'  (VN-specific identifiers are the strongest signal)
 *   2. Global keywords → 'global'
 *   3. Source tiebreaker (reuters/ap_news → 'global'; cafef/vnexpress → 'country')
 *      Applied before domain/action so generic market news on global sources → global
 *   4. Explicit stock ticker match → 'action'
 *   5. Domain keyword match → 'domain'
 *   6. Default → 'country'
 *
 * Note: Country check fires before global so that "Vietnam NHNN interest rates"
 * (which also contains the global keyword "interest rate") is correctly classified
 * as 'country', not 'global'.
 */
function classifyLevel(
  text: string,
  source: string,
  hasStockMatch: boolean,
  hasDomainMatch: boolean,
): AnalysisLevel {
  // 1. Country-specific keywords take highest priority
  if (findKeyword(text, COUNTRY_KEYWORDS)) return "country";

  // 2. Global keywords
  if (findKeyword(text, GLOBAL_KEYWORDS)) return "global";

  // 3. Explicit stock ticker → action
  //    Checked before source tiebreaker: a known VN ticker is a strong, specific
  //    signal regardless of which source the item came from.
  if (hasStockMatch) return "action";

  // 4. Source tiebreaker — applied before domain so that:
  //    - generic market news on global sources (reuters/ap_news) → 'global'
  //    - generic market news on Vietnamese sources (cafef/vnexpress) → 'country'
  //    This prevents broad domain keywords (e.g. "chứng khoán" in a market
  //    overview headline) from promoting a country-level CafeF story to 'domain'.
  if (source === "reuters" || source === "ap_news") return "global";
  if (source === "cafef" || source === "vnexpress") return "country";

  // 5. Domain keyword match (only reached by non-Vietnamese, non-global-source items)
  if (hasDomainMatch) return "domain";

  // 6. Default
  return "country";
}

/**
 * Detect sentiment from combined text.
 * Bearish takes priority over bullish on a tie.
 */
function detectSentiment(text: string): Sentiment {
  const bullishHits = collectKeywords(text, BULLISH_KEYWORDS).length;
  const bearishHits = collectKeywords(text, BEARISH_KEYWORDS).length;

  if (bearishHits > 0 && bearishHits >= bullishHits) return "bearish";
  if (bullishHits > 0) return "bullish";
  return "neutral";
}

/**
 * Map sentiment to impact direction.
 */
function sentimentToDirection(s: Sentiment): ImpactDirection {
  if (s === "bullish") return "up";
  if (s === "bearish") return "down";
  return "neutral";
}

/**
 * Map analysis level to time horizon.
 * global/action → short; country/domain → medium
 */
function levelToTimeHorizon(level: AnalysisLevel): TimeHorizon {
  if (level === "global" || level === "action") return "short";
  return "medium";
}

/**
 * Compute impact score.
 *
 * base = 5
 * if any sentiment keyword in title → +2
 * for each additional keyword match (beyond first) → +1 (capped at +3)
 * if content is empty or < 50 chars → -1
 * final = clamp(base + adjustments, 0, 10)
 */
function computeImpactScore(
  titleText: string,
  content: string,
  allMatchedKeywords: string[],
): number {
  let score = 5;

  // +2 if sentiment keyword in title
  const titleLower = titleText.toLowerCase();
  const titleHasSentiment =
    findKeyword(titleLower, BULLISH_KEYWORDS) !== null ||
    findKeyword(titleLower, BEARISH_KEYWORDS) !== null;
  if (titleHasSentiment) score += 2;

  // +1 per additional keyword match beyond first (capped at +3)
  const extraKeywords = Math.min(Math.max(allMatchedKeywords.length - 1, 0), 3);
  score += extraKeywords;

  // -1 if empty or very short content
  if (!content || content.length < 50) score -= 1;

  return Math.max(0, Math.min(10, score));
}

/**
 * Parse publishedAt to ISO 8601.
 * Falls back to current timestamp on parse failure.
 */
function parsePublishedAt(raw: string): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

/**
 * Determine confidence based on level and number of matched keywords.
 */
function computeConfidence(level: AnalysisLevel, keywordCount: number): number {
  const base =
    level === "global"
      ? 0.75
      : level === "country"
        ? 0.65
        : level === "domain"
          ? 0.70
          : 0.80; // action level — ticker match is strong signal
  const boost = Math.min(keywordCount * 0.02, 0.15);
  return Math.min(1.0, base + boost);
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize a raw RSS item into a typed AnalysisEntry.
 *
 * Pure function — no async, no I/O, no side effects.
 *
 * @param item - Raw RSS item from any feed fetcher
 * @returns    - Fully populated AnalysisEntry ready for the cascade engine
 */
export function normalizeNews(item: RssItem): AnalysisEntry {
  const title = item.title?.trim() ?? "";
  const content = item.content?.trim() ?? "";
  const source = item.source?.toLowerCase() ?? "";

  // Combined lowercase text for keyword scanning
  const combinedLower = (title + " " + content).toLowerCase();

  // ── Domain detection ────────────────────────────────────────────────────
  const { domains: affectedDomains, matchedKeywords: domainKeywords } =
    detectDomains(combinedLower);

  // ── Stock ticker extraction ──────────────────────────────────────────────
  // Use original case (tickers are uppercase)
  const affectedActions = extractStockTickers(title + " " + content);

  // ── Level classification ─────────────────────────────────────────────────
  const level = classifyLevel(
    combinedLower,
    source,
    affectedActions.length > 0,
    affectedDomains.length > 0,
  );

  // ── Sentiment ────────────────────────────────────────────────────────────
  const sentiment = detectSentiment(combinedLower);
  const impactDirection = sentimentToDirection(sentiment);

  // ── Collect all matched keywords for tags + impact score ─────────────────
  const globalMatched = collectKeywords(combinedLower, GLOBAL_KEYWORDS);
  const countryMatched = collectKeywords(combinedLower, COUNTRY_KEYWORDS);
  const bullishMatched = collectKeywords(combinedLower, BULLISH_KEYWORDS);
  const bearishMatched = collectKeywords(combinedLower, BEARISH_KEYWORDS);

  const allMatchedKeywords = [
    ...globalMatched,
    ...countryMatched,
    ...domainKeywords,
    ...bullishMatched,
    ...bearishMatched,
  ];

  // ── Impact score ─────────────────────────────────────────────────────────
  const impactScore = computeImpactScore(title, content, allMatchedKeywords);

  // ── Tags (deduplicated, lowercase, max 10) ────────────────────────────────
  const rawTags = [
    ...allMatchedKeywords.map((k) => k.toLowerCase()),
    ...affectedDomains.map((d) => d.toLowerCase()),
    ...affectedActions.map((a) => a.toLowerCase()),
  ];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of rawTags) {
    if (!seen.has(t)) {
      seen.add(t);
      tags.push(t);
      if (tags.length >= 10) break;
    }
  }

  // ── Affected countries ───────────────────────────────────────────────────
  const isVietnameseSource = source === "cafef" || source === "vnexpress";
  const hasVietnamKeyword =
    findKeyword(combinedLower, COUNTRY_KEYWORDS) !== null ||
    combinedLower.includes("vietnam") ||
    combinedLower.includes("việt nam");

  let affectedCountries: string[];
  if (isVietnameseSource) {
    affectedCountries = ["VN"];
  } else if (hasVietnamKeyword) {
    affectedCountries = ["VN"];
  } else {
    affectedCountries = [];
  }

  // ── Time horizon ─────────────────────────────────────────────────────────
  const timeHorizon = levelToTimeHorizon(level);

  // ── Summary ──────────────────────────────────────────────────────────────
  const rawSummary =
    title && content
      ? `${title}. ${content}`
      : title
        ? title
        : content;
  const summary = rawSummary.slice(0, 500);

  // ── Reasoning ────────────────────────────────────────────────────────────
  const reasoningParts: string[] = [`Source: ${source || "unknown"}. Level: ${level}.`];
  if (level === "global" && globalMatched.length > 0) {
    reasoningParts.push(`Global keywords matched: ${globalMatched.slice(0, 3).join(", ")}.`);
  }
  if (level === "country" && countryMatched.length > 0) {
    reasoningParts.push(`Country keywords matched: ${countryMatched.slice(0, 3).join(", ")}.`);
  }
  if (affectedDomains.length > 0) {
    reasoningParts.push(`Domains detected: ${affectedDomains.join(", ")}.`);
  }
  if (affectedActions.length > 0) {
    reasoningParts.push(`Stocks mentioned: ${affectedActions.join(", ")}.`);
  }
  if (isVietnameseSource && level === "global") {
    reasoningParts.push("Global keyword override on Vietnamese source.");
  }
  if (!isVietnameseSource && level === "global" && globalMatched.length === 0) {
    reasoningParts.push("Source tiebreaker applied (reuters/ap_news → global).");
  }
  const reasoning = reasoningParts.join(" ");

  // ── Confidence ───────────────────────────────────────────────────────────
  const confidence = computeConfidence(level, allMatchedKeywords.length);

  // ── ID ───────────────────────────────────────────────────────────────────
  const id = `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    level,
    sourceTitle: title || "(no title)",
    sourceUrl: item.url ?? "",
    sourceType: "news",
    publishedAt: parsePublishedAt(item.publishedAt),
    sentiment,
    impactScore,
    impactDirection,
    confidence,
    timeHorizon,
    summary,
    reasoning,
    affectedCountries,
    affectedDomains,
    affectedActions,
    parentIds: [],
    tags,
    createdAt: new Date().toISOString(),
  };
}
