/**
 * TelegramMessageFactory — Infrastructure Layer
 *
 * Singleton service providing consistent, intelligent message formatting
 * for all Telegram output. Centralizes truncation logic to prevent the
 * ad-hoc `.slice(0, N)` bugs (Tasks 1300a/1300b).
 *
 * All methods are static — no instantiation required.
 *
 * Smart truncation rules:
 *  - Word-aware: never cut at mid-word
 *  - Vietnamese diacritics-safe: uses grapheme counting via Intl.Segmenter
 *  - Appends "…" only when actually truncated
 */

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Count graphemes correctly (respects Vietnamese diacritical marks,
 * emoji, and other multi-codepoint clusters).
 */
function graphemeLength(text: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter();
    return [...segmenter.segment(text)].length;
  }
  // Fallback: codepoint count (safe for pure ASCII + basic Latin)
  return [...text].length;
}

/**
 * Slice text by grapheme count rather than code-unit index.
 * Returns the first `maxGraphemes` graphemes as a string.
 */
function graphemeSlice(text: string, maxGraphemes: number): string {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter();
    const segments = [...segmenter.segment(text)];
    return segments
      .slice(0, maxGraphemes)
      .map((s) => s.segment)
      .join("");
  }
  // Fallback: spread to codepoints
  return [...text].slice(0, maxGraphemes).join("");
}

/**
 * Core smart-truncation logic shared by all factory methods.
 *
 * Rules (in order):
 *  1. Word-boundary: backtrack to last space before the grapheme limit.
 *  2. Quote-boundary: if the cut point falls inside an open `"..."` pair,
 *     backtrack further to before the opening `"`.
 *  3. Append "…" only when actually truncated.
 *
 * @param text     Input string (may be empty/undefined)
 * @param maxLen   Maximum number of graphemes to allow
 * @returns        Possibly-truncated string, "…" appended iff truncated
 */
function smartTruncate(text: string, maxLen: number): string {
  if (!text) return text ?? "";
  if (graphemeLength(text) <= maxLen) return text;

  // Slice to maxLen graphemes, then backtrack to word boundary
  const sliced = graphemeSlice(text, maxLen);
  const lastSpace = sliced.lastIndexOf(" ");
  let candidate = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;

  // Quote-boundary: if candidate ends with or contains an unclosed " (Vietnamese "…")
  // check whether the cut falls inside an open double-quote pair.
  const openIdx = candidate.lastIndexOf('"');
  if (openIdx !== -1) {
    // Count quotes in the candidate; if odd, we're inside an open quote
    const quoteCount = (candidate.match(/"/g) ?? []).length;
    if (quoteCount % 2 !== 0) {
      // Truncate before the unmatched opening quote
      const beforeQuote = candidate.slice(0, openIdx).trimEnd();
      if (beforeQuote.length > 0) {
        candidate = beforeQuote;
      }
    }
  }

  return candidate + "…";
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

export class TelegramMessageFactory {
  // Private constructor — use static methods only
  private constructor() {}

  /**
   * Format alert message for briefing output.
   * Smart truncation: max 100 graphemes, word-boundary aware.
   */
  static formatAlertMessage(msg: string): string {
    return smartTruncate(msg, 100);
  }

  /**
   * Format story/news title for briefing output.
   * Smart truncation: max 100 graphemes, word-boundary aware.
   */
  static formatStoryTitle(title: string): string {
    return smartTruncate(title, 100);
  }

  /**
   * Format signal reasoning for storage in analysis_entries.
   * Smart truncation: max 1000 graphemes, preserve complete thoughts.
   */
  static formatSignalReasoning(reasoning: string): string {
    return smartTruncate(reasoning, 1000);
  }

  /**
   * Format news summary for storage in analysis_entries.
   * Smart truncation: max 1000 graphemes, preserve context.
   */
  static formatNewsSummary(summary: string): string {
    return smartTruncate(summary, 1000);
  }

  /**
   * Format policy summary for storage.
   * Smart truncation: max 500 graphemes.
   */
  static formatPolicySummary(summary: string): string {
    return smartTruncate(summary, 500);
  }
}
