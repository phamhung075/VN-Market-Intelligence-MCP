/**
 * BCTC Queue Enricher — Task 1218 (Application Layer)
 *
 * Enriches BCTC VPS queue items with actual PDF URLs discovered via
 * listSscDocuments. This prevents the VPS from having to re-discover
 * the PDF URL, reducing redundant SSC portal traffic.
 *
 * Design:
 *  - enrichQueueWithPdfUrls: for each queue item without a source_url,
 *    calls the injectable listDocs function to find the actual PDF URL.
 *    Items that already have source_url are skipped (cached).
 *  - buildQueueSourceHints: builds the ordered source_hints array for a
 *    queue item, putting the actual PDF URL first (if available) followed
 *    by fallback portal URLs.
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import { logger } from "../../infrastructure/logger.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single BCTC VPS queue row (subset of bctc_vps_queue columns). */
export interface BctcQueueItem {
  action_code: string;
  period_year: number;
  period_quarter: string;
  /** Cached PDF URL — null means not yet discovered. */
  source_url: string | null;
}

/** Minimal SSC document shape returned by the lookup function. */
export interface SscDoc {
  url: string;
}

/**
 * Injectable function to list SSC documents for a ticker and period.
 * Matches the signature of listSscDocuments from ssc.ts.
 */
export type SscDocumentLookup = (
  code: string,
  quarter: string,
  year: number,
) => Promise<SscDoc[]>;

// ---------------------------------------------------------------------------
// Fallback portal URLs (same as the original hardcoded list in server.ts)
// ---------------------------------------------------------------------------

function fallbackHints(actionCode: string): string[] {
  return [
    `https://congbothongtin.ssc.gov.vn/faces/NewsSearch`,
    `https://www.hsx.vn/Modules/Listed/Web/StockDisclosure/${actionCode}`,
    `https://hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=${actionCode}`,
    `https://upcom.hnx.vn/cong-bo-thong-tin/cong-ty-co-phan.html?StockCode=${actionCode}`,
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enrich a list of BCTC queue items with PDF URLs from the SSC portal.
 *
 * For each item where source_url is null or empty:
 *   - Calls listDocs(action_code, period_quarter, period_year)
 *   - Uses the first returned document URL as source_url
 *   - Errors are caught silently — source_url remains null on failure
 *
 * Items that already have source_url set are skipped (no redundant fetch).
 *
 * @param items    - Queue items to enrich
 * @param listDocs - Injectable SSC document lookup function
 * @returns        - Copy of items with source_url populated where possible
 */
export async function enrichQueueWithPdfUrls(
  items: BctcQueueItem[],
  listDocs: SscDocumentLookup,
): Promise<BctcQueueItem[]> {
  const result: BctcQueueItem[] = [];

  for (const item of items) {
    // Skip items that already have a cached PDF URL
    if (item.source_url) {
      result.push({ ...item });
      continue;
    }

    let pdfUrl: string | null = null;

    try {
      const docs = await listDocs(item.action_code, item.period_quarter, item.period_year);
      if (docs.length > 0 && docs[0]!.url) {
        pdfUrl = docs[0]!.url;
        logger.debug("[bctcQueueEnricher] discovered PDF URL", {
          code: item.action_code,
          quarter: item.period_quarter,
          year: item.period_year,
          pdfUrl,
        });
      }
    } catch (err) {
      logger.warn("[bctcQueueEnricher] listDocs failed — skipping PDF URL", {
        code: item.action_code,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    result.push({ ...item, source_url: pdfUrl });
  }

  return result;
}

/**
 * Build the ordered source_hints array for a BCTC queue item.
 *
 * Order:
 *   1. PDF URL (source_url) — if available, VPS fetches directly
 *   2. Fallback portal URLs — VPS can try discovery if PDF URL fails
 *
 * @param item - Queue item (possibly enriched with source_url)
 * @returns    - Ordered array of URLs for the VPS to try
 */
export function buildQueueSourceHints(item: BctcQueueItem): string[] {
  const hints: string[] = [];

  if (item.source_url) {
    hints.push(item.source_url);
  }

  hints.push(...fallbackHints(item.action_code));

  return hints;
}
