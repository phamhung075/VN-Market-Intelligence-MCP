/**
 * BCTC PDF Pull Job — feat/bctc-pull-pdf
 *
 * Pull-based PDF download: MCP server downloads PDFs from VPS instead of VPS
 * pushing to MCP. VPS already caches PDFs at /root/bctc-cache/<TICKER>/filename.pdf
 * and exposes them via an authenticated HTTP endpoint.
 *
 * Flow:
 *   1. Query bctc_vps_queue for pending rows where source_url starts with the
 *      VPS bctc-files base URL (http://125.212.251.27:8765/bctc-files/).
 *   2. For each row: fetch PDF with X-API-Key header (VPS_PUSH_API_KEY).
 *   3. Validate response size >= MIN_PDF_BYTES (10 240) — existing guard.
 *   4. Save to data/pdfs/<TICKER>_<YEAR>_Q<QUARTER>.pdf.
 *   5. Update bctc_vps_queue status to 'done'.
 *   6. Await PDF text extraction pipeline (Bug 1352a fix; errors logged, non-fatal).
 *
 * All I/O (fetch, save, extraction trigger) is injectable so tests run without
 * real network, real file system, or real DB writes.
 *
 * Runs every 30 min (CRON_BCTC_PDF_PULL env var) or right after bctcQueueEnricher.
 *
 * Layer: interface/scheduler — imports from infrastructure (DB, logger) only.
 *
 * @module scheduler/financial-reports/bctcPdfPullJob
 */

import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** VPS bctc-files endpoint base URL — all pull-eligible source_urls start here. */
export const VPS_BCTC_BASE_URL = "http://125.212.251.27:8765/bctc-files/";

/** Minimum valid PDF size in bytes (existing guard shared with bctcValidator). */
export const MIN_PDF_BYTES = 10_240;

/** Default max items per run. */
const DEFAULT_BATCH_SIZE = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BctcPdfPullDeps {
  /**
   * Fetch a PDF from the VPS.
   * @param url    - Full VPS bctc-files URL
   * @param apiKey - Value for X-API-Key header
   */
  fetchPdf: (url: string, apiKey: string) => Promise<Response>;

  /**
   * Persist the downloaded PDF buffer to disk.
   * @param path - Absolute or relative file path
   * @param buf  - Raw PDF bytes
   */
  savePdf: (path: string, buf: Uint8Array) => Promise<void>;

  /**
   * Trigger the PDF text extraction pipeline for a successfully saved PDF.
   * Bug 1352a: now awaited before the queue row is marked done.
   * 1954c: delegates extraction to pdf-extractor service via pdfUrl.
   * Errors are caught by the caller and logged; they are never re-thrown.
   */
  triggerExtraction: (params: {
    actionCode: string;
    year: number;
    quarter: string;
    filePath: string;
    /** VPS source URL — passed to pdfExtractorClient.extractViaMicroservice (1954c). */
    pdfUrl: string;
  }) => Promise<void>;
}

export interface BctcPdfPullResult {
  /** Total queue rows examined (matched VPS prefix and were pending). */
  itemsProcessed: number;
  /** PDFs successfully downloaded and saved. */
  downloaded: number;
  /** Items that failed (HTTP error, size guard, fetch throw). */
  failed: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue row type (internal)
// ─────────────────────────────────────────────────────────────────────────────

interface QueueRow {
  id: number;
  action_code: string;
  period_year: number;
  period_quarter: string;
  source_url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Production deps factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build production deps wired to real infrastructure.
 * Lazy-imported inside runBctcPdfPullJob so tests never touch real I/O.
 */
async function makeProductionDeps(): Promise<BctcPdfPullDeps> {
  const { writeFile, mkdir } = await import("node:fs/promises");

  return {
    fetchPdf: async (url: string, apiKey: string): Promise<Response> => {
      return fetch(url, {
        headers: { "X-API-Key": apiKey },
      });
    },

    savePdf: async (filePath: string, buf: Uint8Array): Promise<void> => {
      // Ensure data/pdfs/ directory exists
      const dir = filePath.substring(0, filePath.lastIndexOf("/"));
      await mkdir(dir, { recursive: true });
      await writeFile(filePath, buf);
    },

    triggerExtraction: async (params): Promise<void> => {
      // 1954c (G5b): delegate extraction to pdf-extractor service (port 5001).
      // Replaces the previous extractAndStorePdfPagesWithRetry + getCachedPdfText
      // pattern with a single HTTP call to pdfExtractorClient.extractViaMicroservice.
      const { extractViaMicroservice } = await import(
        "../../infrastructure/fetchers/pdfExtractorClient.js"
      );
      const { fetchParseAndStoreBctc } = await import(
        "../../application/usecases/fetchParseAndStoreBctc.js"
      );
      const { logger } = await import("../../infrastructure/logger.js");

      const quarter = params.quarter.startsWith("Q")
        ? (params.quarter as "Q1" | "Q2" | "Q3" | "Q4")
        : (`Q${params.quarter}` as "Q1" | "Q2" | "Q3" | "Q4");

      // Step 1: call pdf-extractor service (primary extraction path)
      const serviceResult = await extractViaMicroservice(params.pdfUrl, "bctc");
      if (!serviceResult || serviceResult.textContent.trim().length < 100) {
        logger.warn("[bctcPdfPull] service returned null or too-short text — pipeline skipped", {
          ticker: params.actionCode,
          pdfUrl: params.pdfUrl,
          textLength: serviceResult?.textContent.trim().length ?? 0,
        });
        return;
      }

      // Step 2: call pipeline with pdfTextOverride from service result
      await fetchParseAndStoreBctc({
        actionCode: params.actionCode,
        year: params.year,
        quarter,
        pdfTextOverride: serviceResult.textContent,
        pdfUrl: params.pdfUrl,
      });
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive the canonical save path for a downloaded PDF.
 *
 * Convention: data/pdfs/<TICKER>_<YEAR>_Q<QUARTER>.pdf
 * Example: data/pdfs/VCB_2025_Q4.pdf
 */
export function buildPdfSavePath(
  actionCode: string,
  year: number,
  quarter: string,
  pdfDir = join(process.cwd(), "data", "pdfs"),
): string {
  // Normalise quarter — strip leading 'Q' if already present
  const q = quarter.startsWith("Q") ? quarter : `Q${quarter}`;
  const filename = `${actionCode}_${year}_${q}.pdf`;
  return join(pdfDir, filename);
}

/**
 * Run one pass of the BCTC PDF pull job.
 *
 * @param opts.db        - SQLite database (defaults to singleton)
 * @param opts.batchSize - Max items per run (default 10)
 * @param opts.deps      - Injectable I/O deps (defaults to production)
 * @param opts.pdfDir    - Override pdf save directory (for tests)
 */
export async function runBctcPdfPullJob(opts: {
  db?: Database;
  batchSize?: number;
  deps?: BctcPdfPullDeps;
  pdfDir?: string;
} = {}): Promise<BctcPdfPullResult> {
  const db = opts.db ?? getDb();
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const deps = opts.deps ?? (await makeProductionDeps());
  const apiKey = Bun.env.VPS_PUSH_API_KEY ?? "";

  const result: BctcPdfPullResult = {
    itemsProcessed: 0,
    downloaded: 0,
    failed: 0,
  };

  // ── 1. Query pending VPS-URL rows ─────────────────────────────────────────
  let rows: QueueRow[];
  try {
    rows = db
      .query<QueueRow, [string, number]>(
        `SELECT id, action_code, period_year, period_quarter, source_url
         FROM bctc_vps_queue
         WHERE status = 'pending'
           AND source_url LIKE ?
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(`${VPS_BCTC_BASE_URL}%`, batchSize);
  } catch (err) {
    logger.warn("[bctcPdfPull] DB query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return result;
  }

  if (rows.length === 0) {
    return result;
  }

  // ── Prepare update statement ──────────────────────────────────────────────
  const updateDone = db.prepare<void, [number]>(
    `UPDATE bctc_vps_queue SET status = 'done', last_attempt = datetime('now') WHERE id = ?`,
  );
  const updateAttempt = db.prepare<void, [number]>(
    `UPDATE bctc_vps_queue SET attempts = attempts + 1, last_attempt = datetime('now') WHERE id = ?`,
  );

  // ── 2. Download each PDF ──────────────────────────────────────────────────
  for (const row of rows) {
    result.itemsProcessed++;

    let response: Response;

    // Fetch
    try {
      response = await deps.fetchPdf(row.source_url, apiKey);
    } catch (err) {
      logger.warn("[bctcPdfPull] fetch failed", {
        ticker: row.action_code,
        url: row.source_url,
        error: err instanceof Error ? err.message : String(err),
      });
      result.failed++;
      updateAttempt.run(row.id);
      continue;
    }

    // HTTP error
    if (!response.ok) {
      logger.warn("[bctcPdfPull] HTTP error", {
        ticker: row.action_code,
        url: row.source_url,
        status: response.status,
      });
      result.failed++;
      updateAttempt.run(row.id);
      continue;
    }

    // Read bytes
    let buf: Uint8Array;
    try {
      buf = new Uint8Array(await response.arrayBuffer());
    } catch (err) {
      logger.warn("[bctcPdfPull] failed to read response body", {
        ticker: row.action_code,
        error: err instanceof Error ? err.message : String(err),
      });
      result.failed++;
      updateAttempt.run(row.id);
      continue;
    }

    // ── 3. Size guard ──────────────────────────────────────────────────────
    if (buf.length < MIN_PDF_BYTES) {
      logger.warn("[bctcPdfPull] PDF too small — skipping", {
        ticker: row.action_code,
        bytes: buf.length,
        minBytes: MIN_PDF_BYTES,
      });
      result.failed++;
      updateAttempt.run(row.id);
      continue;
    }

    // ── 4. Save ────────────────────────────────────────────────────────────
    const filePath = buildPdfSavePath(
      row.action_code,
      row.period_year,
      row.period_quarter,
      opts.pdfDir,
    );

    try {
      await deps.savePdf(filePath, buf);
    } catch (err) {
      logger.warn("[bctcPdfPull] save failed", {
        ticker: row.action_code,
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
      result.failed++;
      updateAttempt.run(row.id);
      continue;
    }

    logger.info("[bctcPdfPull] PDF saved", {
      ticker: row.action_code,
      year: row.period_year,
      quarter: row.period_quarter,
      bytes: buf.length,
      filePath,
    });

    // ── 5. Trigger extraction (await — ensures text is stored before done) ────
    // Bug 1352a: was fire-and-forget; MCP tools called immediately after
    // runBctcPdfPullJob saw empty text because OCR had not completed yet.
    try {
      await deps.triggerExtraction({
        actionCode: row.action_code,
        year: row.period_year,
        quarter: row.period_quarter,
        filePath,
        pdfUrl: row.source_url, // 1954c: pass VPS URL to service call
      });
    } catch (err) {
      // Extraction failure is non-fatal — PDF is saved, mark done regardless.
      // The bctcReparseJob will re-attempt extraction on the next daily cycle.
      logger.warn("[bctcPdfPull] extraction trigger failed (non-fatal)", {
        ticker: row.action_code,
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── 6. Mark done — extraction has completed (or failed non-fatally) ───
    updateDone.run(row.id);
    result.downloaded++;
  }

  logger.info("[bctcPdfPull] cycle complete", {
    itemsProcessed: result.itemsProcessed,
    downloaded: result.downloaded,
    failed: result.failed,
  });

  return result;
}
