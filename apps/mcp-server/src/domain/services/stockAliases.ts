/**
 * Stock Alias Detection — Domain Service
 *
 * size-justification: ~267L — cohesive detection-logic file: one private
 * text-normaliser, the two NORMALISED_ALIASES/NORMALISED_CONTEXT_GUARDS
 * derived-map builder IIFEs (both depend on normalizeText + the imported
 * STOCK_CATALOG, must stay beside it), and 5 public detection functions
 * that all share those two maps as private module state. Splitting further
 * would force the maps to be re-exported as public API or duplicated —
 * either weakens encapsulation or reintroduces the divergence risk this
 * task exists to remove. FACTORY-DOMAIN-relocate-stock-catalog
 * (2026-06-15 maintainability factory audit) relocated the raw data table
 * (STOCK_CATALOG + StockCatalogEntry, ~575L) to ./stockAliases/catalog.ts —
 * this file now holds ONLY detection logic, imports the table unchanged.
 *
 * CANONICAL source of truth for Vietnamese stock ticker metadata:
 *   - Display name (companyName)
 *   - Searchable aliases (Vietnamese + English, with and without diacritics)
 *
 * Consumed by:
 *   - `stockSearch.ts`   — builds the user-facing MCP search catalogue by
 *                          merging STOCK_CATALOG with sector/exchange from
 *                          SECTOR_PEERS via getStockProfile().
 *   - `pollNews.ts`, `cascadeEngine.ts`, `legalRiskDetector.ts` — use
 *                          detectStocksInText() to spot ticker mentions in
 *                          free-text news articles.
 *
 * Design rules:
 * - Zero imports from infrastructure or application layers (DDD: domain-only).
 * - No runtime I/O, no side effects, no mutation.
 * - ONE place to add a ticker. To register a new stock end-to-end you need:
 *     1. `SECTOR_PEERS` in sectorPeers.ts       — classification + exchange
 *     2. `STOCK_CATALOG` in stockAliases/catalog.ts — display name + aliases
 *     3. `mcp.config.json` market.watchlist     — if it should be a default
 *
 * @module domain/services/stockAliases
 */

import { STOCK_CATALOG, type StockCatalogEntry } from "./stockAliases/catalog.js";

// Re-exported unchanged for existing consumers (stockSearch.ts,
// newsNormalizer.ts, domain/services/index.ts barrel) — pure relocation,
// no import-path changes required at any call site.
export { STOCK_CATALOG, type StockCatalogEntry };

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalise a string for alias comparison:
 *   1. Unicode NFD decomposition (separates base chars from combining marks)
 *   2. Strip all Unicode combining marks (diacritics) via regex category \p{M}
 *   3. Lowercase
 *
 * @example
 *   normalizeText("Hòa Phát")  // → "hoa phat"
 *   normalizeText("Vinamilk")  // → "vinamilk"
 */
function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Pre-normalised alias lookup (built once at module load)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-normalised alias map: all alias strings are passed through
 * normalizeText() once at module load. Call-time normalisation of
 * the incoming text is all that remains.
 */
const NORMALISED_ALIASES: Record<string, string[]> = (() => {
  const result: Record<string, string[]> = {};
  for (const [code, entry] of Object.entries(STOCK_CATALOG)) {
    result[code.toUpperCase()] = entry.aliases.map(normalizeText);
  }
  return result;
})();

/**
 * Pre-normalised context guard map (Task 1220).
 * Maps ticker → { normAlias → normContextKeywords[] }.
 * When an alias has a context guard, at least one context keyword must
 * appear in the text for the match to count.
 */
const NORMALISED_CONTEXT_GUARDS: Record<string, Record<string, string[]>> = (() => {
  const result: Record<string, Record<string, string[]>> = {};
  for (const [code, entry] of Object.entries(STOCK_CATALOG)) {
    if (!entry.aliasContextGuards) continue;
    const guardMap: Record<string, string[]> = {};
    for (const [alias, contextKws] of Object.entries(entry.aliasContextGuards)) {
      guardMap[normalizeText(alias)] = contextKws.map(normalizeText);
    }
    result[code.toUpperCase()] = guardMap;
  }
  return result;
})();

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all known aliases for a ticker, already normalised via normalizeText().
 * Returns [] for unknown codes. Never throws.
 *
 * @param code - Stock ticker, e.g. "VNM". Case-insensitive — normalised to
 *               uppercase internally.
 */
export function getAliasesForCode(code: string): string[] {
  return NORMALISED_ALIASES[code.toUpperCase()] ?? [];
}

/**
 * Return the display name for a ticker, or null if unknown.
 *
 * @param code - Stock ticker, case-insensitive.
 */
export function getCompanyName(code: string): string | null {
  return STOCK_CATALOG[code.toUpperCase()]?.companyName ?? null;
}

/**
 * Detect which watchlistCodes have an alias appearing in text.
 *
 * Alias detection is purely substring-based (consistent with the
 * existing ticker scan in newsNormalizer.ts).
 *
 * Normalises text once, then checks each alias as a substring.
 * Returns a deduplicated list of matched codes. Order is not significant.
 * Returns [] for empty text, empty watchlist, or no match. Never throws.
 *
 * Performance note: the alias map is a static pre-built object (no I/O).
 * At 50 watchlist codes × ~7 aliases = ~350 substring checks per call.
 * For 500-char text this completes in < 2 ms.
 *
 * @param text           - Article title + summary concatenated
 * @param watchlistCodes - Ticker codes to check, e.g. ["VNM", "FPT"]
 */
export function detectStocksInText(
  text: string,
  watchlistCodes: string[],
): string[] {
  if (!text || watchlistCodes.length === 0) return [];

  const normText = normalizeText(text);
  const matched = new Set<string>();

  for (const code of watchlistCodes) {
    const upperCode = code.toUpperCase();
    const aliases = NORMALISED_ALIASES[upperCode];
    if (!aliases || aliases.length === 0) continue;

    const contextGuards = NORMALISED_CONTEXT_GUARDS[upperCode];

    for (const alias of aliases) {
      if (isWordBoundaryMatch(normText, alias)) {
        // Check context guard: if this alias requires context keywords,
        // at least one must appear in the text (Task 1220).
        const requiredContextKws = contextGuards?.[alias];
        if (requiredContextKws && requiredContextKws.length > 0) {
          const hasContext = requiredContextKws.some((kw) => normText.includes(kw));
          if (!hasContext) continue; // alias matched but context missing — skip
        }
        matched.add(upperCode);
        break; // one alias match is enough for this code
      }
    }
  }

  return Array.from(matched);
}

/**
 * Check if `alias` appears in `text` as a whole-word match.
 * A match is valid only if the characters immediately before and after
 * the alias are non-alphanumeric (or start/end of string).
 *
 * This prevents "kinh do" from matching inside "kinh doanh" (business),
 * which caused KDC false positives on every article mentioning commerce.
 */
function isWordBoundaryMatch(text: string, alias: string): boolean {
  let startIdx = 0;
  while (true) {
    const idx = text.indexOf(alias, startIdx);
    if (idx === -1) return false;

    const beforeOk = idx === 0 || !isAlphanumeric(text[idx - 1]!);
    const afterIdx = idx + alias.length;
    const afterOk = afterIdx >= text.length || !isAlphanumeric(text[afterIdx]!);

    if (beforeOk && afterOk) return true;
    startIdx = idx + 1;
  }
}

function isAlphanumeric(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||  // 0-9
    (code >= 65 && code <= 90) ||  // A-Z
    (code >= 97 && code <= 122)    // a-z
  );
}

/**
 * Whole-word ticker match for direct mentions in article text.
 *
 * Returns true only when `ticker` (case-insensitive) appears in `text`
 * surrounded by non-alphanumeric characters (or string boundaries).
 *
 * This prevents prefix collisions such as "BID" matching "Bidiphar":
 *   tickerWholeWordMatch("bidiphar muốn chào bán", "BID") → false
 *   tickerWholeWordMatch("cổ phiếu bid tăng mạnh", "BID") → true
 *
 * Edge-case safety:
 *   - Tickers with digits (VN30, HNX30) work because isAlphanumeric covers 0-9.
 *   - Punctuation boundaries (parentheses, commas, dots) are treated as
 *     non-alphanumeric, so "(bid)" correctly matches.
 *
 * @param text   - lowercased article title + summary
 * @param ticker - stock code (e.g. "BID", "FPT") — case-insensitive
 */
export function tickerWholeWordMatch(text: string, ticker: string): boolean {
  return isWordBoundaryMatch(text, ticker.toLowerCase());
}

/**
 * Strip news-source attribution suffix from a headline.
 *
 * News aggregators (MSN, Reuters, Bloomberg, etc.) append " - SOURCE" at the
 * end of syndicated headlines. This suffix is a standalone uppercase token
 * that collides with VN stock tickers (e.g. "- MSN" fires Masan Group alert).
 *
 * Rule: strip trailing " - TOKEN" when TOKEN is either:
 *   a) A short alpha-only token (2–5 chars, covers most VN/short sources), OR
 *   b) A known news-source name (covers longer sources like Reuters, Bloomberg)
 *
 * Does NOT strip:
 *   - Generic English words not in the known-sources list ("BUSINESS", "MARKETS")
 *   - Tokens containing digits (preserves index names like "VN30")
 *   - " - TOKEN" patterns that appear mid-headline (only last occurrence via $)
 *
 * @param headline - raw article title as stored (not yet lowercased)
 * @returns headline with attribution suffix removed, trimmed
 */
const KNOWN_NEWS_SOURCES = /^(Reuters|Bloomberg|AFP|AP|BBC|CNN|CNBC|FT|WSJ|NYT|SCMP|VNExpress|Cafef|Dantri|Vneconomy|Investing|Marketwatch|Kitco|Nasdaq|Barrons)$/i;

export function stripSourceAttributionSuffix(headline: string): string {
  if (!headline) return headline;
  const match = headline.match(/ - ([A-Za-z]+)$/);
  if (!match) return headline;
  const token: string = match[1] ?? "";
  if (!token) return headline;
  // Strip if token is a known source name OR is a short alpha-only code (2-5 chars, no digits)
  if (KNOWN_NEWS_SOURCES.test(token) || (token.length >= 2 && token.length <= 5)) {
    return headline.slice(0, headline.length - match[0].length).trimEnd();
  }
  return headline;
}
