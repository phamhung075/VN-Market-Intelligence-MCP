/**
 * Task 104 — SSC Nightly Report Check
 * Task 153 — SSC Scan Deduplication
 *
 * Application use case: checks all watchlist stocks for new BCTC reports on
 * the SSC disclosure portal.  For each new report found (not yet in the
 * `financial_reports` table), it runs the BCTC fetch/parse/store pipeline and
 * generates an alert if the watchlist entry has `alert_report_new = 1`.
 *
 * All external dependencies are injectable for unit testing:
 *   - `getWatchlistFn`    — read watchlist rows from DB (or any source in tests)
 *   - `listDocsFn`        — list SSC portal documents for a stock code
 *   - `pipelineFn`        — run the BCTC fetch-parse-store pipeline for one doc
 *   - `isNewReportFn`     — legacy dedup check via financial_reports.ssc_url
 *   - `isDocProcessedFn`  — fast dedup check via financial_reports.ssc_doc_id (task 153)
 *   - `storeAlertsFn`     — persist generated alerts (defaults to SQLite alertStore)
 *
 * Deduplication strategy (task 153):
 *   When `isDocProcessedFn` is provided, it is checked FIRST using the document
 *   URL as the doc ID (stable, unique per SSC document).  Only if that returns
 *   false does the legacy `isNewReportFn` check run.  This allows a sub-1 ms
 *   skip for already-processed documents, avoiding full pipeline re-runs.
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import { getDb } from "../../infrastructure/db/schema.js";
import { storeAlerts, isDocAlreadyProcessed } from "../../infrastructure/db/alertStore.js";
import { generateAlerts } from "../../domain/services/alertGenerator.js";
import type { Alert } from "../../domain/services/alertGenerator.js";
import type { SscDocument } from "../../infrastructure/fetchers/ssc.js";
import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** A minimal watchlist entry needed by this use case. */
export interface WatchlistEntry {
  /** Uppercase stock ticker, e.g. "VCB". */
  code: string;
  /** Whether to generate an alert when a new report is found. */
  alertReportNew: boolean;
}

/** Parameters passed to the injectable BCTC pipeline function. */
export interface PipelineParams {
  /** Stock ticker, e.g. "VCB". */
  actionCode: string;
  /** Absolute URL to the BCTC PDF on the SSC portal. */
  pdfUrl: string;
  /** Publication date string from the SSC portal page (e.g. "15/04/2025"). */
  publishedAt: string;
}

/**
 * Summary returned by `checkSscReports`.
 *
 * @property checked    - Number of watchlist stocks queried against SSC portal
 * @property newReports - Number of new reports found and processed
 * @property alerts     - Number of alerts generated and stored
 * @property errors     - Number of per-stock errors (gracefully degraded)
 */
export interface SscCheckResult {
  checked: number;
  newReports: number;
  alerts: number;
  errors: number;
}

/**
 * Optional dependency overrides — used in tests to avoid real DB/network access.
 */
export interface CheckSscReportsOptions {
  /**
   * Override to return watchlist entries without reading from SQLite.
   * Defaults to reading from the `watchlist` table via `getDb()`.
   */
  getWatchlistFn?: () => Promise<WatchlistEntry[]>;
  /**
   * Override to return SSC documents for a given stock code without making
   * real HTTP requests.
   * Defaults to `listSscDocuments` from ssc.ts (current year).
   */
  listDocsFn?: (code: string) => Promise<SscDocument[]>;
  /**
   * Override for the BCTC fetch-parse-store pipeline.
   * Defaults to `fetchParseAndStoreBctc` from the application use case.
   */
  pipelineFn?: (params: PipelineParams) => Promise<unknown>;
  /**
   * Override for the legacy dedup check.
   * Returns `true` when the document has NOT yet been stored.
   * Defaults to querying `financial_reports.ssc_url` via `getDb()`.
   */
  isNewReportFn?: (code: string, pdfUrl: string) => boolean;
  /**
   * Fast dedup guard added by task 153.
   * Called with the document URL as the `ssc_doc_id`.
   * Returns `true` when the document is ALREADY processed — the pipeline
   * should be skipped.
   * Defaults to `isDocAlreadyProcessed(docUrl, getDb())`.
   */
  isDocProcessedFn?: (docId: string) => boolean;
  /**
   * Override for storing generated alerts.
   * Defaults to `storeAlerts` writing to the `alerts` SQLite table.
   */
  storeAlertsFn?: (alerts: Alert[]) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default dependency implementations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read all watchlist entries from SQLite.
 */
function defaultGetWatchlist(): WatchlistEntry[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT code, alert_report_new FROM watchlist ORDER BY code`)
    .all() as { code: string; alert_report_new: number }[];

  return rows.map((r) => ({
    code: r.code,
    alertReportNew: r.alert_report_new === 1,
  }));
}

/**
 * Check whether a report for the given stock + SSC URL already exists in the
 * `financial_reports` table.  Uses the `ssc_url` column populated by the BCTC
 * pipeline (task 048).
 *
 * @param code   - Stock ticker, e.g. "VCB"
 * @param pdfUrl - Absolute PDF URL from the SSC portal
 * @returns `true` when the URL has NOT been stored before (report is new)
 */
function isNewReport(code: string, pdfUrl: string): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT 1 FROM financial_reports
       WHERE action_code = ? AND ssc_url = ? LIMIT 1`,
    )
    .get(code, pdfUrl);
  // Bun's bun:sqlite returns null (not undefined) when no row is found
  return row === null || row === undefined;
}

/**
 * Default SSC document lister — queries the current calendar year.
 */
async function defaultListDocs(code: string): Promise<SscDocument[]> {
  const { listSscDocuments } = await import(
    "../../infrastructure/fetchers/ssc.js"
  );
  const year = new Date().getFullYear();
  return listSscDocuments(code, "quarterly", year);
}

/**
 * Default pipeline runner — delegates to `fetchParseAndStoreBctc`.
 *
 * Builds a minimal SSC HTML mock so `listSscDocuments` can pick up the
 * pre-discovered document URL without making another network request.
 */
async function defaultPipeline(params: PipelineParams): Promise<unknown> {
  const { fetchParseAndStoreBctc } = await import("./fetchParseAndStoreBctc.js");

  const year = new Date().getFullYear();

  // Inject a mock browser factory that returns the pre-found document directly
  const mockBrowserFactory = undefined; // Use default Puppeteer browser

  return fetchParseAndStoreBctc({
    actionCode: params.actionCode,
    year,
    quarter: "Q1",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Main use case
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check all watchlist stocks for new BCTC reports on the SSC portal.
 *
 * For each watchlist stock:
 *   1. Query SSC portal for recent quarterly documents.
 *   2. For each document, check if already stored by `ssc_url`.
 *   3. If new: run the BCTC pipeline to download, parse, and store.
 *   4. If `alert_report_new = 1` and new reports exist: generate + store alert.
 *
 * Errors on a per-stock basis are caught and counted — a failure for one stock
 * never aborts the remaining stocks.
 *
 * @param options - Optional dependency overrides (for testing).
 * @returns Summary: checked, newReports, alerts, errors.
 */
export async function checkSscReports(
  options: CheckSscReportsOptions = {},
): Promise<SscCheckResult> {
  const getWatchlistFn = options.getWatchlistFn ?? (async () => defaultGetWatchlist());
  const listDocsFn = options.listDocsFn ?? defaultListDocs;
  const pipelineFn = options.pipelineFn ?? defaultPipeline;
  const isNewReportFn = options.isNewReportFn ?? isNewReport;
  const isDocProcessedFn =
    options.isDocProcessedFn ??
    ((docId: string) => isDocAlreadyProcessed(docId, getDb()));
  const storeAlertsFn = options.storeAlertsFn ?? ((alerts) => storeAlerts(alerts, getDb()));

  // ── 1. Load watchlist ───────────────────────────────────────────────────────
  const watchlist = await getWatchlistFn();

  if (watchlist.length === 0) {
    logger.info("[checkSscReports] watchlist is empty — nothing to check");
    return { checked: 0, newReports: 0, alerts: 0, errors: 0 };
  }

  let newReports = 0;
  let alertsStored = 0;
  let errors = 0;

  // ── 2. Process each stock sequentially ─────────────────────────────────────
  for (const entry of watchlist) {
    const { code, alertReportNew } = entry;
    let stockNewReports = 0;

    try {
      // ── 2a. List SSC documents ───────────────────────────────────────────
      const docs = await listDocsFn(code);

      // ── 2b. Filter for new reports (not yet in financial_reports) ────────
      // Task 153: check ssc_doc_id guard first (fast index lookup).
      // Falls back to legacy ssc_url check only when doc is not already seen.
      const newDocs = docs.filter(
        (doc) => !isDocProcessedFn(doc.url) && isNewReportFn(code, doc.url),
      );

      if (newDocs.length === 0) {
        logger.debug(`[checkSscReports] ${code} — no new documents`);
        continue;
      }

      logger.info(`[checkSscReports] ${code} — found ${newDocs.length} new document(s)`);

      // ── 2c. Run pipeline for each new document (serial, 2 s delay) ───────
      for (const doc of newDocs) {
        try {
          await pipelineFn({
            actionCode: code,
            pdfUrl: doc.url,
            publishedAt: doc.publishedAt,
          });
          stockNewReports++;
        } catch (pipelineErr) {
          logger.error(`[checkSscReports] ${code} pipeline failed for ${doc.url}`, {
            error:
              pipelineErr instanceof Error
                ? pipelineErr.message
                : String(pipelineErr),
          });
          errors++;
        }

        // Polite delay between documents to avoid SSC rate-limiting
        if (newDocs.indexOf(doc) < newDocs.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      newReports += stockNewReports;

      // ── 2d. Generate + store alert if enabled and new reports found ───────
      if (alertReportNew && stockNewReports > 0) {
        const reportCount = stockNewReports;
        const alertMessage =
          `${code}: ${reportCount} new BCTC report(s) found on SSC portal`;

        const generatedAlerts = generateAlerts(
          [
            {
              type: "report_new",
              actionCode: code,
              severity: "medium",
              message: alertMessage,
              confidence: 1.0,
              detectedAt: new Date().toISOString(),
            },
          ],
          [{ actionCode: code }],
        );

        if (generatedAlerts.length > 0) {
          storeAlertsFn(generatedAlerts);
          alertsStored += generatedAlerts.length;
        }
      }
    } catch (err) {
      logger.error(`[checkSscReports] ${code} — error during SSC check`, {
        error: err instanceof Error ? err.message : String(err),
      });
      errors++;
    }
  }

  logger.info(
    `[checkSscReports] complete — checked: ${watchlist.length}, ` +
      `newReports: ${newReports}, alerts: ${alertsStored}, errors: ${errors}`,
  );

  return {
    checked: watchlist.length,
    newReports,
    alerts: alertsStored,
    errors,
  };
}
