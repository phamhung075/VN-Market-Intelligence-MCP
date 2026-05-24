/**
 * article-relevance-filter primitive
 *
 * Pure boolean function — no side effects, zero I/O, deterministic.
 * Zero imports from infrastructure, application, or interface layers.
 *
 * Checks if a headline is relevant based on keyword list (case-insensitive).
 */

/**
 * Check if a headline is relevant for VN-market monitoring.
 *
 * @param headline - Article headline text
 * @param keywords - List of keywords to match (case-insensitive substring check)
 * @returns true if headline contains any keyword; false if keywords empty or no match.
 *
 * @example
 *   isRelevantArticle("Vietnam central bank holds rates", ["Vietnam", "VN"])  // true
 *   isRelevantArticle("VIETNAM GDP SURGES", ["vietnam"])                       // true (case-insensitive)
 *   isRelevantArticle("US treasury yields rise", ["Vietnam", "VN"])            // false
 *   isRelevantArticle("Vietnam GDP", [])                                        // false (empty keywords)
 */
export function isRelevantArticle(headline: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;

  const headlineLower = headline.toLowerCase();
  return keywords.some((kw) => headlineLower.includes(kw.toLowerCase()));
}
