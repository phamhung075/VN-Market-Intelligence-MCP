/**
 * Task 048 — SSC Fetch → Parse → Store Pipeline
 *
 * Application use case: orchestrates the full BCTC fetch-parse-store pipeline.
 *
 * Pipeline:
 *   1. listSscDocuments  — scrape SSC portal to find PDF URL for the given stock/period
 *   2. downloadAndExtractPdf — download PDF and extract raw text
 *   3. parseBctcReport  — parse text into FinancialReport (balance sheet, income, cash flow, ratios)
 *   4. insertAnalysis   — embed summary into LanceDB for RAG retrieval
 *   5. Return the FinancialReport
 *
 * All external I/O dependencies are injectable so they can be mocked in tests.
 *
 * Layering: this file (application) may import from both domain/ and infrastructure/.
 */

import { randomUUID } from "node:crypto";

import { listSscDocuments } from "../../infrastructure/fetchers/ssc.js";
import { downloadAndExtractPdf } from "../../infrastructure/fetchers/pdf.js";
import { parseBctcReport } from "./parseBctcReport.js";
import { logger } from "../../infrastructure/logger.js";

import type { HttpClient, BrowserFactory } from "../../infrastructure/fetchers/ssc.js";
import type { AnalysisInput } from "../../infrastructure/rag/retriever.js";
import type { FinancialReport, FiscalPeriod } from "../../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Quarter string accepted by the use case params (human-friendly). */
export type QuarterString = "Q1" | "Q2" | "Q3" | "Q4";

/**
 * Injectable function signature for inserting an analysis entry into LanceDB.
 * Defaults to the real `insertAnalysis` from the retriever when not provided.
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
   * Optional browser factory used by listSscDocuments when fetching the SSC portal.
   * Inject a mock in tests to avoid launching a real browser.
   */
  sscHttpClient?: BrowserFactory;
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
   * Defaults to the real LanceDB-backed implementation from retriever.ts.
   */
  insertAnalysisFn?: InsertAnalysisFn;
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
 *
 * @param params - Pipeline parameters with all injectable dependencies.
 * @returns The stored FinancialReport, or null on any terminal failure.
 */
export async function fetchParseAndStoreBctc(
  params: FetchParseAndStoreBctcParams,
): Promise<FinancialReport | null> {
  const {
    actionCode,
    year,
    quarter,
    sscHttpClient,
    pdfHttpClient,
    pdfTextOverride,
    insertAnalysisFn,
  } = params;

  const tag = `[fetchParseAndStoreBctc] ${actionCode} ${year}-${quarter}`;

  // ── Step 1: List SSC documents ─────────────────────────────────────────────
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

  // Use the first (most recent) matching document
  const doc = docs[0]!;
  logger.info(`${tag} using document`, { url: doc.url, publishedAt: doc.publishedAt });

  // ── Step 2: Download & extract PDF text ────────────────────────────────────
  logger.info(`${tag} step 2: extracting PDF text`);

  let rawText: string;

  if (pdfTextOverride !== undefined) {
    // Test shortcut — bypass real PDF extraction
    rawText = pdfTextOverride;
  } else {
    const extraction = await downloadAndExtractPdf(doc.url, pdfHttpClient);
    rawText = extraction.text;
  }

  if (!rawText || rawText.trim().length === 0) {
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

  // Patch source URL from SSC portal
  report.source.sscUrl = doc.url;
  report.source.publishedAt = doc.publishedAt || report.source.parsedAt;

  // ── Step 4: Embed into LanceDB ────────────────────────────────────────────
  logger.info(`${tag} step 4: inserting analysis into LanceDB`);

  const inserter = insertAnalysisFn ?? (await getDefaultInsertAnalysis());

  try {
    const analysisEntry: AnalysisInput = {
      id: randomUUID(),
      level: "action",
      title: `BCTC ${actionCode} ${quarter}/${year}`,
      summary: buildAnalysisSummary(report),
      tags: ["bctc", "financial_report", actionCode.toLowerCase(), quarter.toLowerCase()],
      actionCode,
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
 * Lazily import the real insertAnalysis function.
 * Deferred to avoid loading LanceDB + embeddings when the caller provides a mock.
 */
async function getDefaultInsertAnalysis(): Promise<InsertAnalysisFn> {
  const { insertAnalysis } = await import("../../infrastructure/rag/retriever.js");
  return insertAnalysis;
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
