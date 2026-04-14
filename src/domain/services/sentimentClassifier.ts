/**
 * Vietnamese / English Financial Sentiment Classifier — Task 134
 *
 * Rule-based classifier that determines directional sentiment (bullish / bearish
 * / neutral) from financial text in Vietnamese or English.
 *
 * Design notes:
 *  - Pure function — no async, no I/O, no side effects.
 *  - ZERO imports from infrastructure/ or application/.
 *  - Negation handling: if a negation word appears within 3 tokens of a
 *    sentiment word, the sentiment word's contribution is flipped.
 *  - Scoring: weighted bullish vs bearish keyword matches. Any lead determines
 *    direction; a tie (equal scores) → neutral.
 *
 * Layer: domain/services
 */

// ═══════════════════════════════════════════════════════════════════════════
// Public types
// ═══════════════════════════════════════════════════════════════════════════

export type SentimentDirection = "bullish" | "bearish" | "neutral";

export interface SentimentResult {
  /** Directional classification of the text. */
  direction: SentimentDirection;
  /** Confidence in [0, 1]. 0 when no sentiment keywords are present. */
  confidence: number;
  /** The sentiment keywords that triggered the classification (lowercased). */
  keywords: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Keyword tables with weights
// ═══════════════════════════════════════════════════════════════════════════

interface SentimentKeyword {
  word: string;
  /** Weight contributes to bullish (positive) or bearish (negative) total. */
  weight: number;
}

/** Vietnamese bullish keywords */
const VN_BULLISH: SentimentKeyword[] = [
  { word: "tăng mạnh", weight: 2 },
  { word: "tăng trưởng", weight: 2 },
  { word: "phục hồi", weight: 2 },
  { word: "bứt phá", weight: 2 },
  { word: "đột phá", weight: 2 },
  { word: "kỷ lục", weight: 2 },
  { word: "cao nhất", weight: 1 },
  { word: "lạc quan", weight: 1 },
  { word: "thuận lợi", weight: 1 },
  { word: "tích cực", weight: 1 },
  { word: "khởi sắc", weight: 1 },
  { word: "vượt", weight: 1 },
  { word: "dòng tiền vào", weight: 2 },
  { word: "mua ròng", weight: 2 },
  { word: "thu hút fdi", weight: 2 },
  { word: "giải ngân", weight: 1 },
  { word: "tăng", weight: 1 },
  // Task 716: government market-support measures are bullish reversal catalysts
  { word: "chính phủ hỗ trợ thị trường", weight: 4 },
  { word: "biện pháp hỗ trợ thị trường", weight: 4 },
  { word: "hỗ trợ thị trường chứng khoán", weight: 4 },
  { word: "quỹ bình ổn", weight: 3 },
  { word: "nới room ngoại", weight: 3 },
  { word: "nới room khối ngoại", weight: 3 },
  { word: "giảm thuế giao dịch", weight: 3 },
  { word: "miễn thuế giao dịch", weight: 3 },
  { word: "gói kích thích", weight: 3 },
  { word: "gói hỗ trợ", weight: 2 },
  // Task 1212: interest-rate cooling is a dovish / bullish monetary signal
  { word: "hạ nhiệt lãi suất", weight: 2 },
  { word: "lãi suất hạ nhiệt", weight: 2 },
  // Task 1255: securities analyst upside forecast phrases
  // "VN-Index hướng tới mốc 1800 điểm" / "dự báo VN-Index đạt X điểm"
  { word: "hướng tới mốc", weight: 3 },
  { word: "hướng đến mốc", weight: 3 },
  { word: "dự báo tăng", weight: 3 },
  { word: "dự báo đạt", weight: 2 },
  { word: "kỳ vọng đạt", weight: 2 },
  { word: "mục tiêu tăng", weight: 3 },
  { word: "mục tiêu giá", weight: 2 },
  { word: "tiệm cận mốc", weight: 2 },
  // Upside consensus forecast — "dự báo X đạt Y" pattern
  { word: "đạt mốc", weight: 2 },
  { word: "chạm mốc", weight: 2 },
  // "dự báo VN-Index đạt X điểm" → directional upside forecast
  { word: "vn-index đạt", weight: 3 },
  { word: "vnindex đạt", weight: 3 },
  { word: "thị trường đạt", weight: 2 },
];

/** Vietnamese bearish keywords */
const VN_BEARISH: SentimentKeyword[] = [
  { word: "giảm mạnh", weight: 2 },
  { word: "giảm sâu", weight: 2 },
  { word: "sụt giảm", weight: 2 },
  { word: "lao dốc", weight: 2 },
  { word: "suy thoái", weight: 2 },
  { word: "đình trệ", weight: 2 },
  { word: "mất điểm", weight: 2 },
  { word: "liên tiếp mất điểm", weight: 3 },
  { word: "rớt điểm", weight: 2 },
  { word: "bốc hơi", weight: 2 },
  { word: "mất giá", weight: 2 },
  { word: "bi quan", weight: 1 },
  { word: "rủi ro", weight: 1 },
  { word: "lo ngại", weight: 1 },
  { word: "áp lực", weight: 1 },
  { word: "khó khăn", weight: 1 },
  { word: "bán ròng", weight: 2 },
  { word: "rút vốn", weight: 2 },
  { word: "thoái vốn", weight: 2 },
  { word: "thoái sạch", weight: 3 },
  { word: "bán hết", weight: 2 },
  { word: "bán sạch", weight: 3 },
  { word: "muốn thoái sạch vốn", weight: 5 },
  { word: "thoái sạch vốn", weight: 4 },
  { word: "muốn thoái vốn", weight: 3 },
  { word: "bán toàn bộ cổ phiếu", weight: 4 },
  { word: "đăng ký bán", weight: 2 },
  { word: "lãnh đạo bán", weight: 3 },
  { word: "nội bộ bán", weight: 3 },
  { word: "từ nhiệm", weight: 2 },
  { word: "vướng lao lý", weight: 5 },
  { word: "bị khởi tố", weight: 5 },
  { word: "bị bắt tạm giam", weight: 5 },
  { word: "bị truy tố", weight: 4 },
  { word: "nợ xấu", weight: 1 },
  { word: "vỡ nợ", weight: 2 },
  { word: "phá sản", weight: 2 },
  { word: "thua lỗ", weight: 2 },
  { word: "giảm", weight: 1 },
];

/** English bullish keywords */
const EN_BULLISH: SentimentKeyword[] = [
  { word: "surge", weight: 2 },
  { word: "surged", weight: 2 },
  { word: "rally", weight: 2 },
  { word: "rallied", weight: 2 },
  { word: "gain", weight: 1 },
  { word: "gains", weight: 1 },
  { word: "boost", weight: 1 },
  { word: "recovery", weight: 2 },
  { word: "bullish", weight: 2 },
  { word: "upgrade", weight: 1 },
  { word: "rise", weight: 1 },
  { word: "rose", weight: 1 },
  { word: "rising", weight: 1 },
  // Task 716: stock-market support measures are bullish reversal catalysts
  { word: "stock market support measures", weight: 4 },
  { word: "market support measures", weight: 3 },
  { word: "government support package", weight: 3 },
  { word: "stimulus package", weight: 3 },
  { word: "stabilization fund", weight: 3 },
  // Task 1212: English equivalents for interest-rate cooling
  { word: "interest rate cooling", weight: 2 },
  { word: "rates cooling", weight: 1 },
];

/** English bearish keywords */
const EN_BEARISH: SentimentKeyword[] = [
  { word: "crash", weight: 2 },
  { word: "crashed", weight: 2 },
  { word: "drop", weight: 1 },
  { word: "dropped", weight: 1 },
  { word: "fall", weight: 1 },
  { word: "fell", weight: 1 },
  { word: "plunge", weight: 2 },
  { word: "plunged", weight: 2 },
  { word: "decline", weight: 1 },
  { word: "declining", weight: 1 },
  { word: "bearish", weight: 2 },
  { word: "downgrade", weight: 1 },
  { word: "recession", weight: 2 },
  { word: "risk", weight: 1 },
  { word: "insider selling", weight: 3 },
  { word: "executive selling", weight: 3 },
  { word: "ceo selling", weight: 3 },
  { word: "director selling", weight: 3 },
  { word: "divest", weight: 2 },
  { word: "divestiture", weight: 2 },
  { word: "sell off", weight: 2 },
  { word: "sell record", weight: 4 },
  { word: "funds sell", weight: 4 },
  { word: "record selling", weight: 4 },
  { word: "foreign sell", weight: 3 },
  { word: "net sell", weight: 3 },
  { word: "outflow", weight: 2 },
  { word: "capital flight", weight: 3 },
  { word: "dump shares", weight: 3 },
  { word: "offload shares", weight: 2 },
];

/** All bullish entries in one list (longest phrases first to avoid substring conflicts). */
const ALL_BULLISH: SentimentKeyword[] = [
  ...VN_BULLISH,
  ...EN_BULLISH,
].sort((a, b) => b.word.length - a.word.length);

/** All bearish entries in one list (longest phrases first). */
const ALL_BEARISH: SentimentKeyword[] = [
  ...VN_BEARISH,
  ...EN_BEARISH,
].sort((a, b) => b.word.length - a.word.length);

// ═══════════════════════════════════════════════════════════════════════════
// Negation patterns
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Strong negation tokens: flip the sentiment word's direction contribution.
 * "không tăng" → bearish, "no longer declining" → bullish.
 */
const FLIP_NEGATION_TOKENS: string[] = [
  "không còn",
  "không hề",
  "no longer",
  "không",
  "chẳng",
  "chả",
  "not",
  "never",
  "no",
];

/**
 * Soft negation tokens: cancel the sentiment word's contribution (→ neutral).
 * "chưa giảm" → neutral (not-yet-fallen implies it might still fall).
 */
const SOFT_NEGATION_TOKENS: string[] = [
  "chưa",
];

/**
 * Maximum number of whitespace-separated tokens between a negation word and
 * a sentiment word that still counts as a negation pair.
 */
const NEGATION_WINDOW = 3;

// ═══════════════════════════════════════════════════════════════════════════
// Core classification logic
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Tokenize text to lowercase whitespace-delimited tokens.
 * Punctuation is stripped so "surged," and "surged" both produce "surged".
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?;:()\[\]{}"']/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * Find all character-level occurrences of a keyword phrase in lowercase text.
 * Returns an array of [startIndex, endIndex] pairs.
 */
function findOccurrences(text: string, phrase: string): Array<[number, number]> {
  const occurrences: Array<[number, number]> = [];
  let pos = 0;
  while (pos < text.length) {
    const idx = text.indexOf(phrase, pos);
    if (idx === -1) break;
    // Ensure phrase is at a word boundary (not a substring of a longer word)
    const before = idx === 0 || /\s/.test(text[idx - 1]!) || /[().,!?;:\-]/.test(text[idx - 1]!);
    const afterIdx = idx + phrase.length;
    const after =
      afterIdx >= text.length ||
      /\s/.test(text[afterIdx]!) ||
      /[().,!?;:\-]/.test(text[afterIdx]!);
    if (before && after) {
      occurrences.push([idx, afterIdx]);
    }
    pos = idx + 1;
  }
  return occurrences;
}

/**
 * Extract the current sentence ending at `charPos` from `text`.
 *
 * Sentences are delimited by `.`, `!`, `?`, and `;`.
 * This scopes negation detection to the same sentence, preventing
 * cross-sentence false positives like "Không tăng. Thị trường giảm."
 * from marking "giảm" as flipped.
 */
function currentSentenceBefore(text: string, charPos: number): string {
  const preceding = text.slice(0, charPos);
  // Find the last sentence boundary before charPos
  const lastBoundary = Math.max(
    preceding.lastIndexOf("."),
    preceding.lastIndexOf("!"),
    preceding.lastIndexOf("?"),
    preceding.lastIndexOf(";"),
  );
  return lastBoundary === -1 ? preceding : preceding.slice(lastBoundary + 1);
}

/**
 * Determine the negation effect on a sentiment keyword at `charPos`.
 *
 * Returns:
 *  - "flip"   — a strong negation ("không", "not", "no longer"…) is within
 *               NEGATION_WINDOW tokens before the keyword → flip direction
 *  - "cancel" — a soft negation ("chưa") is nearby → nullify contribution
 *  - "none"   — no negation detected
 *
 * Strategy:
 *  1. Extract only the current sentence (split on `.!?;`) ending at `charPos`.
 *     This prevents negation in one sentence from affecting sentiment words
 *     in subsequent sentences.
 *  2. Tokenize that sentence fragment.
 *  3. Look at the last NEGATION_WINDOW tokens for any negation token.
 *  4. Check multi-word negation phrases in the last ~40 characters of the sentence.
 *  "flip" takes priority over "cancel" if both are present.
 */
function detectNegation(text: string, charPos: number): "flip" | "cancel" | "none" {
  // Scope to current sentence only — prevents cross-sentence negation leakage
  const sentenceFragment = currentSentenceBefore(text, charPos).trimEnd();
  const tokens = tokenize(sentenceFragment);
  const window = tokens.slice(-NEGATION_WINDOW);
  const nearbyText = sentenceFragment.slice(Math.max(0, sentenceFragment.length - 40));

  // Check flip negation (strong)
  for (const tok of window) {
    if (FLIP_NEGATION_TOKENS.includes(tok)) return "flip";
  }
  for (const neg of FLIP_NEGATION_TOKENS) {
    if (neg.includes(" ") && nearbyText.includes(neg)) return "flip";
  }

  // Check soft negation (cancel)
  for (const tok of window) {
    if (SOFT_NEGATION_TOKENS.includes(tok)) return "cancel";
  }
  for (const neg of SOFT_NEGATION_TOKENS) {
    if (neg.includes(" ") && nearbyText.includes(neg)) return "cancel";
  }

  return "none";
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify the directional sentiment of financial text.
 *
 * Algorithm:
 *  1. Convert text to lowercase.
 *  2. Scan for all bullish and bearish keyword matches (longest-first).
 *  3. For each match, check if a negation word appears within NEGATION_WINDOW
 *     tokens before it. If so, flip the sentiment contribution.
 *  4. Accumulate weighted bullishScore and bearishScore.
 *  5. Direction decision:
 *     - if bullishScore >= bearishScore + 2 → bullish
 *     - if bearishScore >= bullishScore + 2 → bearish
 *     - otherwise → neutral
 *  6. Confidence = max(bullishScore, bearishScore) / (bullishScore + bearishScore)
 *     or 0 when both are 0.
 *
 * @param text - Raw financial text (Vietnamese or English)
 * @returns    - SentimentResult with direction, confidence, and matched keywords
 */
export function classifySentiment(text: string): SentimentResult {
  if (!text || text.trim().length === 0) {
    return { direction: "neutral", confidence: 0, keywords: [] };
  }

  const lower = text.toLowerCase();
  let bullishScore = 0;
  let bearishScore = 0;
  const triggeredKeywords: string[] = [];

  // Task 1197: covered-range dedup — prevents shorter sub-phrases from scoring
  // when a longer phrase at the same start position has already been scored.
  const bullishCovered: Array<[number, number]> = [];
  const bearishCovered: Array<[number, number]> = [];

  function isCovered(covered: Array<[number, number]>, start: number): boolean {
    return covered.some(([lo, hi]) => start >= lo && start < hi);
  }

  // ── Process bullish keywords ────────────────────────────────────────────
  for (const kw of ALL_BULLISH) {
    const occurrences = findOccurrences(lower, kw.word);
    for (const [start, end] of occurrences) {
      if (isCovered(bullishCovered, start)) continue;      // already covered
      bullishCovered.push([start, end]);                   // claim range
      const neg = detectNegation(lower, start);
      if (neg === "flip") {
        bearishScore += kw.weight; // strong negation → flip to bearish
      } else if (neg === "none") {
        bullishScore += kw.weight; // no negation → count as bullish
      }
      // "cancel" → no score, but range is still claimed to suppress shorter sub-matches
      if (!triggeredKeywords.includes(kw.word)) {
        triggeredKeywords.push(kw.word);
      }
    }
  }

  // ── Process bearish keywords ────────────────────────────────────────────
  for (const kw of ALL_BEARISH) {
    const occurrences = findOccurrences(lower, kw.word);
    for (const [start, end] of occurrences) {
      if (isCovered(bearishCovered, start)) continue;      // already covered
      bearishCovered.push([start, end]);                   // claim range
      const neg = detectNegation(lower, start);
      if (neg === "flip") {
        bullishScore += kw.weight; // strong negation → flip to bullish
      } else if (neg === "cancel") {
        // nullified — no score, but range is claimed
      } else {
        bearishScore += kw.weight; // no negation → count as bearish
      }
      if (!triggeredKeywords.includes(kw.word)) {
        triggeredKeywords.push(kw.word);
      }
    }
  }

  // ── Direction decision ──────────────────────────────────────────────────
  // Any lead in weighted score determines direction.
  // Equal scores (including both 0) → neutral.
  let direction: SentimentDirection;
  if (bullishScore > bearishScore) {
    direction = "bullish";
  } else if (bearishScore > bullishScore) {
    direction = "bearish";
  } else {
    direction = "neutral";
  }

  // ── Confidence ──────────────────────────────────────────────────────────
  const total = bullishScore + bearishScore;
  const maxScore = Math.max(bullishScore, bearishScore);
  const confidence = total === 0 ? 0 : maxScore / total;

  return { direction, confidence, keywords: triggeredKeywords };
}
