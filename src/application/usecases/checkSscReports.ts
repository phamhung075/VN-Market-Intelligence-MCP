/**
 * Task 104 — SSC Nightly Report Check
 *
 * Application use case: checks all watchlist stocks for new BCTC reports on
 * the SSC disclosure portal.  For each new report found (not yet in the
 * `financial_reports` table), it runs the BCTC fetch/parse/store pipeline and
 * generates an alert if the watchlist entry has `alert_report_new = 1`.
 *
 * All external dependencies are injectable for unit testing:
 *   - `getWatchlistFn`  — read watchlist rows from DB (or any source in tests)
 *   - `listDocsFn`      — list SSC portal documents for a stock code
 *   - `pipelineFn`      — run the BCTC fetch-parse-store pipeline for one doc
 *   - `isNewReportFn`   — dedup check (defaults to querying financial_reports.ssc_url)
 *   - `storeAlertsFn`   — persist generated alerts (defaults to SQLite alertStore)
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import { getDb } from "../../infrastructure/db/schema.js";
import { storeAlerts } from "../../infrastructure/db/alertStore.js";
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
   * Override for the dedup check.
   * Returns `true` when the document has NOT yet been stored.
   * Defaults to querying `financial_reports.ssc_url` via `getDb()`.
   */
  isNewReportFn?: (code: string, pdfUrl: string) => boolean;
  /**
   * Override for storing generated alerts.
   * Defaults to `storeAlerts` writing to the `alerts` SQLite table.
   */
  storeAlertsFn?: (alerts: Alert[]) => void;
  /**
   * Legacy alias for `isNewReportFn` (task 153 test harness).
   * Returns `true` when the document has already been processed.
   * Accepted for back-compat with older test fixtures.
   */
  isDocProcessedFn?: (code: string, pdfUrl: string) => boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Quarter derivation helper
// ─────────────────────────────────────────────────────────────────────────────

import type { QuarterString } from "./fetchParseAndStoreBctc.js";

/**
 * Derive the fiscal quarter and year from a publication date string using the
 * Vietnamese reporting calendar:
 *
 * | Publish month | Fiscal quarter | Year offset      |
 * |---------------|----------------|-----------------|
 * | Jan – Apr     | Q4             | prior year (−1)  |
 * | May – Jul     | Q1             | same year        |
 * | Aug – Oct     | Q2             | same year        |
 * | Nov – Dec     | Q3             | same year        |
 *
 * Accepts both "DD/MM/YYYY" (SSC portal format) and ISO 8601 strings.
 * Falls back to Q1 of the current year on any parse failure.
 *
 * @param publishedAt - Date string from the SSC portal or ISO 8601.
 * @returns `{ quarter, year }` derived from the reporting calendar.
 */
export function deriveQuarterFromPublishedAt(
  publishedAt: string,
): { quarter: QuarterString; year: number } {
  const fallback = { quarter: "Q1" as QuarterString, year: new Date().getFullYear() };

  if (!publishedAt || publishedAt.trim().length === 0) {
    return fallback;
  }

  let date: Date | null = null;

  // Try "DD/MM/YYYY" format first (SSC portal)
  const ddmmyyyy = publishedAt.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    date = new Date(`${yyyy}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`);
  } else {
    // Try ISO 8601 / any other parseable format
    date = new Date(publishedAt);
  }

  if (!date || isNaN(date.getTime())) {
    return fallback;
  }

  const month = date.getMonth() + 1; // 1-indexed
  const year = date.getFullYear();

  if (month >= 1 && month <= 4) {
    return { quarter: "Q4", year: year - 1 };
  } else if (month >= 5 && month <= 7) {
    return { quarter: "Q1", year };
  } else if (month >= 8 && month <= 10) {
    return { quarter: "Q2", year };
  } else {
    // Nov–Dec
    return { quarter: "Q3", year };
  }
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
 * Passes the pre-discovered `pdfUrl` directly (bypassing Step 1 SSC listing),
 * and derives the fiscal quarter + year from the document's `publishedAt` date
 * using the Vietnamese reporting calendar.
 */
async function defaultPipeline(params: PipelineParams): Promise<unknown> {
  const { fetchParseAndStoreBctc } = await import("./fetchParseAndStoreBctc.js");

  const { quarter, year } = deriveQuarterFromPublishedAt(params.publishedAt);

  return fetchParseAndStoreBctc({
    actionCode: params.actionCode,
    year,
    quarter,
    pdfUrl: params.pdfUrl,
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
  // Sprint 053 / 1021: wire the legacy isDocProcessedFn alias. Semantic
  // inversion: isDocProcessedFn returning `true` means "already processed"
  // (skip), while isNewReportFn returning `true` means "is new" (keep).
  // Test 153 calls isDocProcessedFn with the docId (pdfUrl) only — keep
  // that single-arg shape.
  const isNewReportFn =
    options.isNewReportFn ??
    (options.isDocProcessedFn
      ? (_code: string, pdfUrl: string) => !options.isDocProcessedFn!(pdfUrl, "")
      : isNewReport);
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
      const newDocs = docs.filter((doc) => isNewReportFn(code, doc.url));

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
          // Count any successful pipeline invocation as a new report — even
          // when the pipeline returned null (extraction failed) the scan
          // genuinely discovered a new doc that needs visibility.
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
