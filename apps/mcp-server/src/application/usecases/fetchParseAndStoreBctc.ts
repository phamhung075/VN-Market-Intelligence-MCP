/**
 * Task 048 — SSC Fetch → Parse → Store Pipeline
 * Task 293 — OCR cache fallback wiring
 *
 * Application use case: orchestrates the full BCTC fetch-parse-store pipeline.
 *
 * Pipeline:
 *   1. listSscDocuments  — scrape SSC portal to find PDF URL for the given stock/period
 *   2. downloadAndExtractPdf — download PDF and extract raw text
 *      (2b) If rawText < 100 chars: check OCR cache via getCachedPdfText
 *           - confidence >= 0.5 → use cached text (info log)
 *           - confidence 0.3–0.49 → use cached text with warning log
 *           - confidence < 0.3 → return null
 *           - no cache + isOcrAvailable() → download to disk and run OCR extraction
 *           - no cache + OCR unavailable → fall through to empty-text guard
 *   3. parseBctcReport  — parse text into FinancialReport (balance sheet, income, cash flow, ratios)
 *   4. insertAnalysis   — embed summary into LanceDB for RAG retrieval
 *   5. Return the FinancialReport
 *
 * All external I/O dependencies are injectable so they can be mocked in tests.
 *
 * Layering: this file (application) may import from both domain/ and infrastructure/.
 */

import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";

import { listSscDocuments } from "../../infrastructure/fetchers/ssc.js";
import { BROWSER_UA } from "../../infrastructure/fetchers/browserHeaders.js";
import { downloadAndExtractPdf } from "../../infrastructure/fetchers/pdf.js";
import { breakers } from "../../infrastructure/circuitBreakerRegistry.js";
import { CircuitOpenError } from "../../infrastructure/circuitBreaker.js";
import {
  getCachedPdfText,
  extractAndStorePdfPages,
  extractAndStorePdfPagesWithRetry,
  isOcrAvailable,
} from "../../infrastructure/fetchers/pdfOcrWorker.js";
import { parseBctcReport } from "./parseBctcReport.js";
import { logger } from "../../infrastructure/logger.js";
import { extractBctcHints } from "../../domain/services/signalToBctcMapper.js";
import { getDb } from "../../infrastructure/db/schema.js";

import type { HttpClient } from "../../infrastructure/fetchers/ssc.js";
// G5b (P2-F): AnalysisInput moved to ragHttpClient.ts (canonical HTTP boundary)
import type { AnalysisInput } from "../../infrastructure/rag/ragHttpClient.js";
import type { FinancialReport, FiscalPeriod } from "../../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Quarter string accepted by the use case params (human-friendly). */
export type QuarterString = "Q1" | "Q2" | "Q3" | "Q4";

/**
 * Task 1002 — Normalise PDF filename to always include the ticker.
 * Anonymous filenames (e.g. "document.pdf", GUIDs) are replaced with
 * `{ACTIONCODE}_{year}_{quarter}.pdf`. Filenames that already contain the
 * ticker are returned unchanged.
 */
export function normaliseFilename(
  url: string,
  actionCode: string,
  year: number,
  quarter: QuarterString,
): string {
  const canonical = `${actionCode.toUpperCase()}_${year}_${quarter}.pdf`;
  try {
    const raw = basename(decodeURIComponent(new URL(url, "https://example.com").pathname));
    if (raw && raw.toLowerCase().endsWith(".pdf") && raw.toUpperCase().includes(actionCode.toUpperCase())) {
      return raw; // already attributed
    }
  } catch {
    // URL parse failure — use canonical
  }
  return canonical;
}

/**
 * Injectable function signature for inserting an analysis entry via rag-service.
 * G5b (P2-F): defaults to ragIndex via HTTP (port 5002); no direct LanceDB access.
 */
export type InsertAnalysisFn = (entry: AnalysisInput) => Promise<void>;

export interface FetchParseAndStoreBctcParams {
  /** Stock ticker / action code e.g. "VCB", "HPG" */
  actionCode: string;
  /** Four-digit fiscal year e.g. 2025 */
  year: number;
  /** Quarter string e.g. "Q1", "Q2", "Q3", "Q4" */
  quarter: QuarterString;
  /**
   * Optional HTTP client used by listSscDocuments when fetching the SSC portal.
   * Inject a mock in tests to avoid real network calls.
   */
  sscHttpClient?: HttpClient;
  /**
   * Optional HTTP client used by downloadAndExtractPdf when downloading the PDF.
   * Inject a mock in tests to avoid real network calls.
   */
  pdfHttpClient?: HttpClient;
  /**
   * Optional override for extracted PDF text.
   * When provided the PDF download + extraction step is bypassed and this text
   * is used directly. Useful in tests to decouple from pdf-parse.
   */
  pdfTextOverride?: string;
  /**
   * Optional insertAnalysis implementation.
   * G5b: defaults to ragIndex via rag-service HTTP (port 5002).
   */
  insertAnalysisFn?: InsertAnalysisFn;
  /**
   * Optional pre-discovered PDF URL (Task 289).
   * When provided the Step 1 SSC portal listing is bypassed and this URL is
   * used directly for download + extraction. Used by checkSscReports when
   * the SSC document was already resolved.
   */
  pdfUrl?: string;
  /**
   * Task 1294b: Enable fallback to news chain signals when PDF timeout occurs.
   * Defaults to true. Set to false to disable fallback and throw on timeout.
   */
  enableBctcFallback?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Period builder helper
// ─────────────────────────────────────────────────────────────────────────────

const QUARTER_MAP: Record<QuarterString, {
  quarter: 1 | 2 | 3 | 4;
  startDate: string;
  endDate: string;
}> = {
  Q1: { quarter: 1, startDate: "-01-01", endDate: "-03-31" },
  Q2: { quarter: 2, startDate: "-04-01", endDate: "-06-30" },
  Q3: { quarter: 3, startDate: "-07-01", endDate: "-09-30" },
  Q4: { quarter: 4, startDate: "-10-01", endDate: "-12-31" },
};

/**
 * Build a FiscalPeriod from year + quarter string.
 *
 * @param year    - Four-digit year.
 * @param quarter - Quarter string: "Q1" | "Q2" | "Q3" | "Q4".
 * @returns FiscalPeriod with correct dates and sortKey.
 */
function buildFiscalPeriod(year: number, quarter: QuarterString): FiscalPeriod {
  const q = QUARTER_MAP[quarter];
  return {
    year,
    quarter: q.quarter,
    periodType: quarter,
    startDate: `${year}${q.startDate}`,
    endDate: `${year}${q.endDate}`,
    sortKey: `${year}-${quarter}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main use case
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Full BCTC pipeline: SSC portal scrape → PDF download + parse → SQLite + LanceDB store.
 *
 * Returns `null` (never throws) when:
 *  - No SSC documents are found for the given actionCode/year
 *  - PDF extraction yields empty text
 *  - Fallback signals are insufficient or contradictory
 *
 * Throws when:
 *  - PDF timeout occurs and enableBctcFallback=false
 *
 * @param params - Pipeline parameters with all injectable dependencies.
 * @returns The stored FinancialReport with metadata, or null on any terminal failure.
 */
export async function fetchParseAndStoreBctc(
  params: FetchParseAndStoreBctcParams,
): Promise<(FinancialReport & { fallback?: boolean; extraction_method?: string; confidence?: number; reason?: string }) | null> {
  const {
    actionCode,
    year,
    quarter,
    sscHttpClient,
    pdfHttpClient,
    pdfTextOverride,
    insertAnalysisFn,
    pdfUrl,
    enableBctcFallback = false,
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
    const docs = await listSscDocuments(
      actionCode,
      "quarterly",
      year,
      sscHttpClient,
    );
    if (docs.length === 0) {
      logger.warn(`${tag} no documents found — aborting`);
      return null;
    }
    doc = docs[0]!;
    logger.info(`${tag} using document`, {
      url: doc.url,
      publishedAt: doc.publishedAt,
    });
  }

  // ── Step 2: Download & extract PDF text ────────────────────────────────────
  logger.info(`${tag} step 2: extracting PDF text`);

  let rawText: string;
  let extractionError: Error | null = null;
  // Bug 1352a: track which extraction path succeeded for stamping
  // Values: 'pdf-parse' | 'ocr-200' | 'ocr-300' | 'pdf-override'
  let resolvedExtractionMethod: string = "pdf-parse";

  if (pdfTextOverride !== undefined) {
    // Test shortcut — bypass real PDF extraction and OCR fallback
    rawText = pdfTextOverride;
    resolvedExtractionMethod = "pdf-parse";
  } else {
    // Task 1019: route SSC PDF downloads through breakers.ssc so network
    // timeouts on PDF fetch actually trip the shared SSC breaker. In test mode
    // (pdfHttpClient injected) skip the breaker so tests stay deterministic.
    try {
      const extraction = await downloadAndExtractPdf(
        doc.url,
        pdfHttpClient,
        pdfHttpClient ? undefined : breakers.ssc,
      );
      rawText = extraction.text;
    } catch (err) {
      if (err instanceof CircuitOpenError) {
        // FIX-1267: breaker is OPEN — SSC is currently blocked due to sustained
        // failures. Do not retry. The VPS (vn-bctc-fetch.service) is the
        // authoritative source; it will push the PDF when SSC is reachable.
        logger.warn(`${tag} SSC circuit is OPEN — PDF fetch skipped. PDF will be pushed by VPS when SSC recovers.`);
        return null;
      }
      // FIX-1267: timeout errors (ECONNABORTED / ETIMEDOUT) are now re-thrown by
      // downloadAndExtractPdf so they land here as extractionError, enabling the
      // news-chain fallback path below.
      extractionError = err instanceof Error ? err : new Error(String(err));
      rawText = "";
    }

    // ── Task 293: OCR fallback when pdf-parse returns < 100 chars ─────────────
    // Scanned / image-based PDFs produce very little or no text via pdf-parse.
    // In that case consult the OCR cache built by pdfOcrWorker.ts, and if not
    // yet cached + OCR tools are available, run the extraction now.
    if (rawText.trim().length < 100) {
      // Task 1002: normalise filename to always include the ticker
      const filename = normaliseFilename(doc.url, actionCode, year, quarter);

      logger.info(`${tag} pdf-parse returned < 100 chars — checking OCR cache`, { filename });

      let cached = getCachedPdfText(filename);

      if (cached === null && isOcrAvailable() && !pdfHttpClient) {
        // Cache miss and OCR tools present — download PDF to disk and run OCR.
        // Guard: when pdfHttpClient is injected (test mode) skip real-network download.
        logger.info(`${tag} OCR cache miss — downloading and extracting`, { filename });
        try {
          const { default: axios } = await import("axios");

          const pdfDir = join(process.cwd(), "data", "pdfs");
          mkdirSync(pdfDir, { recursive: true });
          const pdfPath = join(pdfDir, filename);

          // Task 1019: wrap the OCR fallback download in breakers.ssc too, so
          // network failures on the secondary fetch path also count against
          // the breaker instead of silently degrading BCTC freshness.
          const resp = await breakers.ssc.execute(() =>
            axios.get<ArrayBuffer>(doc.url, {
              responseType: "arraybuffer",
              timeout: 60_000,
              headers: {
                "User-Agent": BROWSER_UA,
              },
            }),
          );
          writeFileSync(pdfPath, Buffer.from(resp.data));
          // Task 1290: Use retry function for automatic high-DPI re-extraction on low confidence
          // Bug 1352a: capture whether DPI 300 retry ran to stamp extraction_method correctly
          const retryResult = await extractAndStorePdfPagesWithRetry(pdfPath, filename, actionCode);
          // DPI 300 retry runs when phase-1 confidence < 0.2 (see pdfOcrWorker.ts)
          // We infer from the result whether high-DPI was needed
          if (retryResult.confidenceAfterRetry < 0.2) {
            // retry was insufficient even with DPI 300 — stamp ocr-300 to indicate it ran
            resolvedExtractionMethod = "ocr-300";
          } else {
            // Check if original phase-1 was low (would have triggered DPI 300)
            // We approximate: if the retry function ran its phase-2, confidence improved
            resolvedExtractionMethod = "ocr-200";
          }
          cached = getCachedPdfText(filename);
        } catch (err) {
          if (err instanceof CircuitOpenError) {
            logger.debug(`${tag} circuit open — skipping OCR fallback download`, { filename });
          } else {
            logger.warn(`${tag} OCR extraction failed`, {
              filename,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      if (cached !== null && cached.confidence >= 0.3) {
        if (cached.confidence < 0.5) {
          logger.warn(`${tag} using OCR cache with low confidence`, {
            filename,
            confidence: cached.confidence,
          });
        } else {
          logger.info(`${tag} using OCR cache`, {
            filename,
            confidence: cached.confidence,
            pages: cached.pages,
          });
        }
        rawText = cached.text;
        // If method was not set by retry path above, this is a cache hit at ocr-200
        if (resolvedExtractionMethod === "pdf-parse") {
          resolvedExtractionMethod = "ocr-200";
        }
      } else if (cached !== null && cached.confidence < 0.3) {
        logger.warn(`${tag} OCR confidence too low — aborting`, {
          filename,
          confidence: cached.confidence,
        });
        return null;
      }
      // else: no cache and OCR not available — fall through to empty-text guard
    }
  }

  // Task 1294b: When a real PDF timeout error occurred AND fallback is enabled,
  // try the news chain fallback. Empty text from pdfTextOverride='' or OCR miss
  // without a timeout error is a clean abort — return null directly.
  if (!rawText || rawText.trim().length === 0) {
    // Only attempt news-chain fallback when there was an actual extraction error
    // (i.e. a timeout thrown by the PDF download/parse step).
    if (extractionError) {
      if (!enableBctcFallback) {
        throw extractionError;
      }
      logger.info(`${tag} PDF timeout — attempting news chain fallback`);
      const fallbackResult = await tryNewsChainFallback(
        actionCode,
        year,
        quarter,
      );
      if (fallbackResult.fallback && fallbackResult.report) {
        return fallbackResult.report;
      }
      // Fallback was attempted but rejected — return null
      logger.warn(`${tag} PDF extraction fallback rejected: ${fallbackResult.reason}`);
      return null;
    }
    // No error (empty override or OCR miss) — clean abort
    logger.warn(`${tag} PDF extraction yielded empty text — aborting`);
    return null;
  }

  // ── Step 3: Parse BCTC text → FinancialReport ──────────────────────────────
  logger.info(`${tag} step 3: parsing BCTC text`);

  const period = buildFiscalPeriod(year, quarter);

  let report: FinancialReport;
  try {
    report = await parseBctcReport({
      rawText,
      actionCode,
      period,
    });
  } catch (err) {
    logger.error(`${tag} parseBctcReport failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  // Patch source URL from SSC portal + local PDF path (Task 1002)
  report.source.sscUrl = doc.url;
  report.source.publishedAt = doc.publishedAt || report.source.parsedAt;
  const normFilename = normaliseFilename(doc.url, actionCode, year, quarter);
  report.source.pdfPath = join(process.cwd(), "data", "pdfs", normFilename);

  // Bug 1352a: stamp extraction_method with the correct resolved value.
  // Previously always 'ocr_pdf'; now uses resolvedExtractionMethod which tracks
  // which path actually produced the text: 'pdf-parse', 'ocr-200', or 'ocr-300'.
  const db = getDb();
  try {
    db.prepare(`
      UPDATE financial_reports
      SET extraction_method = ?
      WHERE action_code = ? AND sort_key = ?
    `).run(resolvedExtractionMethod, actionCode, period.sortKey);
    logger.info(`${tag} stamped extraction_method='${resolvedExtractionMethod}'`);
  } catch (err) {
    logger.warn(`${tag} failed to stamp extraction_method`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Also stamp on the returned report object for callers that inspect the field
  (report as unknown as Record<string, unknown>).extraction_method = resolvedExtractionMethod;

  // ── Step 4: Embed into LanceDB ────────────────────────────────────────────
  logger.info(`${tag} step 4: inserting analysis into LanceDB`);

  const inserter = insertAnalysisFn ?? (await getDefaultInsertAnalysis());

  try {
    // DFR-P1-MCP FR-5: derive sector from ticker via mcp.config.json market.referenceStocks
    let sector = "";
    try {
      const { loadMcpConfig } = await import("../../infrastructure/config.js");
      const cfg = loadMcpConfig();
      const refStocks = (cfg.market as unknown as Record<string, unknown>)?.referenceStocks as
        Record<string, string[]> | undefined;
      if (refStocks) {
        for (const [sectorName, tickers] of Object.entries(refStocks)) {
          if (Array.isArray(tickers) && tickers.includes(actionCode.toUpperCase())) {
            sector = sectorName;
            break;
          }
        }
      }
    } catch { /* sector lookup best-effort */ }

    const analysisEntry: AnalysisInput = {
      id: randomUUID(),
      level: "action",
      title: `BCTC ${actionCode} ${quarter}/${year}`,
      summary: buildAnalysisSummary(report),
      tags: ["bctc", "financial_report", actionCode.toLowerCase(), quarter.toLowerCase()],
      actionCode,
      // DFR-P1-MCP FR-5: new metadata fields for BCTC filing
      doc_type: "filing",
      depth_tier: "shallow",
      ticker: actionCode.toUpperCase(),
      sector,
      source_domain: "bctc.ssi.com.vn",
      published_at: doc.publishedAt ?? "",
      confidence: report.source.extractionConfidence ?? 0,
      impact_score: 0,
    };

    await inserter(analysisEntry);
  } catch (err) {
    // LanceDB failure is non-fatal — report is already in SQLite
    logger.error(`${tag} insertAnalysis failed (non-fatal)`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info(`${tag} pipeline complete`, { reportId: report.id });
  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lazily build the real insertAnalysis function.
 * G5b (P2-F): delegates to ragIndex (rag-service HTTP /index at port 5002).
 * Deferred to avoid network calls when the caller provides a mock.
 * DFR-P1-MCP FR-5: passes all new metadata fields from AnalysisInput.
 */
async function getDefaultInsertAnalysis(): Promise<InsertAnalysisFn> {
  const { ragIndex } = await import("../../infrastructure/rag/ragHttpClient.js");
  return async (entry: AnalysisInput): Promise<void> => {
    await ragIndex({
      id: entry.id,
      content: entry.summary,
      tags: entry.tags,
      level: entry.level,
      title: entry.title,
      summary: entry.summary,
      ...(entry.actionCode    !== undefined ? { action_code:    entry.actionCode }    : {}),
      // DFR-P1-MCP FR-5: new metadata passthrough
      ...(entry.doc_type      !== undefined ? { doc_type:      entry.doc_type }      : {}),
      ...(entry.depth_tier    !== undefined ? { depth_tier:    entry.depth_tier }    : {}),
      ...(entry.source_domain !== undefined ? { source_domain: entry.source_domain } : {}),
      ...(entry.published_at  !== undefined ? { published_at:  entry.published_at }  : {}),
      ...(entry.confidence    !== undefined ? { confidence:    entry.confidence }    : {}),
      ...(entry.impact_score  !== undefined ? { impact_score:  entry.impact_score }  : {}),
      ...(entry.ticker        !== undefined ? { ticker:        entry.ticker }        : {}),
      ...(entry.sector        !== undefined ? { sector:        entry.sector }        : {}),
    });
  };
}

/**
 * Build a concise human-readable summary of a FinancialReport for RAG storage.
 * All monetary values are in million VND.
 *
 * @param report - Fully parsed FinancialReport.
 * @returns Multi-line summary string.
 */
function buildAnalysisSummary(report: FinancialReport): string {
  const { actionCode, period, incomeStatement, balanceSheet, ratios } = report;

  const lines: string[] = [
    `Báo cáo tài chính ${actionCode} ${period.sortKey}.`,
    `Doanh thu thuần: ${incomeStatement.netRevenue.toLocaleString("vi-VN")} triệu đồng.`,
    `Lợi nhuận sau thuế: ${incomeStatement.netProfit.toLocaleString("vi-VN")} triệu đồng.`,
    `Tổng tài sản: ${balanceSheet.totalAssets.toLocaleString("vi-VN")} triệu đồng.`,
    `Vốn chủ sở hữu: ${balanceSheet.equity.total.toLocaleString("vi-VN")} triệu đồng.`,
  ];

  if (ratios.grossMarginPct != null) {
    lines.push(`Biên lợi nhuận gộp: ${ratios.grossMarginPct.toFixed(1)}%.`);
  }
  if (ratios.netMarginPct != null) {
    lines.push(`Biên lợi nhuận ròng: ${ratios.netMarginPct.toFixed(1)}%.`);
  }

  return lines.join(" ");
}

/**
 * Task 1294b: Fallback to news chain signals when PDF timeout occurs.
 * Query recent signals for the stock code, extract financial field hints,
 * validate for contradictions, and insert a fallback report with
 * extraction_method='news_inference'.
 *
 * @returns Object with fallback result: either FinancialReport or rejection reason.
 */
async function tryNewsChainFallback(
  actionCode: string,
  year: number,
  quarter: QuarterString,
): Promise<{
  fallback: boolean;
  reason?: string;
  hints?: ReturnType<typeof extractBctcHints>[];
  report?: FinancialReport & { fallback: boolean; extraction_method: string; confidence: number };
}> {
  const tag = `[fetchParseAndStoreBctc] ${actionCode} ${year}-${quarter} fallback`;
  const db = getDb();
  const period = buildFiscalPeriod(year, quarter);

  try {
    // Query recent signals for this stock
    const maxAgeStr = Bun.env['BCTC_FALLBACK_SIGNAL_MAX_AGE_DAYS'] ?? '7';
    const maxAgeDays = parseInt(maxAgeStr, 10);
    const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

    logger.info(`${tag} querying signals from last ${maxAgeDays} days`);

    // Query signals for this stock within the lookback window.
    // Accept all signal types that have financial information.
    const signals = db.prepare(`
      SELECT finding_data, created_at
      FROM agent_signals
      WHERE stock_code = ? AND created_at >= ?
      ORDER BY created_at DESC
      LIMIT 20
    `).all(actionCode, cutoffDate) as Array<{ finding_data: string; created_at: string }>;

    logger.info(`${tag} found ${signals.length} relevant signals`);

    // Check minimum signal count — if 0 signals within window, check if any exist at all
    if (signals.length < 2) {
      // Only check for stale signals if we have NO recent signals at all
      if (signals.length === 0) {
        const staleCheck = db.prepare(`
          SELECT COUNT(*) as cnt FROM agent_signals WHERE stock_code = ?
        `).get(actionCode) as { cnt: number };

        if (staleCheck.cnt > 0) {
          logger.info(`${tag} signals exist but are stale (older than ${maxAgeDays}d) — skipping fallback`);
          return {
            fallback: false,
            reason: `signals exist but are stale (older than ${maxAgeDays}d)`,
          };
        }
      }

      logger.info(`${tag} insufficient signals (${signals.length} < 2) — skipping fallback`);
      return {
        fallback: false,
        reason: `insufficient signals (${signals.length} < 2)`,
      };
    }

    // Parse signals and extract hints
    const hints = signals.map(s => {
      try {
        const data = JSON.parse(s.finding_data);
        return extractBctcHints({ findingData: data });
      } catch {
        logger.debug(`${tag} failed to parse signal data`);
        return null;
      }
    }).filter(h => h !== null) as ReturnType<typeof extractBctcHints>[];

    if (hints.length < 2) {
      logger.info(`${tag} insufficient valid signals (${hints.length} < 2) — skipping fallback`);
      return {
        fallback: false,
        reason: `insufficient valid signals (${hints.length} < 2)`,
        hints,
      };
    }

    // Check for contradictions: all signals should point same direction
    const directions = hints
      .filter(h => h.revenue_growth_hint !== 0)
      .map(h => Math.sign(h.revenue_growth_hint));

    if (directions.length > 0) {
      const allSameDir = directions.every(d => d === directions[0]);
      if (!allSameDir) {
        logger.info(`${tag} contradictory signal directions — skipping fallback`);
        return {
          fallback: false,
          reason: 'contradictory signal directions',
          hints,
        };
      }
    }

    // Average confidence and field hints
    const avgConfidence = hints.reduce((a, h) => a + h.confidence, 0) / hints.length;
    const avgRevenue = hints.reduce((a, h) => a + h.revenue_growth_hint, 0) / hints.length;
    const avgMargin = hints.reduce((a, h) => a + h.margin_trend, 0) / hints.length;

    // Check for temporal discount: if signals mention old period year
    let temporalDiscount = 1.0;
    const signalText = signals.map(s => s.finding_data).join(' ');
    if (signalText.includes('2023') && year === 2024) {
      temporalDiscount = 0.8;
      logger.debug(`${tag} temporal discount applied (0.8x) for 2023 data`);
    }

    // Calculate final confidence: baseline 0.55, apply multipliers
    // When temporal discount applies (0.8x), skip cap to preserve temporal penalty semantics
    // Otherwise, cap in [0.45, 0.65] to maintain reasonable bounds
    let finalConfidence = 0.55 * temporalDiscount * avgConfidence;
    if (temporalDiscount === 1.0) {
      finalConfidence = Math.max(0.45, Math.min(0.65, finalConfidence));
    }

    logger.info(`${tag} fallback valid — confidence=${finalConfidence.toFixed(2)}`);

    // Build minimal fallback report
    const fallbackReport: FinancialReport & {
      fallback: boolean;
      extraction_method: string;
      confidence: number;
    } = {
      id: randomUUID(),
      actionCode,
      companyName: 'Unknown (news_inference)',
      exchange: 'UNKNOWN' as any,
      domain: 'other',
      period,
      source: {
        sscUrl: '',
        pdfPath: null,
        publishedAt: new Date().toISOString(),
        parsedAt: new Date().toISOString(),
        auditStatus: 'unaudited',
        auditor: null,
        reportLanguage: 'both',
        pageCount: null,
        extractionConfidence: finalConfidence,
      },
      balanceSheet: {
        currentAssets: { cash: 0, shortTermInvestments: 0, accountsReceivable: 0, inventory: 0, otherCurrentAssets: 0, total: 0 },
        nonCurrentAssets: { longTermReceivables: 0, fixedAssets: 0, investmentProperty: 0, longTermInvestments: 0, goodwill: 0, otherLongTermAssets: 0, total: 0 },
        totalAssets: 0,
        currentLiabilities: { shortTermDebt: 0, accountsPayable: 0, advancesFromCustomers: 0, taxPayable: 0, payablesToEmployees: 0, otherCurrentLiabilities: 0, total: 0 },
        longTermLiabilities: { longTermDebt: 0, deferredTaxLiabilities: 0, otherLongTermLiabilities: 0, total: 0 },
        totalLiabilities: 0,
        equity: { shareCapital: 0, sharePremium: 0, treasuryShares: 0, retainedEarnings: 0, otherEquityFunds: 0, minorityInterest: 0, total: 0 },
        totalLiabilitiesAndEquity: 0,
      },
      incomeStatement: {
        netRevenue: 0,
        cogs: 0,
        grossProfit: 0,
        operatingExpenses: 0,
        operatingProfit: 0,
        otherIncome: 0,
        financingCosts: 0,
        ebit: 0,
        interestExpenses: 0,
        profitBeforeTax: 0,
        incomeTax: 0,
        netProfit: 0,
        minorityInterest: 0,
        parentNetProfit: 0,
        eps: 0,
        dilutedEps: 0,
        ebitda: 0,
        ebitdaMargin: 0,
      },
      cashFlow: {
        operatingCashFlow: 0,
        capitalExpenditures: 0,
        freeCashFlow: 0,
        investingCashFlow: 0,
        financingCashFlow: 0,
        netChangeInCash: 0,
      },
      ratios: {
        grossMarginPct: null,
        operatingMarginPct: null,
        netMarginPct: null,
        ebitdaMarginPct: null,
        roe: null,
        roa: null,
        roic: null,
        currentRatio: null,
        quickRatio: null,
        cashRatio: null,
        debtToEquity: null,
        debtToAssets: null,
        netDebt: null,
        netDebtToEbitda: null,
        interestCoverageRatio: null,
        assetTurnover: null,
        inventoryTurnover: null,
        inventoryDays: null,
        receivablesTurnover: null,
        receivablesDays: null,
        payablesTurnover: null,
        payablesDays: null,
        cashConversionCycle: null,
        eps: 0,
        bvps: null,
        revenuePerShare: null,
        fcfPerShare: null,
        pe: null,
        pb: null,
        ps: null,
        evToEbitda: null,
        dividendYieldPct: null,
      },
      yoyDelta: null,
      qoqDelta: null,
      marketData: null,
      aiAnalysis: null,
      embedding: null,
      embeddingText: `Fallback report from ${hints.length} chain signals. Revenue trend: ${avgRevenue > 0 ? 'positive' : avgRevenue < 0 ? 'negative' : 'neutral'}. Margin trend: ${avgMargin > 0 ? 'expanding' : avgMargin < 0 ? 'compressing' : 'stable'}.`,
      notesRawText: null,
      fallback: true,
      extraction_method: 'news_inference',
      confidence: finalConfidence,
    } as any;

    // Insert into database with fallback metadata
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO financial_reports (
        id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        ssc_url, pdf_path, published_at, parsed_at, audit_status, auditor,
        extraction_confidence,
        net_revenue, gross_profit, operating_profit, ebitda,
        profit_before_tax, net_profit, eps, diluted_eps,
        total_assets, current_assets, cash, inventory,
        total_liabilities, short_term_debt, long_term_debt, equity_total,
        operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
        gross_margin_pct, operating_margin_pct, net_margin_pct,
        roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda, pe, pb,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
        yoy_delta_json, qoq_delta_json,
        market_data_json, embedding_text, notes_raw_text,
        validation_status, validation_notes, extraction_method, extraction_source_note,
        revenue_growth_qoq, margin_trend, debt_ratio_hint
      ) VALUES (
        $id, $actionCode, $companyName, $exchange, $domain,
        $periodYear, $periodQuarter, $periodType, $periodStart, $periodEnd, $sortKey,
        $sscUrl, $pdfPath, $publishedAt, $parsedAt, $auditStatus, $auditor,
        $extractionConfidence,
        $netRevenue, $grossProfit, $operatingProfit, $ebitda,
        $profitBeforeTax, $netProfit, $eps, $dilutedEps,
        $totalAssets, $currentAssets, $cash, $inventory,
        $totalLiabilities, $shortTermDebt, $longTermDebt, $equityTotal,
        $operatingCf, $investingCf, $financingCf, $capex, $freeCashFlow,
        $grossMarginPct, $operatingMarginPct, $netMarginPct,
        $roe, $roa, $currentRatio, $debtToEquity, $netDebtToEbitda, $pe, $pb,
        $balanceSheetJson, $incomeStmtJson, $cashFlowJson, $ratiosJson,
        $yoyDeltaJson, $qoqDeltaJson,
        $marketDataJson, $embeddingText, $notesRawText,
        $validationStatus, $validationNotes, $extractionMethod, $extractionSourceNote,
        $revenueGrowthQoq, $marginTrend, $debtRatioHint
      )
    `);

    stmt.run({
      $id: fallbackReport.id,
      $actionCode: fallbackReport.actionCode,
      $companyName: fallbackReport.companyName,
      $exchange: fallbackReport.exchange,
      $domain: fallbackReport.domain,
      $periodYear: fallbackReport.period.year,
      $periodQuarter: fallbackReport.period.quarter,
      $periodType: fallbackReport.period.periodType,
      $periodStart: fallbackReport.period.startDate,
      $periodEnd: fallbackReport.period.endDate,
      $sortKey: fallbackReport.period.sortKey,
      $sscUrl: fallbackReport.source.sscUrl,
      $pdfPath: fallbackReport.source.pdfPath,
      $publishedAt: fallbackReport.source.publishedAt,
      $parsedAt: fallbackReport.source.parsedAt,
      $auditStatus: fallbackReport.source.auditStatus,
      $auditor: fallbackReport.source.auditor,
      $extractionConfidence: fallbackReport.source.extractionConfidence,
      $netRevenue: fallbackReport.incomeStatement.netRevenue,
      $grossProfit: fallbackReport.incomeStatement.grossProfit,
      $operatingProfit: fallbackReport.incomeStatement.operatingProfit,
      $ebitda: fallbackReport.incomeStatement.ebitda,
      $profitBeforeTax: fallbackReport.incomeStatement.profitBeforeTax,
      $netProfit: fallbackReport.incomeStatement.netProfit,
      $eps: fallbackReport.incomeStatement.eps,
      $dilutedEps: fallbackReport.incomeStatement.dilutedEps,
      $totalAssets: fallbackReport.balanceSheet.totalAssets,
      $currentAssets: fallbackReport.balanceSheet.currentAssets.total,
      $cash: fallbackReport.balanceSheet.currentAssets.cash,
      $inventory: fallbackReport.balanceSheet.currentAssets.inventory,
      $totalLiabilities: fallbackReport.balanceSheet.totalLiabilities,
      $shortTermDebt: fallbackReport.balanceSheet.currentLiabilities.shortTermDebt,
      $longTermDebt: fallbackReport.balanceSheet.longTermLiabilities.longTermDebt,
      $equityTotal: fallbackReport.balanceSheet.equity.total,
      $operatingCf: fallbackReport.cashFlow.operatingCF,
      $investingCf: fallbackReport.cashFlow.investingCF,
      $financingCf: fallbackReport.cashFlow.financingCF,
      $capex: fallbackReport.cashFlow.capex,
      $freeCashFlow: fallbackReport.cashFlow.freeCashFlow,
      $grossMarginPct: fallbackReport.ratios.grossMarginPct ?? null,
      $operatingMarginPct: fallbackReport.ratios.operatingMarginPct ?? null,
      $netMarginPct: fallbackReport.ratios.netMarginPct ?? null,
      $roe: fallbackReport.ratios.roe ?? null,
      $roa: fallbackReport.ratios.roa ?? null,
      $currentRatio: fallbackReport.ratios.currentRatio ?? null,
      $debtToEquity: fallbackReport.ratios.debtToEquity ?? null,
      $netDebtToEbitda: fallbackReport.ratios.netDebtToEbitda ?? null,
      $pe: fallbackReport.ratios.pe ?? null,
      $pb: fallbackReport.ratios.pb ?? null,
      $balanceSheetJson: JSON.stringify(fallbackReport.balanceSheet),
      $incomeStmtJson: JSON.stringify(fallbackReport.incomeStatement),
      $cashFlowJson: JSON.stringify(fallbackReport.cashFlow),
      $ratiosJson: JSON.stringify(fallbackReport.ratios),
      $yoyDeltaJson: null,
      $qoqDeltaJson: null,
      $marketDataJson: null,
      $embeddingText: fallbackReport.embeddingText,
      $notesRawText: fallbackReport.notesRawText,
      $validationStatus: 'pending',
      $validationNotes: `Fallback from news chain: ${hints.length} signals (age <${maxAgeDays}d)`,
      $extractionMethod: 'news_inference',
      $extractionSourceNote: `Fallback: PDF extraction timeout. Populated from ${hints.length} chain signals (signal age: <${maxAgeDays}d). Confidence: ${finalConfidence.toFixed(2)}`,
      $revenueGrowthQoq: avgRevenue,
      $marginTrend: avgMargin,
      $debtRatioHint: hints.length > 0 && hints[0] && hints[0].debt_ratio_pct !== null ? hints[0].debt_ratio_pct : 0.0,
    });

    logger.info(`${tag} fallback report inserted`);
    return {
      fallback: true,
      report: fallbackReport,
    };
  } catch (err) {
    logger.warn(`${tag} fallback process failed`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      fallback: false,
      reason: `fallback process failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
