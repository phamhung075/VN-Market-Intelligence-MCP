/**
 * headline-normalizer primitive
 *
 * Pure function — no side effects, deterministic for same input.
 * Zero imports from infrastructure, application, or interface layers.
 *
 * Normalizes raw RSS headline text: strips trailing source attribution
 * (e.g. "- Bloomberg", "- Reuters"), collapses whitespace, trims.
 */

/**
 * Common news source attribution suffixes appended by Google News RSS.
 * Matched case-sensitively against the end of the headline.
 */
const SOURCE_SUFFIX_PATTERN = /\s+[-–]\s+\w[\w\s.]*$/;

/**
 * Normalize a raw RSS headline.
 *
 * @param raw - Raw headline string from RSS feed
 * @returns Normalized headline: attribution stripped, whitespace collapsed, trimmed.
 *
 * @example
 *   normalizeHeadline("Fed raises rates - Bloomberg")  // "Fed raises rates"
 *   normalizeHeadline("  Vietnam  GDP  grows  ")        // "Vietnam GDP grows"
 *   normalizeHeadline("")                               // ""
 */
export function normalizeHeadline(raw: string): string {
  if (!raw) return '';

  // Strip trailing source attribution suffix (e.g. " - Bloomberg", " - Reuters")
  let headline = raw.replace(SOURCE_SUFFIX_PATTERN, '');

  // Collapse multiple whitespace to single space, then trim
  headline = headline.replace(/\s+/g, ' ').trim();

  return headline;
}
