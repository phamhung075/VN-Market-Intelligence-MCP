/**
 * Task 048 — SSC Fetch → Parse → Store Pipeline
 * Task 293 — OCR cache fallback wiring
 * size-justification: 217L — FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-
 * LATEST (2026-08-12) added the Step 1 quarter-aware selection call +
 * fail-loud debounced-Telegram error branch (~35L) inline at the one call
 * site the architect brief scoped the fix to (selection logic itself lives
 * in the new bctc/selectSscDocument.ts sibling, kept small); further
 * extraction would split one already-small Step 1 block across two files
 * for no readability gain. +46L: FIX-BCTC-DATA-GAP-FAMILY U3.2 (2026-08-29)
 * added the period-mismatch queue-recovery path (markQueueRowUrlNotFound
 * helper + catch-branch wiring) — a cohesive ~40L recovery block that must
 * stay adjacent to the parseBctcReport catch site it guards.
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
import { selectSscDocumentForPeriod, SscDocumentPeriodNotFoundError } from "./bctc/selectSscDocument.js";
import { BctcPeriodContentMismatchError } from "../../domain/services/financial-reports/periodContentExtractor.js";
import {
  isBctcSignalDebounced,
  recordBctcSignalSent,
  BCTC_SIGNAL_DEBOUNCE_HOURS,
} from "../../infrastructure/db/bctcSignalDebounce.js";
import { isZeroExtractDeadLettered } from "../../infrastructure/db/bctcZeroExtractBlocklist.js";

import type { FinancialReport } from "../../../bctc-schema.js";
import type { FetchParseAndStoreBctcParams } from "./bctc/types.js";

export { normaliseFilename };
export type { QuarterString, InsertAnalysisFn, FetchParseAndStoreBctcParams } from "./bctc/types.js";

/**
 * FIX-BCTC-DATA-GAP-FAMILY U3.2: park the matching bctc_vps_queue row at
 * 'url_not_found' so the enricher's Arm-2 grace re-discovery (U1) can re-fire
 * discovery after the 7-day grace instead of leaving the row 'pending'
 * forever (the runPipeline-null loop on manual re-push, live BID 2025-Q4).
 * Non-fatal: the queue table may be absent in some test harnesses.
 */
function markQueueRowUrlNotFound(
  db: ReturnType<typeof getDb>,
  actionCode: string,
  year: number,
  periodType: string | null,
): void {
  if (!periodType) return;
  try {
    db.prepare(
      `UPDATE bctc_vps_queue
       SET status = 'url_not_found', attempts = attempts + 1, last_attempt = datetime('now')
       WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
    ).run(actionCode, year, periodType);
    logger.warn(`[fetchParseAndStoreBctc] ${actionCode} ${year}-${periodType} queue row parked at url_not_found (period-mismatch) — enricher Arm-2 will re-discover after grace`);
  } catch (err) {
    logger.warn("[fetchParseAndStoreBctc] queue-row url_not_found marking failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

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
    pdfTextOverride, insertAnalysisFn, insertAnalysisResolverFn, pdfUrl, enableBctcFallback = false,
  } = params;

  const tag = `[fetchParseAndStoreBctc] ${actionCode} ${year}-${quarter}`;

  // Computed once, up-front — Step 1 selection (below) and Step 3 parsing
  // (further down) both need the numeric quarter / sortKey.
  const period = buildFiscalPeriod(year, quarter);

  // FIX-BCTC-ZEROEXTRACT-BLOCK-NO-FAILURE-RECORD-UNBOUNDED-REEXTRACT-LOOP:
  // once (actionCode, sortKey) has been dead-lettered by repeated
  // totalAssets<=0 write-blocks (parseBctcReport.ts storeReport()), stop
  // re-attempting the pipeline entirely. This is the actual loop-breaker —
  // storeReport's own guard only ever refused the INSERT; it never stopped
  // this function (called by checkSscReports.ts nightly, bctcReparseJob.ts
  // daily, and pushBctcExtraction.ts) from re-running SSC listing + PDF
  // OCR + parsing on the same doomed pair on every cycle.
  if (isZeroExtractDeadLettered(getDb(), actionCode, period.sortKey)) {
    logger.warn(`${tag} dead-lettered after repeated zero-extraction blocks — skipping re-attempt`);
    return null;
  }

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
    // FIX-BCTC-SSC-DOC-SELECTION-QUARTER-BLIND-ALWAYS-LATEST: select the
    // candidate whose title/publishedAt-derived period matches the
    // requested (year, quarter) instead of taking docs[0] unconditionally
    // (docs[0] silently resolved to whatever the portal listed first,
    // producing 100+ live period-mismatch refusals downstream — see
    // docs/architecture-briefs/2026-08-05-fix-bctc-ssc-doc-selection-quarter-blind.md).
    try {
      doc = selectSscDocumentForPeriod(docs, actionCode, year, period.quarter!);
    } catch (err) {
      if (!(err instanceof SscDocumentPeriodNotFoundError)) throw err;

      logger.error(`${tag} ${err.message}`);

      // Fail-loud idiom mirrored from parseBctcReport.ts's period-mismatch
      // guard (debounce-gated Telegram bug — never a raw per-call send).
      const debounceKey = `${year}-Q${period.quarter}:doc-selection-not-found`;
      const debounceDb = getDb();
      if (!isBctcSignalDebounced(debounceDb, actionCode, debounceKey, BCTC_SIGNAL_DEBOUNCE_HOURS)) {
        recordBctcSignalSent(debounceDb, actionCode, debounceKey);
        const { sendTelegramBug } = await import("../../infrastructure/notifiers/telegram.js");
        await sendTelegramBug(err.message).catch(() => {});
      }

      // Preserves fetchParseAndStoreBctc's documented contract ("returns
      // null, never throws, when no documents are found") while still being
      // observably loud — distinguishable in logs/Telegram from the
      // pre-existing "portal returned zero documents" case above.
      return null;
    }
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

  let report: FinancialReport;
  try {
    // FIX-BCTC-REPARSE-BATCH-CORRUPTION-NGAYNOP-FLIP: pass the real SSC
    // filing date (doc.publishedAt) INTO parseBctcReport so it lands in the
    // DB write itself. Previously this was patched onto the in-memory
    // `report` object AFTER parseBctcReport had already persisted (see the
    // removed line below) — that patch never reached SQLite, so the stored
    // published_at was always parsedAt (the processing timestamp), on both
    // first ingest AND every subsequent re-parse.
    report = await parseBctcReport({ rawText, actionCode, period, publishedAt: doc.publishedAt ?? null });
  } catch (err) {
    logger.error(`${tag} parseBctcReport failed`, { error: err instanceof Error ? err.message : String(err) });
    // FIX-BCTC-DATA-GAP-FAMILY U3.2: when the period-content guard fired, do
    // NOT leave the queue row 'pending' — park it at 'url_not_found' for
    // enricher re-discovery (see markQueueRowUrlNotFound doc).
    if (err instanceof BctcPeriodContentMismatchError) {
      markQueueRowUrlNotFound(getDb(), actionCode, year, period.periodType);
    }
    return null;
  }

  // Patch source URL + local PDF path (Task 1002) — informational on the
  // returned in-memory object only; ssc_url/pdf_path persistence is a
  // separate, pre-existing gap out of scope for this fix.
  report.source.sscUrl = doc.url;
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
  await insertBctcAnalysis({ report, doc, actionCode, year, quarter, insertAnalysisFn, insertAnalysisResolverFn, tag });

  logger.info(`${tag} pipeline complete`, { reportId: report.id });
  return report;
}
