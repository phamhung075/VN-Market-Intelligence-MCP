/**
 * FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST
 *
 * Application use case (bctc/ split sibling — same FACTORY-APP-split-
 * fetchParseAndStoreBctc convention as resolvePdfText.ts / newsChainFallback.ts
 * / insertBctcAnalysis.ts / types.ts).
 *
 * Selects the `SscDocument` among `listSscDocuments()`'s unfiltered candidate
 * array whose derived period matches the caller's requested (year, quarter),
 * instead of `fetchParseAndStoreBctc.ts` Step 1 taking `docs[0]`
 * unconditionally (whatever the portal happened to list first — the root
 * cause of 100+ live period-mismatch refusals).
 *
 * Two independent signals, title first (clean DOM text — most specific via
 * `documentTitlePeriodExtractor.ts`), falling back to `publishedAt` (the
 * already-shipped/tested `deriveQuarterFromPublishedAt` Vietnamese
 * filing-deadline calendar in checkSscReports.ts) only when the title cannot
 * be parsed. Fails loud with `SscDocumentPeriodNotFoundError` when NO
 * candidate matches — the caller must never fall back to `docs[0]` on this
 * error (that would silently reintroduce this exact defect).
 *
 * `listSscDocuments()`/`listSscDocumentsWithFlag()` themselves are NOT
 * touched — `checkSscReports.ts:defaultListDocs()` depends on getting back
 * ALL quarters for a year for its own new-report-detection loop; narrowing
 * that contract would break it. This selection layer sits only at
 * `fetchParseAndStoreBctc.ts`'s Step 1 call site.
 *
 * Full design: docs/architecture-briefs/2026-08-05-fix-bctc-ssc-doc-selection-quarter-blind.md
 *
 * Layer: application/usecases — application → application import of
 * `deriveQuarterFromPublishedAt` from checkSscReports.ts is not a layering
 * violation (both are application/usecases).
 */

import { extractPeriodFromTitle } from "../../../domain/services/financial-reports/documentTitlePeriodExtractor.js";
import { deriveQuarterFromPublishedAt } from "../checkSscReports.js";
import { buildFiscalPeriod } from "./newsChainFallback.js";

import type { SscDocument } from "../../../infrastructure/fetchers/ssc.js";

/**
 * Thrown when no candidate document's title or publish-date signal matches
 * the requested (year, quarter). Mirrors `BctcPeriodContentMismatchError`'s
 * shape (periodContentExtractor.ts) — names the ticker, requested period, and
 * candidate count. The caller must NEVER fall back to `docs[0]` on this error.
 */
export class SscDocumentPeriodNotFoundError extends Error {
  constructor(
    public readonly actionCode: string,
    public readonly year: number,
    public readonly quarter: 1 | 2 | 3 | 4,
    public readonly candidateCount: number,
  ) {
    super(
      `[BCTC] No SSC document found for ${actionCode} ${year}-Q${quarter} among ` +
        `${candidateCount} candidate document(s) — no title or publish-date signal ` +
        `matched the requested period. Refusing to select an unrelated document.`,
    );
    this.name = "SscDocumentPeriodNotFoundError";
  }
}

/**
 * Selects the document among `docs` whose derived period matches (year, quarter).
 *
 * @param docs       - Candidate documents from `listSscDocuments` (unfiltered by quarter).
 * @param actionCode - Stock ticker — carried into the thrown error only.
 * @param year       - Requested fiscal year.
 * @param quarter    - Requested fiscal quarter (numeric, 1-4).
 * @throws SscDocumentPeriodNotFoundError when no candidate matches.
 */
export function selectSscDocumentForPeriod(
  docs: SscDocument[],
  actionCode: string,
  year: number,
  quarter: 1 | 2 | 3 | 4,
): SscDocument {
  for (const doc of docs) {
    let signal = extractPeriodFromTitle(doc.title);

    // Fallback signal: publishedAt via the already-shipped/tested
    // deriveQuarterFromPublishedAt (Vietnamese filing-deadline calendar),
    // only when the title cannot be parsed. Empty publishedAt is guarded
    // explicitly — that function's own fallback (Q1 of the current year)
    // exists for its original caller (checkSscReports.ts, which always has
    // a real portal-supplied date) and must never be trusted as a real
    // selection signal here.
    if (!signal && doc.publishedAt && doc.publishedAt.trim().length > 0) {
      const derived = deriveQuarterFromPublishedAt(doc.publishedAt);
      // Reuses buildFiscalPeriod's existing QuarterString -> 1|2|3|4 table
      // rather than duplicating a second one.
      signal = { year: derived.year, quarter: buildFiscalPeriod(derived.year, derived.quarter).quarter as 1 | 2 | 3 | 4 };
    }

    if (signal && signal.year === year && signal.quarter === quarter) {
      return doc;
    }
  }
  throw new SscDocumentPeriodNotFoundError(actionCode, year, quarter, docs.length);
}
