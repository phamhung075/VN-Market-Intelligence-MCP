/**
 * AGRICULTURE WEATHER CASCADE DETECTOR — Task 1281
 *
 * Pure domain function that detects Vietnamese weather keywords in news text
 * and returns detection result with confidence scoring.
 *
 * Design:
 *  - Pure function: no I/O, no side effects, synchronous
 *  - Whole-word keyword matching (case-insensitive)
 *  - Diacritics support: NFD normalization for Vietnamese characters
 *  - Credibility threshold: 0.6 (weather is objective, lower bar than MSCI 0.7)
 *  - Confidence formula: min(1.0, sourceCredibility × matchedKeywordCount / 3.0)
 *  - Forecast penalty: -0.2 if "dự báo" + no confirmed event keywords
 *
 * Layer: domain/services
 * Dependencies: none (pure domain logic)
 */

export interface AgricultureWeatherDetectionResult {
  /** True if weather keywords detected + credibility >= 0.6 */
  matched: boolean;
  /** List of matched keywords (lowercase) */
  keywords: string[];
  /** Excerpt of text around matched keywords */
  context: string;
  /** Confidence score: min(1.0, sourceCredibility × matchedKeywordCount / 3.0) */
  confidence: number;
  /** Impact type: "rainfall" | "drought" | "storm" | "cold_snap" | null */
  impactType: string | null;
}

/**
 * Detect agriculture weather keywords in seed text.
 *
 * Keywords (whole-word, case-insensitive):
 *   Rainfall (7): "mưa lớn", "mưa kiên kéo", "lũ lụt", "ngập lụt", "mưa gây lũ", "báo động 3", "báo động 2"
 *   Drought (5): "hạn hán", "thiếu nước", "tác động hạn", "khô hạn", "cạn nước"
 *   Storm (4): "bão", "gió mạnh", "gió bão", "thiệt hại bão"
 *   Cold snap (3): "rét đậm", "rét hại", "gió lạnh Siberia"
 *
 * Credibility threshold: 0.6
 *   - If sourceCredibility < 0.6, return matched=false (reject low-confidence sources)
 *   - If sourceCredibility >= 0.6 AND keywords matched, proceed to confidence calc
 *
 * Forecast penalty:
 *   - If text contains "dự báo" (forecast) WITHOUT confirmed-event keywords (e.g., "lũ lụt gây" + "thiệt hại"), reduce credibility by 0.2
 *   - Formula: effectiveCredibility = sourceCredibility - (0.2 if forecast else 0)
 *
 * Confidence calculation:
 *   - confidence = min(1.0, effectiveCredibility × matchedKeywordCount / 3.0)
 *   - Formula rewards articles with multiple keywords + high-credibility sources
 *   - Capped at 1.0 (avoid over-confidence)
 *
 * @param seedSummary - Original news article text (may contain diacritics)
 * @param sourceCredibility - Credibility score [0, 1] (e.g., 0.95 for Reuters, 0.8 for VnExpress)
 * @returns Detection result with matched flag, keywords, impactType, and confidence
 */
export function detectAgricultureWeatherKeywords(
  seedSummary: string,
  sourceCredibility: number,
): AgricultureWeatherDetectionResult {
  // ── Step 1: Keyword definitions ────────────────────────────────────────
  const keywordsByType = {
    rainfall: ["mưa lớn", "mưa kiên kéo", "lũ lụt", "ngập lụt", "mưa gây lũ", "báo động 3", "báo động 2"],
    drought: ["hạn hán", "thiếu nước", "tác động hạn", "khô hạn", "cạn nước"],
    storm: ["bão", "gió mạnh", "gió bão", "thiệt hại bão"],
    cold_snap: ["rét đậm", "rét hại", "gió lạnh siberia"],
  };

  const allKeywords = Object.values(keywordsByType).flat();

  // ── Step 2: Credibility threshold check ────────────────────────────────
  if (sourceCredibility < 0.6) {
    return {
      matched: false,
      keywords: [],
      context: "",
      confidence: 0,
      impactType: null,
    };
  }

  // ── Step 3: Normalize text (diacritics handling) ────────────────────────
  // NFD normalization: "mưa lớn" = U+006D U+0169 U+0061... → decomposed form
  // Allows matching with/without diacritics
  const textNorm = seedSummary.toLowerCase().normalize("NFD");

  // ── Step 4: Whole-word keyword matching ────────────────────────────────
  const matchedKeywords: string[] = [];
  let detectedImpactType: string | null = null;

  for (const [impactType, keywords] of Object.entries(keywordsByType)) {
    for (const keyword of keywords) {
      // Normalize keyword for matching
      const keywordNorm = keyword.toLowerCase().normalize("NFD");
      if (findKeywordWholeWord(textNorm, keywordNorm)) {
        const lowerKeyword = keyword.toLowerCase();
        if (!matchedKeywords.includes(lowerKeyword)) {
          matchedKeywords.push(lowerKeyword);
        }
        // Set impact type (prefer first match)
        if (!detectedImpactType) {
          detectedImpactType = impactType;
        }
      }
    }
  }

  // ── Step 5: No keywords matched ────────────────────────────────────────
  if (matchedKeywords.length === 0) {
    return {
      matched: false,
      keywords: [],
      context: "",
      confidence: 0,
      impactType: null,
    };
  }

  // ── Step 6: Forecast penalty ───────────────────────────────────────────
  // If text contains "dự báo" (forecast) but lacks confirmed-event keywords, apply -0.2 penalty
  let effectiveCredibility = sourceCredibility;
  const forecastKeywordNorm = "dự báo".normalize("NFD");
  const isForecast = textNorm.includes(forecastKeywordNorm) || textNorm.includes("du bao");
  const hasConfirmedEvent = matchedKeywords.some(kw =>
    kw.includes("lũ lụt") || kw.includes("thiệt hại") || kw.includes("gây"),
  );

  if (isForecast && !hasConfirmedEvent) {
    effectiveCredibility = Math.max(0, sourceCredibility - 0.2);
  }

  // Re-check threshold after penalty
  if (effectiveCredibility < 0.6) {
    return {
      matched: false,
      keywords: [],
      context: "",
      confidence: 0,
      impactType: null,
    };
  }

  // ── Step 7: Calculate confidence ───────────────────────────────────────
  // confidence = min(1.0, effectiveCredibility × matchedKeywordCount / 3.0)
  const rawConfidence = (effectiveCredibility * matchedKeywords.length) / 3.0;
  const confidence = Math.min(1.0, rawConfidence);

  // ── Step 8: Extract context ────────────────────────────────────────────
  // Find first matched keyword in text and extract surrounding context
  const firstKeyword = matchedKeywords[0]!;
  const keywordIndex = textNorm.indexOf(firstKeyword);
  const contextStart = Math.max(0, keywordIndex - 30);
  const contextEnd = Math.min(seedSummary.length, keywordIndex + firstKeyword.length + 30);
  const context = seedSummary.substring(contextStart, contextEnd).trim();

  return {
    matched: true,
    keywords: matchedKeywords,
    context,
    confidence,
    impactType: detectedImpactType,
  };
}

/**
 * Helper: Find keyword at whole-word boundaries.
 * Reuse from msciDetector.ts (lines 97–110) or abstract to shared utils.
 *
 * Example: findKeywordWholeWord("mưa lớn đã gây lũ", "mưa lớn") → true
 *          findKeywordWholeWord("mưa lớnmưa", "mưa lớn") → false (no space boundary)
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
