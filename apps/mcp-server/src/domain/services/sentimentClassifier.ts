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
  // Task 1195: inflation cooling → BULLISH (dovish monetary signal)
  { word: "lạm phát hạ nhiệt", weight: 2 },
  { word: "hạ nhiệt lạm phát", weight: 2 },
  { word: "inflation cooling", weight: 2 },
  { word: "inflation eased", weight: 2 },
  { word: "inflation slowed", weight: 1 },
  // Task 1200: positive "đầu tư công" context → BULLISH
  { word: "đẩy mạnh đầu tư công", weight: 2 },
  { word: "tăng đầu tư công", weight: 2 },
  { word: "đầu tư công tăng", weight: 2 },
  { word: "đẩy nhanh đầu tư công", weight: 2 },
  { word: "thúc đẩy đầu tư công", weight: 2 },
  { word: "giải ngân đầu tư công", weight: 2 },
  { word: "đầu tư công tăng trưởng", weight: 2 },
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
  // Task 1279: MSCI index inclusion — material bullish catalyst
  { word: "nộp danh sách", weight: 1.0 },
  { word: "đáp ứng tiêu chí", weight: 0.9 },
  { word: "chỉ số msci", weight: 0.8 },
  // Fix-1279: MSCI WatchList inclusion — tier-1 macro catalyst
  // "vào WatchList MSCI" = precursor to full EM inclusion, triggers $2-5B ETF inflows
  // Weight 3.0: strong enough to dominate neutral text and produce BULLISH direction
  { word: "vào watchlist msci", weight: 3.0 },
  { word: "watchlist msci", weight: 3.0 },
  { word: "msci em watchlist", weight: 3.0 },
  { word: "msci watchlist", weight: 3.0 },
  { word: "vào danh sách theo dõi msci", weight: 3.0 },
  { word: "nâng hạng thị trường", weight: 3.0 },
  { word: "msci nâng hạng", weight: 3.0 },
  { word: "msci em", weight: 2.5 },
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
  { word: "xả hàng", weight: 3 },
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
  // Fix 1321: standalone loss — "VIX Q1 lợi nhuận lỗ 63% giảm" → bearish
  { word: "lỗ", weight: 2 },
  // Fix 1321: explicit negative profit — stronger signal
  { word: "lợi nhuận âm", weight: 3 },
  { word: "giảm", weight: 1 },
  // Task 1241: Geopolitical escalation — must classify BEARISH, not default to BULLISH/neutral
  { word: "phong tỏa thương mại", weight: 3 },
  { word: "phong tỏa kinh tế", weight: 3 },
  { word: "lệnh phong tỏa", weight: 3 },
  { word: "phong tỏa", weight: 2 },
  { word: "đàm phán đổ vỡ", weight: 3 },
  { word: "phá vỡ đàm phán", weight: 3 },
  { word: "đổ vỡ đàm phán", weight: 3 },
  { word: "leo thang căng thẳng", weight: 3 },
  { word: "căng thẳng leo thang", weight: 3 },
  { word: "leo thang xung đột", weight: 3 },
  { word: "xung đột leo thang", weight: 3 },
  { word: "căng thẳng địa chính trị", weight: 2 },
  { word: "rủi ro địa chính trị", weight: 2 },
  { word: "nguy cơ chiến tranh", weight: 3 },
  { word: "ngưỡng chiến tranh", weight: 3 },
  // Task 1200: "đầu tư công" with negative modifiers → BEARISH for construction/materials
  { word: "cắt giảm đầu tư công", weight: 3 },
  { word: "giảm đầu tư công", weight: 2 },
  { word: "đầu tư công chậm trễ", weight: 2 },
  { word: "chậm trễ đầu tư công", weight: 2 },
  { word: "đình trệ đầu tư công", weight: 2 },
  { word: "đầu tư công đình trệ", weight: 2 },
  { word: "đầu tư công giảm", weight: 2 },
  { word: "vốn đầu tư công giảm", weight: 3 },
  // Task 1195: growth/economy cooling → BEARISH (longer phrases to avoid false positives)
  // Weight 3 to overcome "tăng trưởng" bullish-2 + net bearish advantage
  { word: "tốc độ tăng trưởng hạ nhiệt", weight: 4 },
  { word: "tăng trưởng hạ nhiệt", weight: 3 },
  { word: "kinh tế hạ nhiệt", weight: 3 },
  { word: "gdp hạ nhiệt", weight: 3 },
  { word: "hạ nhiệt tăng trưởng", weight: 3 },
  { word: "hạ nhiệt kinh tế", weight: 3 },
  { word: "nhu cầu hạ nhiệt", weight: 2 },
  { word: "tiêu dùng hạ nhiệt", weight: 2 },
  { word: "sản xuất hạ nhiệt", weight: 2 },
  { word: "growth slowing", weight: 2 },
  { word: "growth slowdown", weight: 2 },
  { word: "economy cooling", weight: 2 },
  { word: "gdp slowing", weight: 2 },
  { word: "demand cooling", weight: 2 },
  // Report #2588: cost-pressure phrases misclassified BULLISH due to "tăng" (w1) overpowering "áp lực" (w1)
  // Compound phrases need weight 2 to guarantee net-bearish result
  { word: "áp lực chi phí", weight: 2 },
  { word: "tăng chi phí đầu vào", weight: 2 },
  { word: "chi phí đầu vào tăng", weight: 2 },
  { word: "chi phí tăng", weight: 2 },
  { word: "gánh nặng chi phí", weight: 2 },
  { word: "chi phí mua điện tăng", weight: 3 },
  { word: "giá điện tăng", weight: 2 },
  // Task 1308a: Insider SELLING — "bán ra" was missing (reports 1272/1278)
  { word: "bán ra", weight: 2 },
  // Task 1308a: Global bearish macro patterns — misclassified BULLISH (report 1284)
  // weight 4: beats simple "tăng trưởng" (w2) in non-compound contexts
  { word: "hạ dự báo", weight: 4 },
  // Compound: weight 6 ensures net-bearish even when bullish "tăng trưởng"(2)+"dự báo tăng"(3)=5 also fire
  { word: "hạ dự báo tăng trưởng", weight: 6 },
  { word: "cảnh báo kịch bản bất lợi", weight: 3 },
  { word: "báo lỗ", weight: 3 },
  { word: "tăng phòng thủ tiền mặt", weight: 3 },
  // Fix-1292: forced-sell phrases — margin call / block trade forced sell → BEARISH
  { word: "bị ép bán", weight: 3 },
  { word: "ép bán", weight: 2 },
  // Fix-1302: loss-amount phrases — "khoản lỗ X tỷ" → BEARISH
  { word: "khoản lỗ", weight: 2 },
  // Fix-1297: standalone cash-defense phrase (supplements "tăng phòng thủ tiền mặt")
  { word: "phòng thủ tiền mặt", weight: 2 },
  // Task 1315a: Cost-push compound patterns (FR-5)
  // Weight 3: beats generic "tăng"(w1)+"chi phí"(w2) in mixed text.
  // Weight 4 (compound): net-bearish even with "tăng mạnh"(w2) co-firing.
  { word: "giá đầu vào tăng", weight: 3 },
  { word: "chi phí nguyên liệu tăng", weight: 3 },
  { word: "giá than tăng gây áp lực", weight: 4 },
  { word: "giá khí đốt tăng gây áp lực", weight: 4 },
  { word: "giá xăng tăng gây áp lực", weight: 4 },
  { word: "vật liệu xây dựng tăng giá", weight: 3 },
  // Task 1332b: Insider governance — sell-high-buy-low pattern
  // "Chủ tịch bán 88 triệu cổ phiếu giá cao rồi mua lại khi giá giảm"
  // Governance red flag: insider extracted value at peak, re-entered at lower price.
  // Weight 4: must beat incidental "mua lại" (bullish +1) + "giảm" (bearish +1) already scored.
  // Compound phrase longest-first sort suppresses shorter "mua lại" sub-match.
  { word: "bán giá cao rồi mua lại", weight: 4 },
  // Weight 3: standalone re-buy-after-drop phrase, confirms sell-high pattern context.
  { word: "mua lại khi giá giảm", weight: 3 },
  // Weight 3: "sold then re-bought" without explicit price qualifier — covers headline variants.
  { word: "bán rồi mua lại", weight: 3 },
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
  // Task 1241: Geopolitical escalation keywords — English equivalents
  { word: "talks collapsed", weight: 3 },
  { word: "talks broke down", weight: 3 },
  { word: "negotiations failed", weight: 3 },
  { word: "negotiations collapsed", weight: 3 },
  { word: "talks breakdown", weight: 3 },
  { word: "diplomatic breakdown", weight: 3 },
  { word: "blockade", weight: 2 },
  { word: "escalation", weight: 2 },
  { word: "military standoff", weight: 3 },
  { word: "geopolitical risk", weight: 2 },
  { word: "geopolitical tensions", weight: 2 },
  { word: "war risk", weight: 3 },
  // Task 1308a: Global bearish macro — English patterns (report 1284)
  { word: "risk-off", weight: 3 },
  { word: "flight to safety", weight: 3 },
  // Task 1315a: English cost-push patterns (FR-5)
  { word: "cost-push", weight: 3 },
  { word: "input cost inflation", weight: 3 },
  { word: "commodity cost pressure", weight: 3 },
  { word: "margin compression", weight: 2 },
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

  const lower = text.normalize("NFC").toLowerCase();
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
