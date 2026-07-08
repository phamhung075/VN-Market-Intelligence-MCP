/**
 * Task 048 — SSC Fetch → Parse → Store Pipeline
 * Task 293 — OCR cache fallback wiring
 *
 * Application use case: orchestrates the full BCTC fetch-parse-store pipeline.
 *
 * Pipeline: Step 1 resolve SSC document URL → Step 2 resolve PDF text (OCR +
 * news-chain fallback, delegated to bctc/resolvePdfText.ts) → Step 3 parse into
 * a FinancialReport (bctc/newsChainFallback.ts supplies buildFiscalPeriod) →
 * Step 4 embed summary into LanceDB (delegated to bctc/insertBctcAnalysis.ts).
 *
 * FACTORY-APP-split-fetchParseAndStoreBctc (2026-07-08): split into
 * bctc/types.ts (shared types), bctc/resolvePdfText.ts (Step 2 + OCR fallback),
 * bctc/newsChainFallback.ts (Task 1294b news-chain fallback + period/summary
 * helpers), bctc/insertBctcAnalysis.ts (Step 4). This file is now a thin
 * Step 1/3/4-sequencer orchestrator.
 *
 * All external I/O dependencies are injectable so they can be mocked in tests.
 * Layering: this file (application) may import from both domain/ and infrastructure/.
 */

import { join } from "node:path";

import { listSscDocuments } from "../../infrastructure/fetchers/ssc.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
import { parseBctcReport } from "./parseBctcReport.js";
import { resolvePdfText, normaliseFilename } from "./bctc/resolvePdfText.js";
import { buildFiscalPeriod } from "./bctc/newsChainFallback.js";
import { insertBctcAnalysis } from "./bctc/insertBctcAnalysis.js";

import type { FinancialReport } from "../../../bctc-schema.js";
import type { FetchParseAndStoreBctcParams } from "./bctc/types.js";

export { normaliseFilename };
export type { QuarterString, InsertAnalysisFn, FetchParseAndStoreBctcParams } from "./bctc/types.js";

/**
 * Full BCTC pipeline: SSC portal scrape → PDF download + parse → SQLite + LanceDB store.
 *
 * Returns `null` (never throws) when no documents are found, PDF extraction
 * yields empty text, or fallback signals are insufficient/contradictory.
 * Throws when a PDF timeout occurs and enableBctcFallback=false.
 */
export async function fetchParseAndStoreBctc(
  params: FetchParseAndStoreBctcParams,
): Promise<(FinancialReport & { fallback?: boolean; extraction_method?: string; confidence?: number; reason?: string }) | null> {
  const {
    actionCode, year, quarter, sscHttpClient, pdfHttpClient,
    pdfTextOverride, insertAnalysisFn, pdfUrl, enableBctcFallback = false,
  } = params;

  const tag = `[fetchParseAndStoreBctc] ${actionCode} ${year}-${quarter}`;

  // ── Step 1: Resolve SSC document URL ───────────────────────────────────────
  // Task 289: if caller supplied pdfUrl, skip the listing step entirely.
  let doc: { url: string; publishedAt?: string };
  if (pdfUrl) {
    logger.info(`${tag} step 1: using supplied pdfUrl (bypass SSC listing)`);
    doc = { url: pdfUrl };
  } else {
    logger.info(`${tag} step 1: listing SSC documents`);
    const docs = await listSscDocuments(actionCode, "quarterly", year, sscHttpClient);
    if (docs.length === 0) {
      logger.warn(`${tag} no documents found — aborting`);
      return null;
    }
    doc = docs[0]!;
    logger.info(`${tag} using document`, { url: doc.url, publishedAt: doc.publishedAt });
  }

  // ── Step 2: Resolve PDF text (OCR + news-chain fallback) ───────────────────
  const resolved = await resolvePdfText({ actionCode, year, quarter, doc, pdfHttpClient, pdfTextOverride, enableBctcFallback, tag });
  if (resolved.status === "final") {
    return resolved.report;
  }
  const { rawText, resolvedExtractionMethod } = resolved;

  // ── Step 3: Parse BCTC text → FinancialReport ──────────────────────────────
  logger.info(`${tag} step 3: parsing BCTC text`);

  const period = buildFiscalPeriod(year, quarter);

  let report: FinancialReport;
  try {
    report = await parseBctcReport({ rawText, actionCode, period });
  } catch (err) {
    logger.error(`${tag} parseBctcReport failed`, { error: err instanceof Error ? err.message : String(err) });
    return null;
  }

  // Patch source URL from SSC portal + local PDF path (Task 1002)
  report.source.sscUrl = doc.url;
  report.source.publishedAt = doc.publishedAt || report.source.parsedAt;
  const normFilename = normaliseFilename(doc.url, actionCode, year, quarter);
  report.source.pdfPath = join(process.cwd(), "data", "pdfs", normFilename);

  // Bug 1352a: stamp extraction_method with the correct resolved value.
  const db = getDb();
  try {
    db.prepare(`
      UPDATE financial_reports
      SET extraction_method = ?
      WHERE action_code = ? AND sort_key = ?
    `).run(resolvedExtractionMethod, actionCode, period.sortKey);
    logger.info(`${tag} stamped extraction_method='${resolvedExtractionMethod}'`);
  } catch (err) {
    logger.warn(`${tag} failed to stamp extraction_method`, { error: err instanceof Error ? err.message : String(err) });
  }
  (report as unknown as Record<string, unknown>).extraction_method = resolvedExtractionMethod;

  // ── Step 4: Embed into LanceDB ────────────────────────────────────────────
  await insertBctcAnalysis({ report, doc, actionCode, year, quarter, insertAnalysisFn, tag });

  logger.info(`${tag} pipeline complete`, { reportId: report.id });
  return report;
}
