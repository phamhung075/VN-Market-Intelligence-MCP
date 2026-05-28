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
 * adapters. Approved exceptions:
 *  - RssItem structural import (plain data, no behavior)
 *  - formatAnalysisNewsSummary from infrastructure/adapters/analysisFormatters (Task 1300b fix)
 */

import type { RssItem } from "../models/shared-types.js";
import type { DomainType } from "../../../bctc-schema.js";
import { STOCK_CATALOG, detectStocksInText, stripSourceAttributionSuffix } from "./stockAliases.js";
import { truncateNewsSummary } from "./textUtils.js";

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
  /** 'news' for RSS items, 'prediction_market' for Polymarket signals */
  sourceType: "news" | "prediction_market";
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
// HTML entity decoding — shared normalisation for ALL news paths
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Decode HTML numeric entities (&#NNN;, &#xHH;) and orphan fragments (#NNN;)
 * left by cheerio XML-mode or VPS proxy scripts that skip entity decoding.
 * Also decodes the 5 named XML entities (&amp; &lt; &gt; &quot; &apos;).
 *
 * Safe to call on already-decoded text — decoded characters won't match.
 */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex as string, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n as string)))
    .replace(/(?<![&])#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n as string)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
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
  logistics: [
    "logistics",
    "vận tải",
    "vận chuyển",
    "kho vận",
    "chuỗi cung ứng",
    "supply chain",
    "gmd",
    "gemadept",
    "stg",
    "sotrans",
    "vtp",
    "viettelpost",
    "freight",
    "shipping",
    "cảng",
    "port",
  ],
  gold_mining: [
    "vàng",
    "gold",
    "pnj",
    "sjc",
    "khai thác vàng",
    "gold mining",
    "precious metals",
    "kim loại quý",
  ],
  automotive: [
    "ô tô",
    "xe hơi",
    "xe máy",
    "honda",
    "toyota",
    "ford",
    "veam",
    "automotive",
    "automobile",
    "lắp ráp ô tô",
    "công nghiệp ô tô",
  ],
  construction: [
    "xây dựng",
    "hạ tầng",
    "cao tốc",
    "cầu đường",
    "đầu tư công",
    "capex",
    "infrastructure",
    "construction",
    "hhv",
    "ctd",
    "vcg",
  ],
  energy: [
    "năng lượng tái tạo",
    "điện mặt trời",
    "điện gió",
    "solar",
    "wind power",
    "geg",
    "renewable energy",
    "điện sạch",
  ],
  machinery: [
    "máy móc",
    "công nghiệp",
    "cơ khí",
    "machinery",
    "industrial",
    "manufacturing",
    "dag",
    "da nang rubber",
    "cao su đà nẵng",
    "thiết bị công nghiệp",
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
  chemicals: [
    "hóa chất",
    "phân bón",
    "dầu thô",
    "petrochemical",
    "chemical",
    "dgc",
    "dpm",
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
 * All ticker codes in STOCK_CATALOG — pre-built once at module load.
 * Used by extractStockTickers() alias-fallback path (Task 1253).
 */
const ALL_CATALOG_CODES: string[] = Object.keys(STOCK_CATALOG);

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

/**
 * Currency-context exclusion map.
 * Key: uppercase ticker that shares its name with a currency/unit abbreviation.
 * Value: lowercase context tokens — if any appear in the 40-char window around
 *        a Pattern-2 match, that match is discarded as a currency reference.
 *
 * Task 1198: guard "VND" (VNDirect Securities) against ISO-4217 currency hits
 * in forex articles (e.g. "USD/VND tăng", "tỷ giá USD/VND").
 * Pattern 1 (parenthetical) is NOT guarded — "(VND)" always means the ticker.
 */
const CURRENCY_CONTEXT_MAP: Map<string, string[]> = new Map([
  [
    "VND",
    [
      "usd/vnd", "vnd/usd", "tỷ giá", "exchange rate",
      "đồng/usd", "billion vnd", "tỷ vnd", "nghìn tỷ vnd",
      "triệu vnd", "tỷ đồng", "nghìn tỷ đồng", "mệnh giá",
      "currency", "/vnd", "vnd/",
    ],
  ],
]);

/**
 * Geographic-context exclusion map — Task 1788.
 *
 * Certain VN stock tickers share their code with Vietnamese city / province
 * abbreviations. When those abbreviations appear in text, Pattern 2 extracts
 * the code as a false-positive ticker alert.
 *
 * Key: uppercase ticker code.
 * Value: lowercase substrings that, when found in the 10-character window
 *        IMMEDIATELY BEFORE the matched token (look-behind), indicate the
 *        token is a geographic reference, not a stock ticker.
 *
 * Example (Task 1788):
 *   "TP.HCM" → dot is a \b boundary → Pattern 2 extracts "HCM"
 *   "TP HCM" → space is a \b boundary → Pattern 2 extracts "HCM"
 *   "TPHCM"  → H starts a new word at boundary → Pattern 2 extracts "HCM"
 *
 * Pattern 1 (parenthetical "HCM") is NOT guarded — "(HCM)" always means
 * the securities company ticker.
 *
 * Look-behind window: 10 chars (covers "tphcm ", "tp.hcm", "tp hcm" etc.)
 */
const GEOGRAPHIC_CONTEXT_MAP: Map<string, string[]> = new Map([
  [
    "HCM",
    [
      "tp.hcm", "tp hcm", "tphcm",
      "tp.", "tp ",
      "tp. hcm",  // dot-space variant — belt-and-suspenders for TP. HCM (HCM-D1)
      "tp-hcm",   // hyphen variant — genuine gap (HCM-D1)
      "thành phố hồ chí minh", "thanh pho ho chi minh",
      "thành phố hcm", "thanh pho hcm",
    ],
  ],
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
 *
 * Handles:
 *  - Standard uppercase tickers: "HPG tăng mạnh"
 *  - Tickers in parentheses: "Vietcombank (VCB)" or "Vietcombank (vcb)"
 *  - Lowercase tickers: "vcb" → "VCB"
 *  - Filters against KNOWN_VN_STOCKS (2-5 uppercase letters after normalization)
 */
function extractStockTickers(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  // Pattern 1: tickers in parentheses (case-insensitive), e.g. "(VCB)" or "(vcb)"
  const parenMatches = text.matchAll(/\(([A-Za-z]{2,5})\)/gi);
  for (const m of parenMatches) {
    const code = m[1]!.toUpperCase();
    if (KNOWN_VN_STOCKS.has(code) && !seen.has(code)) {
      found.push(code);
      seen.add(code);
    }
  }

  // Pattern 2: standalone word-boundary matches (2-5 letters, any case)
  // Use case-insensitive flag and normalise to uppercase for lookup
  const wordMatches = text.matchAll(/\b([A-Za-z]{2,5})\b/g);
  for (const m of wordMatches) {
    const code = m[1]!.toUpperCase();
    if (!KNOWN_VN_STOCKS.has(code) || seen.has(code)) continue;

    // Currency-context guard: check 40-char window around match (Task 1198)
    const currencyContextTokens = CURRENCY_CONTEXT_MAP.get(code);
    if (currencyContextTokens) {
      const matchStart = m.index ?? 0;
      const windowStart = Math.max(0, matchStart - 40);
      const windowEnd = Math.min(text.length, matchStart + code.length + 40);
      const window = text.slice(windowStart, windowEnd).toLowerCase();
      if (currencyContextTokens.some((tok) => window.includes(tok))) continue;
    }

    // Geographic-context guard: check 10-char look-behind window (Task 1788)
    // Prevents "TP.HCM", "TP HCM", "TPHCM" from firing the HCM ticker alert.
    const geographicPrefixes = GEOGRAPHIC_CONTEXT_MAP.get(code);
    if (geographicPrefixes) {
      const matchStart = m.index ?? 0;
      const lookBehindStart = Math.max(0, matchStart - 10);
      const lookBehindWindow = text.slice(lookBehindStart, matchStart + code.length).toLowerCase();
      if (geographicPrefixes.some((prefix) => lookBehindWindow.includes(prefix))) continue;
    }

    found.push(code);
    seen.add(code);
  }

  // Pattern 3: Alias-based company-name resolution (Task 1253)
  // Scan text against ALL STOCK_CATALOG entries using detectStocksInText().
  // This catches articles that mention "Novaland", "Vingroup", "Phạm Nhật Vượng"
  // without including the literal ticker code (NVL, VIC, etc.).
  // Only tickers not already found via patterns 1/2 are checked to avoid duplicates.
  const remainingCodes = ALL_CATALOG_CODES.filter((c) => !seen.has(c));
  if (remainingCodes.length > 0) {
    const aliasHits = detectStocksInText(text, remainingCodes);
    for (const code of aliasHits) {
      if (!seen.has(code)) {
        found.push(code);
        seen.add(code);
      }
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
  // Task 1213: normalize all incoming text to NFC before any processing.
  // Vietnamese text can arrive in NFD (combining diacritics) form from RSS
  // feeds, SSC portal, and VPS proxy scripts. NFD form breaks keyword matching
  // because "Việt Nam" NFD !== "Việt Nam" NFC.
  const title = decodeHtmlEntities((item.title?.trim() ?? "").normalize("NFC"));
  const content = decodeHtmlEntities((item.content?.trim() ?? "").normalize("NFC"));
  const source = item.source?.toLowerCase() ?? "";

  // Combined lowercase text for keyword scanning
  const combinedLower = (title + " " + content).toLowerCase();

  // ── Domain detection ────────────────────────────────────────────────────
  const { domains: affectedDomains, matchedKeywords: domainKeywords } =
    detectDomains(combinedLower);

  // ── Stock ticker extraction ──────────────────────────────────────────────
  // Bug 1311: strip source attribution suffix (e.g. " - MSN", " - Reuters") from
  // title BEFORE NER so attribution tokens are never treated as stock tickers.
  // Only the title carries the suffix; content field does not.
  const cleanTitle = stripSourceAttributionSuffix(title);
  // Use original case (tickers are uppercase)
  const affectedActions = extractStockTickers(cleanTitle + " " + content);

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
  const summary = truncateNewsSummary(rawSummary);

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
