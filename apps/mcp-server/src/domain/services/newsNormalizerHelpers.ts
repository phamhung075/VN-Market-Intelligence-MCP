/**
 * News Normalizer — Pure Helper Functions (FACTORY-DOMAIN-split-newsNormalizer)
 *
 * Pure functions consumed by `normalizeNews()` in `newsNormalizer.ts`:
 * HTML-entity decoding, keyword scanning, stock-ticker extraction, domain
 * detection, level/sentiment classification, impact-score/confidence
 * computation, and the decision-résumé builder.
 *
 * This is a verbatim, behavior-preserving extraction — no logic change.
 * The core normalization ALGORITHM (orchestration order, field assembly)
 * stays in `newsNormalizer.ts`; `newsNormalizer.ts` re-exports the
 * previously-public members (`decodeHtmlEntities`, `truncateAt120`,
 * `buildDecisionResume`) unchanged so every existing
 * `import ... from "./newsNormalizer.js"` call site keeps working.
 *
 * Layer: domain/services — must not import from application/ or infrastructure/
 * adapters. Approved exceptions:
 *  - STOCK_CATALOG / detectStocksInText structural import (plain data + pure
 *    function, no behavior) — same exception carried over from newsNormalizer.ts.
 */

import type { DomainType } from "../../../bctc-schema.js";
import type { AnalysisLevel, Sentiment, ImpactDirection, TimeHorizon } from "./newsNormalizerTypes.js";
import {
  GLOBAL_KEYWORDS,
  COUNTRY_KEYWORDS,
  DOMAIN_KEYWORD_MAP,
  BULLISH_KEYWORDS,
  BEARISH_KEYWORDS,
  KNOWN_VN_STOCKS,
  CURRENCY_CONTEXT_MAP,
  GEOGRAPHIC_CONTEXT_MAP,
  DOMAIN_VN_LABEL,
} from "./newsNormalizerTables.js";
import { STOCK_CATALOG, detectStocksInText } from "./stockAliases.js";

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

/**
 * All ticker codes in STOCK_CATALOG — pre-built once at module load.
 * Used by extractStockTickers() alias-fallback path (Task 1253).
 */
const ALL_CATALOG_CODES: string[] = Object.keys(STOCK_CATALOG);

// ═══════════════════════════════════════════════════════════════════════════
// Classification helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Scan text for any keyword from a list.
 * Returns the matched keyword or null.
 */
export function findKeyword(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

/**
 * Collect all matching keywords from a list (deduplicated).
 */
export function collectKeywords(text: string, keywords: string[]): string[] {
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
export function extractStockTickers(text: string): string[] {
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
export function detectDomains(text: string): {
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
export function classifyLevel(
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
export function detectSentiment(text: string): Sentiment {
  const bullishHits = collectKeywords(text, BULLISH_KEYWORDS).length;
  const bearishHits = collectKeywords(text, BEARISH_KEYWORDS).length;

  if (bearishHits > 0 && bearishHits >= bullishHits) return "bearish";
  if (bullishHits > 0) return "bullish";
  return "neutral";
}

/**
 * Map sentiment to impact direction.
 */
export function sentimentToDirection(s: Sentiment): ImpactDirection {
  if (s === "bullish") return "up";
  if (s === "bearish") return "down";
  return "neutral";
}

/**
 * Map analysis level to time horizon.
 * global/action → short; country/domain → medium
 */
export function levelToTimeHorizon(level: AnalysisLevel): TimeHorizon {
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
export function computeImpactScore(
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
export function parsePublishedAt(raw: string): string {
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

/**
 * Determine confidence based on level and number of matched keywords.
 */
export function computeConfidence(level: AnalysisLevel, keywordCount: number): number {
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
// Decision résumé helpers (FR-1 — FEAT-NEWS-DECISION-RESUME)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Hard-cap at 120 characters, breaking at the last space before the limit.
 * If no space is found before the limit, hard-cuts at 120.
 * Returns the string unchanged if it is ≤ 120 chars.
 */
export function truncateAt120(s: string): string {
  if (s.length <= 120) return s;
  const window = s.slice(0, 120);
  const lastSpace = window.lastIndexOf(" ");
  return lastSpace > 0 ? s.slice(0, lastSpace) : window;
}

/**
 * Build a plain-Vietnamese decision résumé from signals already computed in
 * normalizeNews(). Pure function — no I/O, no LLM, no fabrication.
 *
 * Returns null for neutral sentiment (no verdict to surface).
 * Algorithm per FR-1 spec (BA-FEAT-NEWS-DECISION-RESUME):
 *   prefix → context suffix → keywords → compose → truncateAt120
 */
export function buildDecisionResume(
  sentiment: Sentiment,
  level: AnalysisLevel,
  affectedActions: string[],
  affectedDomains: DomainType[],
  bullishMatched: string[],
  bearishMatched: string[],
): string | null {
  if (sentiment === "neutral") return null;

  // 1. Prefix
  const prefix = sentiment === "bullish" ? "Tích cực" : "Tiêu cực";

  // 2. Signal keywords — first 2 from the relevant matched list
  const keywords =
    sentiment === "bullish"
      ? bullishMatched.slice(0, 2)
      : bearishMatched.slice(0, 2);

  // 3. Context suffix (priority: action tickers > domain > none)
  let context = "";
  if (level === "action" && affectedActions.length > 0) {
    context = ` cho ${affectedActions.slice(0, 3).join(", ")}`;
  } else if (affectedDomains.length > 0) {
    const vnNames = affectedDomains
      .slice(0, 2)
      .map((d) => DOMAIN_VN_LABEL[d as string])
      .filter((v): v is string => v != null);
    if (vnNames.length > 0) {
      context = ` ngành ${vnNames.join(", ")}`;
    }
  }

  // 4. Compose
  const body =
    keywords.length > 0
      ? `${prefix}${context}: ${keywords.join(", ")}`
      : `${prefix}${context}: tín hiệu tổng hợp`;

  // 5. Hard-cap
  return truncateAt120(body);
}
