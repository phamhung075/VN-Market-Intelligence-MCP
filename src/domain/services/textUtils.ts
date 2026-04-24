/**
 * textUtils — Domain Layer
 *
 * Pure text utility functions for truncation.
 * No I/O, no infrastructure imports.
 *
 * Grapheme-aware truncation using Intl.Segmenter (safe for Vietnamese
 * diacritics, emoji, and other multi-codepoint clusters).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function graphemeLength(text: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter();
    return [...segmenter.segment(text)].length;
  }
  return [...text].length;
}

function graphemeSlice(text: string, maxGraphemes: number): string {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter();
    const segments = [...segmenter.segment(text)];
    return segments
      .slice(0, maxGraphemes)
      .map((s) => s.segment)
      .join("");
  }
  return [...text].slice(0, maxGraphemes).join("");
}

/**
 * Word-boundary aware truncation with grapheme counting.
 * Appends "…" only when text is actually truncated.
 */
export function smartTruncate(text: string, maxLen: number): string {
  if (!text) return text ?? "";
  if (graphemeLength(text) <= maxLen) return text;

  const sliced = graphemeSlice(text, maxLen);
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace > 0) {
    return sliced.slice(0, lastSpace) + "…";
  }
  return sliced + "…";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

const NEWS_SUMMARY_MAX_GRAPHEMES = 1000;
const POLICY_SUMMARY_MAX_GRAPHEMES = 500;

/**
 * Truncate a news summary to max 1000 graphemes, word-boundary aware.
 * Appends "…" only when truncated.
 */
export function truncateNewsSummary(text: string): string {
  return smartTruncate(text, NEWS_SUMMARY_MAX_GRAPHEMES);
}

/**
 * Truncate a policy summary to max 500 graphemes, word-boundary aware.
 * Appends "…" only when truncated.
 */
export function truncatePolicySummary(text: string): string {
  return smartTruncate(text, POLICY_SUMMARY_MAX_GRAPHEMES);
}
