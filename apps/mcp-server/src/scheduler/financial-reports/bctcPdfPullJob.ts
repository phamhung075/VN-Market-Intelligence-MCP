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
 * FIX-BCTC-EXTRACT-LOCALPATH: makeProductionDeps().triggerExtraction now delegates
 * to triggerPushBctcExtraction (3-tier fallback) instead of calling
 * extractViaMicroservice(pdfUrl) directly. The raw VPS URL (http://125.212.251.27:8765/...)
 * cannot be fetched by the pdf-extractor microservice without X-API-Key — it would
 * receive HTTP 401 → serviceResult=null → pipeline skipped. The PDF is already saved
 * to a local path (filePath) accessible via the shared volume mount:
 *   mcp-server:  ./data/pdfs → /app/data/pdfs
 *   pdf-extractor: ./data/pdfs → /app/data/pdfs  (read-only)
 * triggerPushBctcExtraction handles the 3-tier fallback correctly:
 *   Tier 1: pdfUrl  — VPS URL → 401 → null (expected for VPS-sourced PDFs)
 *   Tier 2: file://${filePath} — local path via shared volume
 *   Tier 3: direct pdf-parse from local buffer (Bun process — segfault risk for
 *            large PDFs via pdf-parse; known separate bug exit 132 on PPC 74p/16.7MB)
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

/**
 * hsx.vn staticfile CDN base URL.
 *
 * B3-SPACE-URLS-FIX (2026-06-07): hsx.vn URLs with spaces (raw or
 * percent-encoded via encodeHsxUrl) were not matched by the VPS LIKE
 * filter, leaving rows pending forever. Confirmed NOT geo-blocked from
 * the mcp-server container (HTTP 200, checked 2026-06-07 10:08 UTC).
 * Pull job fetches hsx.vn URLs directly without X-API-Key (no auth required).
 */
export const HSX_STATICFILE_BASE_URL = "https://staticfile.hsx.vn/";

/** Minimum valid PDF size in bytes (existing guard shared with bctcValidator). */
export const MIN_PDF_BYTES = 10_240;

/** Default max items per run. */
const DEFAULT_BATCH_SIZE = 10;

/**
 * Maximum number of 404 / fetch-error attempts before a queue row is
 * transitioned to `deferred_infra` (stop hammering the VPS).
 *
 * FIX-BCTC-VPS-QUEUE-SYNC: rows that exceed this cap are parked at
 * `deferred_infra`; the bctcQueueEnricherJob orphan-re-sync arm will
 * clear the stale VPS placeholder URL and re-attempt discovery.
 * Named constant — change here to apply to ALL rows, no ticker list.
 */
export const MAX_404_ATTEMPTS = 10;

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
   * FIX-BCTC-EXTRACT-LOCALPATH: production dep now uses triggerPushBctcExtraction
   * (3-tier fallback) — filePath is the primary extraction source for VPS PDFs.
   * Errors are caught by the caller and logged; they are never re-thrown.
   */
  triggerExtraction: (params: {
    actionCode: string;
    year: number;
    quarter: string;
    /** Local path where the PDF was saved — primary extraction source (shared volume). */
    filePath: string;
    /** VPS source URL — Tier 1 attempt only; expected to fail (401) for VPS PDFs. */
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
  /**
   * FIX-BCTC-VPS-QUEUE-SYNC G1: rows transitioned to deferred_infra because
   * their attempt count reached MAX_404_ATTEMPTS. Subset of `failed`.
   */
  deferred: number;
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
  attempts: number;
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
      // FIX-BCTC-EXTRACT-LOCALPATH: delegate to triggerPushBctcExtraction which
      // implements 3-tier fallback. Previously this called extractViaMicroservice(pdfUrl)
      // directly — for VPS-sourced PDFs the pdf-extractor would attempt to GET that URL
      // without X-API-Key, receive HTTP 401, return null, and skip the pipeline entirely.
      //
      // triggerPushBctcExtraction handles:
      //   Tier 1: extractViaService(pdfUrl)  — VPS URL → 401 → null (expected)
      //   Tier 2: extractViaService(file://${filePath}) — local disk via shared volume
      //   Tier 3: extractText(readFile(filePath)) — direct pdf-parse fallback
      //
      // Both containers share the /app/data/pdfs volume mount:
      //   docker-compose.yml mcp-server:  ./data/pdfs:/app/data/pdfs
      //   docker-compose.yml pdf-extractor: ./data/pdfs:/app/data/pdfs:ro
      // The PDF saved to filePath is visible to the pdf-extractor at the same path.
      const { triggerPushBctcExtraction } = await import(
        "./pushBctcExtraction.js"
      );

      const quarter = params.quarter.startsWith("Q")
        ? (params.quarter as "Q1" | "Q2" | "Q3" | "Q4")
        : (`Q${params.quarter}` as "Q1" | "Q2" | "Q3" | "Q4");

      // Derive filename from filePath (basename only)
      const filename = params.filePath.split("/").pop() ?? "";

      await triggerPushBctcExtraction({
        actionCode: params.actionCode,
        year: params.year,
        quarter,
        filePath: params.filePath,
        filename,
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
    deferred: 0,
  };

  // ── 1. Query pending pull-eligible rows ──────────────────────────────────
  // B3-SPACE-URLS-FIX (2026-06-07): widened from VPS-only filter to include
  // staticfile.hsx.vn URLs. hsx.vn is NOT geo-blocked from the mcp-server
  // container (HTTP 200 confirmed). hsx.vn rows use percent-encoded URLs
  // (spaces → %20, parens → %28/%29) after the encodeHsxUrl fix in
  // hsxBctcFetcher.ts. No X-API-Key is sent for hsx.vn requests.
  let rows: QueueRow[];
  try {
    rows = db
      .query<QueueRow, [string, string, number]>(
        `SELECT id, action_code, period_year, period_quarter, source_url, attempts
         FROM bctc_vps_queue
         WHERE status = 'pending'
           AND (source_url LIKE ? OR source_url LIKE ?)
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(`${VPS_BCTC_BASE_URL}%`, `${HSX_STATICFILE_BASE_URL}%`, batchSize);
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
  /**
   * FIX-BCTC-VPS-QUEUE-SYNC G1: transition to deferred_infra when attempts
   * exceed MAX_404_ATTEMPTS. This stops the infinite-404 VPS hammer loop.
   * The bctcQueueEnricherJob orphan-re-sync arm will pick these up and either
   * push a fresh discovery or mark url_not_found when genuinely unavailable.
   */
  const updateDeferredInfra = db.prepare<void, [number]>(
    `UPDATE bctc_vps_queue SET status = 'deferred_infra', attempts = attempts + 1, last_attempt = datetime('now') WHERE id = ?`,
  );

  /**
   * FIX-BCTC-VPS-QUEUE-SYNC G1 helper: record a failed fetch attempt.
   *
   * When the row's current attempts (pre-increment) already equals or exceeds
   * MAX_404_ATTEMPTS - 1, the NEXT attempt pushes it over the cap → park at
   * `deferred_infra`. Otherwise increment attempts and leave `pending`.
   *
   * Applies to ALL rows by attempt count — never by ticker name.
   */
  function recordFailedAttempt(row: QueueRow): void {
    if (row.attempts + 1 >= MAX_404_ATTEMPTS) {
      updateDeferredInfra.run(row.id);
      result.deferred++;
      logger.warn("[bctcPdfPull] attempt cap reached — transitioning to deferred_infra", {
        ticker: row.action_code,
        year: row.period_year,
        quarter: row.period_quarter,
        attempts: row.attempts + 1,
        cap: MAX_404_ATTEMPTS,
      });
    } else {
      updateAttempt.run(row.id);
    }
  }

  // ── 2. Download each PDF ──────────────────────────────────────────────────
  for (const row of rows) {
    result.itemsProcessed++;

    let response: Response;

    // hsx.vn URLs do not require authentication; VPS URLs require X-API-Key.
    const isHsxUrl = row.source_url.startsWith(HSX_STATICFILE_BASE_URL);
    const effectiveApiKey = isHsxUrl ? "" : apiKey;

    // Fetch
    try {
      response = await deps.fetchPdf(row.source_url, effectiveApiKey);
    } catch (err) {
      logger.warn("[bctcPdfPull] fetch failed", {
        ticker: row.action_code,
        url: row.source_url,
        error: err instanceof Error ? err.message : String(err),
      });
      result.failed++;
      recordFailedAttempt(row);
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
      recordFailedAttempt(row);
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
      recordFailedAttempt(row);
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
      recordFailedAttempt(row);
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
      recordFailedAttempt(row);
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
    // FIX-BCTC-EXTRACT-LOCALPATH: production triggerExtraction now delegates to
    // triggerPushBctcExtraction (3-tier fallback via filePath, not raw pdfUrl).
    try {
      await deps.triggerExtraction({
        actionCode: row.action_code,
        year: row.period_year,
        quarter: row.period_quarter,
        filePath,
        pdfUrl: row.source_url, // FIX-BCTC-EXTRACT-LOCALPATH: Tier 1 attempt; filePath is primary
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
    deferred: result.deferred,
  });

  return result;
}
