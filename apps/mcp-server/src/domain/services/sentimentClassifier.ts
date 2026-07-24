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
// Keyword + negation tables — extracted to sentimentLexicons.ts
// (FACTORY-DOMAIN-extract-sentiment-lexicons: pure data/logic separation,
// verbatim move, no entry added/removed/reweighted/reordered)
// ═══════════════════════════════════════════════════════════════════════════

import {
  ALL_BULLISH,
  ALL_BEARISH,
  FLIP_NEGATION_TOKENS,
  SOFT_NEGATION_TOKENS,
  NEGATION_WINDOW,
} from "./sentimentLexicons.js";

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
