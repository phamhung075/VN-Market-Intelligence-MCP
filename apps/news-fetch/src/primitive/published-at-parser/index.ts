/**
 * published-at-parser primitive
 *
 * Pure function — no side effects, no Date.now(), deterministic for same input.
 * Zero imports from infrastructure, application, or interface layers.
 *
 * Extracted from: reuters-rss.ts (normalizeRfcDate) + bloomberg-rss.ts (normalizeRfcDate)
 * Both files contained identical implementations — this extract resolves the duplication.
 */

/**
 * Convert an RFC 2822 date string to ISO 8601 UTC.
 *
 * @param rfcDate - RFC 2822 date string (e.g. "Mon, 13 May 2026 14:30:00 GMT")
 * @returns ISO 8601 UTC string (e.g. "2026-05-13T14:30:00.000Z"), or null on parse failure.
 *
 * @example
 *   parsePublishedAt("Mon, 13 May 2026 14:30:00 GMT")   // "2026-05-13T14:30:00.000Z"
 *   parsePublishedAt("Thu, 22 May 2026 07:00:00 +0700") // "2026-05-22T00:00:00.000Z"
 *   parsePublishedAt("not-a-date")                       // null
 */
export function parsePublishedAt(rfcDate: string): string | null {
  if (!rfcDate || rfcDate.trim() === '') return null;
  try {
    const d = new Date(rfcDate);
    if (isNaN(d.getTime())) return null;
    // Date constructor already normalises any explicit UTC offset to UTC epoch.
    return d.toISOString();
  } catch {
    return null;
  }
}
