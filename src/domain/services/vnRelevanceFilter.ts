/**
 * VN Relevance Pre-filter — Task 1247
 *
 * Pure domain function that gates non-VN articles before they enter the
 * causal cascade.  Articles from non-Vietnamese sources are discarded unless
 * they contain at least one VN market signal:
 *   - The literal words "vietnam" or "việt nam" (case-insensitive)
 *   - Exchange identifiers: VN-Index, HOSE, HNX, UPCOM, VNINDEX
 *   - Known VN stock ticker codes (2-5 upper-case letters from KNOWN_VN_STOCKS)
 *
 * Vietnamese sources (cafef, vnexpress, vneconomy, vietstock, vietnambiz,
 * vnbusiness, tuoitre, nhandan, nld, vps) always pass through — they are
 * presumed relevant by editorial selection or VPS origin.
 *
 * Design:
 *   - Pure function — no I/O, no side effects, no async.
 *   - Layer: domain/services — no infrastructure imports.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Source identifiers treated as Vietnamese-origin.
 * Articles from these sources always pass the relevance gate.
 */
export const VN_SOURCE_IDS: ReadonlyArray<string> = [
  // Pre-existing local fetchers
  "cafef",
  "vnexpress",
  "vneconomy",
  // VPS-push-only sources (Sprint 103) — exclusively Vietnamese financial content;
  // never require keyword scan to confirm VN relevance.
  "vietstock",
  "vietnambiz",
  "vnbusiness",
  "tuoitre",
  "nhandan",
  "nld",
  // Generic VPS fallback: push handler sets source to "vps" when source field is
  // missing from the pushed item. Treat as VN-relevant (VPS only serves VN sources).
  "vps",
];

/** VN exchange/index keywords (all lowercase, matched case-insensitively). */
const VN_EXCHANGE_KEYWORDS: ReadonlyArray<string> = [
  "vn-index",
  "vnindex",
  "hose",
  "hnx",
  "upcom",
];

/** Core geographic keywords (all lowercase). */
const VN_GEO_KEYWORDS: ReadonlyArray<string> = [
  "vietnam",
  "việt nam",
  "viet nam",
];

/**
 * Known VN stock ticker codes — kept minimal to avoid false positives on
 * generic English words.  Only tickers that are unlikely to appear in
 * non-market English text are listed here.
 *
 * Pattern: word-boundary match on the combined lowercase text.
 */
const KNOWN_VN_TICKERS: ReadonlyArray<string> = [
  // Banking
  "vcb", "bid", "ctg", "tcb", "vpb", "mbb", "stb", "acb", "hdb",
  // Oil & Gas
  "gas", "pvd", "pvs", "plx", "bsr",
  // Real Estate
  "vic", "vhm", "nvl", "pdr", "kdh", "dxg", "nlg",
  // Steel
  "hpg", "hsg", "nkg",
  // Aviation
  "hvn", "vjc",
  // Retail
  "mwg", "frt", "dgw",
  // Tech
  "fpt", "cmg",
  // Utilities
  "ree", "pc1", "pow",
  // Agriculture
  "hag", "vhc", "anv",
  // Insurance
  "bvh", "pvi",
  // Securities
  "ssi", "hcm",
  // Pharma
  "dhg", "imp", "dmc",
  // Others
  "vnm", "sab", "msn",
];

// Pre-build ticker word-boundary regexes once at module load.
const TICKER_REGEXES: ReadonlyArray<RegExp> = KNOWN_VN_TICKERS.map(
  (t) => new RegExp(`(?:^|[^a-z])${t}(?:[^a-z]|$)`),
);

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input shape for the relevance check.
 */
export interface VnRelevanceInput {
  /** Article headline */
  title: string;
  /** Article body / summary (may be empty) */
  content: string;
  /** Source identifier, e.g. "cafef", "reuters", "tradingeconomics" */
  source: string;
}

/**
 * Returns true when the article is relevant to the VN market and should
 * proceed to the causal cascade.  Returns false when the article should be
 * discarded.
 *
 * Rule:
 *   1. If source is in VN_SOURCE_IDS → always relevant.
 *   2. Otherwise, scan combined (title + content) for any VN signal:
 *      a. Geographic keyword: "vietnam", "việt nam", "viet nam"
 *      b. Exchange identifier: "vn-index", "vnindex", "hose", "hnx", "upcom"
 *      c. VN stock ticker (word-boundary match)
 *   3. If no signal found → irrelevant (discard).
 *
 * Matching is case-insensitive.
 */
export function isVnRelevant(item: VnRelevanceInput): boolean {
  const sourceLower = (item.source ?? "").toLowerCase().trim();

  // Rule 1 — Vietnamese sources always pass
  if ((VN_SOURCE_IDS as string[]).includes(sourceLower)) return true;

  // Rule 2 — non-VN source: scan for VN signals
  const combined = `${item.title} ${item.content}`.toLowerCase();

  // 2a. Geographic keyword
  for (const kw of VN_GEO_KEYWORDS) {
    if (combined.includes(kw)) return true;
  }

  // 2b. Exchange / index identifier
  for (const kw of VN_EXCHANGE_KEYWORDS) {
    if (combined.includes(kw)) return true;
  }

  // 2c. VN stock ticker (word-boundary)
  for (const re of TICKER_REGEXES) {
    if (re.test(combined)) return true;
  }

  // No VN signal found — discard
  return false;
}
