/**
 * Combo/keyword detection helpers — cascadeEngine orchestration module
 *
 * size-justification: ~185L — exceeds the 120L logic cap but is one cohesive
 * unit of small detection helpers all called from buildCausalChain during
 * chain construction: direction2sentiment + findKeyword (sector-rule matching
 * primitives), isMarketWide (Task 162 market-wide broadcast gate),
 * detectPolicyInterventionCombo + its private POLICY_INTERVENTION_CATEGORIES
 * table (Task 1004 combo boost), and isPrecededByPlacePrefix + its private
 * stripDiacriticsLower/PLACE_PREFIX_SINGLE helpers (FIX NER-PLACE-1 ticker
 * guard). None of these has a second consumer outside buildCausalChain, and
 * each is a handful of lines — splitting further would scatter single-use
 * helpers across many tiny files for no maintainability gain. Extracted from
 * cascadeEngine.ts (FACTORY-DOMAIN-split-cascade-engine, Step 3) — pure move
 * of already-exported symbols (detectPolicyInterventionCombo,
 * isPrecededByPlacePrefix), no behavior change. direction2sentiment,
 * findKeyword, isMarketWide, stripDiacriticsLower, PLACE_PREFIX_SINGLE were
 * already module-private in cascadeEngine.ts; they are exported here only so
 * cascadeEngine.ts can import them, and are NOT re-exported from
 * cascadeEngine.ts (module surface parity preserved).
 *
 * Layer: domain/services
 */

import type { AnalysisLevel, Sentiment, ImpactDirection } from "../newsNormalizer.js";

/**
 * Map ImpactDirection to Sentiment.
 */
export function direction2sentiment(dir: ImpactDirection): Sentiment {
  if (dir === "up") return "bullish";
  if (dir === "down") return "bearish";
  return "neutral";
}

/**
 * Find the first matching keyword from a list in text.
 * Returns the matched keyword or null.
 */
export function findKeyword(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    if (text.includes(kw)) return kw;
  }
  return null;
}

/**
 * Returns true when the article text and metadata indicate a market-wide event.
 *
 * An article is market-wide if ANY of the following:
 *   (a) Contains "vn-index"
 *   (b) Contains ("toan thi truong" OR "thi truong chung khoan") AND at least
 *       one price/movement token ("giam", "tang", "mat diem", "diem", "%")
 *   (c) seedEntry.level is "country" or "global" AND impactScore >= minImpact
 *
 * All string comparisons use NFD-normalised, lowercased text.
 * Exported only so cascadeEngine.ts can import it from this module — not
 * re-exported from cascadeEngine.ts (module surface parity preserved).
 *
 * @param seedTextLower - Article title+summary, lowercased before calling
 * @param level         - AnalysisLevel of the seed entry
 * @param impactScore   - impactScore of the seed entry
 * @param minImpact     - Minimum impact score threshold for criteria (c)
 */
export function isMarketWide(
  seedTextLower: string,
  level: AnalysisLevel,
  impactScore: number,
  minImpact: number,
): boolean {
  // Apply NFD normalisation to strip Vietnamese diacritics for substring matching.
  // Sources may emit text with or without diacritics; NFD strip gives uniform comparison.
  const normText = seedTextLower
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

  // (a) VN-Index mention
  if (normText.includes("vn-index")) return true;

  // (b) Broad market vocabulary + price movement token
  const broadMarket =
    normText.includes("toan thi truong") ||
    normText.includes("thi truong chung khoan");
  if (broadMarket) {
    const hasMovement =
      normText.includes("giam") ||
      normText.includes("tang") ||
      normText.includes("mat diem") ||
      normText.includes("diem") ||
      normText.includes("%");
    if (hasMovement) return true;
  }

  // (c) Country or global level with sufficient impact
  if ((level === "country" || level === "global") && impactScore >= minImpact) {
    return true;
  }

  // (d) Analyst / CEO bearish market-warning pattern.
  // "điều chỉnh sâu", "rất sâu và đau", "cảnh báo nhà đầu tư" are analyst-sourced
  // bearish market warnings that must broadcast regardless of impactScore threshold.
  // Note: NFD strips combining diacritics but NOT the d-with-stroke (đ, U+0111),
  // which is a precomposed base character with no Unicode decomposition.
  // Patterns use đ directly to match the NFD-normalised text.
  // Bug 1314: brokerage-outlook patterns added — CEO/analyst warnings about brokerage
  // sector competitive pressure must also bypass impactScore gate (same logic as above).
  const ANALYST_WARNING_PATTERNS = [
    "đieu chinh sau",          // điều chỉnh sâu — deep correction
    "rat sau va đau",          // rất sâu và đau — very deep and painful
    "canh bao nha đau tu",     // cảnh báo nhà đầu tư — investor warning
    "trien vong nganh moi gioi",   // triển vọng ngành môi giới — brokerage sector outlook
    "ap luc canh tranh moi gioi",  // áp lực cạnh tranh môi giới — brokerage competitive pressure
    "canh tranh moi gioi",         // cạnh tranh môi giới — brokerage competition
  ];
  if (ANALYST_WARNING_PATTERNS.some((p) => normText.includes(p))) return true;

  return false;
}

const POLICY_INTERVENTION_CATEGORIES: Array<{ key: string; keywords: string[] }> = [
  {
    key: "sbv_rate",
    keywords: [
      "nhnn hạ lãi suất", "hạ lãi suất điều hành", "giảm lãi suất điều hành",
      "sbv rate cut", "cắt giảm lãi suất điều hành",
    ],
  },
  {
    key: "fiscal_stimulus",
    keywords: [
      "gói kích thích tài khóa", "bộ tài chính bơm tiền", "gói phục hồi kinh tế",
      "giải ngân đầu tư công khẩn cấp", "fiscal stimulus vietnam",
    ],
  },
  {
    key: "credit_room_expansion",
    keywords: [
      "nới room tín dụng", "tăng room tín dụng cho ngân hàng",
      "tín dụng ngân hàng tăng trưởng", "room tín dụng tăng",
    ],
  },
  {
    key: "market_stabilization",
    keywords: [
      "quỹ bình ổn", "bình ổn thị trường", "scic mua vào cổ phiếu",
      "stabilization fund", "nhnn mua trái phiếu chính phủ",
      "nghiệp vụ thị trường mở", "chính phủ hỗ trợ thị trường",
    ],
  },
  {
    key: "forex_intervention",
    keywords: [
      "nhnn bán ngoại tệ", "sbv fx intervention", "bán ngoại tệ bình ổn tỷ giá",
      "can thiệp tỷ giá",
    ],
  },
];

/**
 * Count how many distinct policy-intervention categories are present in the
 * seed text. Returns a confidence boost multiplier:
 *
 *   0–1 category  → 1.00 (no combo boost)
 *   2 categories  → 1.10 (+10% confidence on banking/securities domain entries)
 *   3+ categories → 1.18 (+18% — systemic policy response, rare event)
 *
 * Pure function: no I/O, no side effects.
 */
export function detectPolicyInterventionCombo(textLower: string): {
  matchedCategories: string[];
  multiplier: number;
} {
  const matched: string[] = [];

  for (const cat of POLICY_INTERVENTION_CATEGORIES) {
    if (cat.keywords.some((kw) => textLower.includes(kw))) {
      matched.push(cat.key);
    }
  }

  let multiplier = 1.0;
  if (matched.length >= 3) multiplier = 1.18;
  else if (matched.length === 2) multiplier = 1.10;

  return { matchedCategories: matched, multiplier };
}

/**
 * FIX NER-PLACE-1 — Vietnamese place-prefix detector for direct-code ticker NER.
 *
 * An all-caps token can collide with a watchlist ticker while actually being a
 * geographic reference: "TP HCM" / "TP.HCM" / "Thành phố HCM" all denote Ho Chi
 * Minh City, not the broker ticker HCM. Returns true when the token ending just
 * before `idx` (the start of the matched ticker) is a Vietnamese place prefix.
 *
 * Data-light + generalized (covers any ticker that follows a place prefix, not a
 * hardcoded HCM case). Diacritic-tolerant and case-insensitive: we strip
 * Unicode combining marks before comparing, so "Thành phố" → "thanh pho".
 *
 * Recognised prefixes (after stripping trailing punctuation `.`):
 *   - "tp"        → TP, TP., Tp., and the joined form "TP.HCM" (the "tp." token)
 *   - "t.p"       → T.P
 *   - "thanh pho" → Thành phố / thanh pho (two-word prefix)
 *   - "tinh"      → tỉnh (province)
 */
const PLACE_PREFIX_SINGLE = new Set(["tp", "t.p", "tinh"]);

function stripDiacriticsLower(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

export function isPrecededByPlacePrefix(text: string, idx: number): boolean {
  // Slice everything before the match, drop a trailing run of separators
  // (spaces / "." that glue the joined "TP.HCM" form), then inspect the
  // immediately-preceding token(s).
  const before = text.slice(0, idx).replace(/[\s.]+$/u, "");
  if (before.length === 0) return false;

  // Tokenise the tail on whitespace; keep the last up-to-two tokens so we can
  // match the two-word "thành phố" prefix as well as single-word prefixes.
  const tokens = before.split(/\s+/u);
  const last = stripDiacriticsLower(tokens[tokens.length - 1] ?? "");

  // Single-token prefixes: "tp", "tp." (→ "tp" after trailing-dot strip on the
  // glue above leaves "...tp"), "t.p", "tinh". Strip a trailing dot on the token
  // itself too (e.g. "Tp." → "tp.").
  const lastNoDot = last.replace(/\.+$/u, "");
  if (PLACE_PREFIX_SINGLE.has(lastNoDot)) return true;

  // Two-token prefix: "thanh pho".
  if (tokens.length >= 2) {
    const prev = stripDiacriticsLower(tokens[tokens.length - 2] ?? "");
    if (prev === "thanh" && lastNoDot === "pho") return true;
  }

  return false;
}
