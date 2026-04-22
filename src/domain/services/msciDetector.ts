/**
 * MSCI Inclusion Cascade Detector — Task 1279
 *
 * Pure domain function that detects MSCI inclusion keywords in news text
 * and returns detection result with confidence scoring.
 *
 * Design:
 *  - Pure function: no I/O, no side effects, synchronous
 *  - Whole-word keyword matching (case-insensitive)
 *  - Credibility threshold: 0.7 (rejects low-confidence sources)
 *  - Confidence formula: (sourceCredibility × matchedKeywordCount / 3.0) capped at 1.0
 *
 * Layer: domain/services
 * Dependencies: none (pure domain logic)
 */

export interface MsciDetectionResult {
  /** True if MSCI inclusion keywords detected + credibility >= 0.7 */
  matched: boolean;
  /** List of matched keywords (lowercase) */
  keywords: string[];
  /** Excerpt of text around matched keywords */
  context: string;
  /** Confidence score: (cred × matchedCount / 3.0) capped at 1.0 */
  confidence: number;
}

/**
 * Detect MSCI inclusion keywords in seed text.
 *
 * Keywords (whole-word, case-insensitive):
 *   - "nộp danh sách" (submit list)
 *   - "đáp ứng tiêu chí" (meet criteria)
 *   - "chỉ số msci" (MSCI index)
 *
 * Credibility threshold: 0.7
 *   - If sourceCredibility < 0.7, return matched=false (reject low-confidence sources)
 *   - If sourceCredibility >= 0.7, proceed with keyword matching
 *
 * Confidence calculation:
 *   - confidence = min(1.0, sourceCredibility × matchedKeywordCount / 3.0)
 *   - Formula rewards articles with multiple keywords + high-credibility sources
 *   - Capped at 1.0 (avoid over-confidence)
 *
 * @param seedSummary - Original news article text (may contain diacritics)
 * @param sourceCredibility - Credibility score [0, 1] (e.g., 0.95 for Reuters)
 * @returns Detection result with matched flag and confidence
 */
export function detectMsciInclusion(
  seedSummary: string,
  sourceCredibility: number,
): MsciDetectionResult {
  // ── Step 1: Credibility threshold check ────────────────────────────────
  if (sourceCredibility < 0.7) {
    return {
      matched: false,
      keywords: [],
      context: "",
      confidence: 0,
    };
  }

  // ── Step 2: Whole-word keyword matching ────────────────────────────────
  const keywords = ["nộp danh sách", "đáp ứng tiêu chí", "chỉ số msci"];
  const matchedKeywords: string[] = [];
  const textLower = seedSummary.toLowerCase();

  for (const keyword of keywords) {
    if (findKeywordWholeWord(textLower, keyword)) {
      matchedKeywords.push(keyword);
    }
  }

  // ── Step 3: No keywords matched ────────────────────────────────────────
  if (matchedKeywords.length === 0) {
    return {
      matched: false,
      keywords: [],
      context: "",
      confidence: 0,
    };
  }

  // ── Step 4: Calculate confidence ───────────────────────────────────────
  // confidence = min(1.0, sourceCredibility × matchedKeywordCount / 3.0)
  const rawConfidence = (sourceCredibility * matchedKeywords.length) / 3.0;
  const confidence = Math.min(1.0, rawConfidence);

  // ── Step 5: Extract context ────────────────────────────────────────────
  // Find first matched keyword in text and extract surrounding context
  const firstKeyword = matchedKeywords[0]!;
  const keywordIndex = textLower.indexOf(firstKeyword);
  const contextStart = Math.max(0, keywordIndex - 30);
  const contextEnd = Math.min(seedSummary.length, keywordIndex + firstKeyword.length + 30);
  const context = seedSummary.substring(contextStart, contextEnd).trim();

  return {
    matched: true,
    keywords: matchedKeywords,
    context,
    confidence,
  };
}

/**
 * Helper: Detect whether a keyword appears at word boundaries (whole-word match).
 *
 * For Vietnamese multi-word keywords (e.g., "nộp danh sách"):
 * - Find the keyword substring in the text
 * - Verify character before is not a Vietnamese letter/diacritic (word boundary)
 * - Verify character after is not a Vietnamese letter/diacritic (word boundary)
 * - This handles single-word and multi-word keywords uniformly
 *
 * Case-insensitive.
 *
 * @param text - Text to search (already lowercased)
 * @param keyword - Keyword to find (already lowercased)
 * @returns True if keyword found at word boundary
 */
function findKeywordWholeWord(text: string, keyword: string): boolean {
  let searchIdx = 0;

  while (true) {
    const idx = text.indexOf(keyword, searchIdx);
    if (idx === -1) return false;

    // Check character before: must be word boundary (space, punctuation, or start of string)
    const beforeIdx = idx - 1;
    const beforeOk = beforeIdx < 0 || isWordBoundary(text[beforeIdx]!);

    // Check character after: must be word boundary (space, punctuation, or end of string)
    const afterIdx = idx + keyword.length;
    const afterOk = afterIdx >= text.length || isWordBoundary(text[afterIdx]!);

    if (beforeOk && afterOk) return true;

    searchIdx = idx + 1;
  }
}

/**
 * Helper: Check if a character is a word boundary (not a letter/diacritic).
 *
 * Returns true for space, punctuation, etc.
 * Returns false for letters (ASCII or Vietnamese with diacritics).
 *
 * @param char - Single character to test
 * @returns True if char is a word boundary
 */
function isWordBoundary(char: string): boolean {
  // Word characters: A-Z, a-z, 0-9, and Vietnamese diacritics
  const wordCharRegex = /[a-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
  return !wordCharRegex.test(char);
}
