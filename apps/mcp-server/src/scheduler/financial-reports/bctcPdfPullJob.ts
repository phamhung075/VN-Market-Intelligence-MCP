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
 *   4b. Ensure a financial_reports shell row exists with pdf_path set
 *       (FIX-BCTC-D2-ENSURE-SHELL-ROW; errors logged, non-fatal).
 *   5. Await legacy scalar text-extraction pipeline (Bug 1352a fix; errors
 *      logged, non-fatal) — UNCHANGED, unrelated to table extraction below.
 *   6. Fire the async PEK table-extraction trigger (FIX-BCTC-D3B) via the
 *      shared triggerPekExtractionForReport() helper (FIX-BCTC-D3A) and mark
 *      bctc_vps_queue status = 'pek_triggered'.
 *
 * FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS (2026-07-10): the OLD synchronous
 * 0-row gate (FIX-BCTC-ENRICH-SILENT-0ROWS — read bctc_table_rows/bctc_md_tables
 * counts immediately after triggerExtraction and decide done vs enrich_failed
 * on the spot) has been REMOVED. Root cause: /pek-extract (the only proven-
 * functional table-extraction endpoint) is 202/fire-and-forget — a
 * synchronous post-fire row-count check is structurally guaranteed to read 0.
 * The queue row now lands at the new intermediate status 'pek_triggered'
 * (PDF saved + shell row upserted + /pek-extract POST returned 202, or the
 * VN-market-hours 503, or any other trigger-call outcome — see step 6 below
 * for the full outcome-folding rationale). Reconciliation to a genuine
 * 'done'/'enrich_failed' verdict (based on actual bctc_layout_units row
 * counts, checked out-of-band with a grace window) is the job of the
 * NOT-YET-LANDED bctcExtractReconcileJob.ts (FIX-BCTC-D3C-RECONCILE-JOB) —
 * until that job lands, 'pek_triggered' rows have no further transition path.
 * Design: docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md §D3.
 *
 * All I/O (fetch, save, extraction triggers) is injectable so tests run
 * without real network, real file system, or real DB writes. Step 4b writes
 * directly via the job's own `db` handle (opts.db ?? getDb()) rather than
 * through the injectable deps — it is a pure SQLite persistence op on the
 * same DB the job already reads/writes bctc_vps_queue against, not external I/O.
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
 * This legacy scalar pipeline is UNRELATED to /pek-extract (table extraction)
 * and is untouched by FIX-BCTC-D3B — the two pipelines populate different
 * columns/tables (scalars/JSON on financial_reports vs bctc_layout_units).
 *
 * Layer: interface/scheduler — imports from infrastructure (DB, logger) only.
 *
 * @module scheduler/financial-reports/bctcPdfPullJob
 */

import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { getDb } from "../../infrastructure/db/schema.js";
import { logger } from "../../infrastructure/logger.js";
import { withDeadline } from "../../infrastructure/fetchers/fetchDeadline.js";
import { ensureFinancialReportShellRow } from "../../application/usecases/bctc/ensureFinancialReportShellRow.js";
import type { PekTriggerOutcome } from "../../infrastructure/fetchers/pekExtractTrigger.js";
import { isVnMarketHours } from "../../domain/services/freshnessSlaChecker.js";

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
// Concurrency guard (FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A full batch (DEFAULT_BATCH_SIZE=10) can legitimately take ~65-70 min
 * (fetch up to 45s + up to 3-tier extraction @120s/tier per item, observed
 * 05:30 run = 69.9 min). The 30-min cron has no built-in overlap protection,
 * and a queue row stays `status='pending'` until its own processing chain
 * finishes — so an overlapping invocation re-SELECTs and redundantly
 * re-downloads/re-extracts the SAME rows, saturating pdf-extractor and
 * starving net done-throughput (confirmed live: HCM PDF re-saved 4x, NKG 3x
 * in <1 min — docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md).
 * Mirrors the module-level `_isRunning` guard used by
 * runBreadthHistoryPersisterJob (breadthHistoryPersisterJob.ts) and
 * weatherCheckJob.ts.
 */
let _isRunning = false;

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

  /**
   * FIX-BCTC-D3B: fire the async PEK table-extraction trigger for a report.
   * Production default (makeProductionDeps) delegates to the shared
   * triggerPekExtractionForReport() helper (infrastructure/fetchers/pekExtractTrigger.ts,
   * FIX-BCTC-D3A) — the SAME implementation the manual `/api/trigger-pek-extract`
   * MCP route uses, so both call sites share one HTTP-call implementation.
   *
   * OPTIONAL (unlike the sibling deps above): most existing tests in this
   * suite predate FIX-BCTC-D3B and do not exercise this contract. When a
   * caller-supplied `deps` object omits this field, runBctcPdfPullJob falls
   * back to a stub that reports `{ outcome: "queued" }` (see DEFAULT_PEK_TRIGGER_STUB
   * below) — this never runs in production, where makeProductionDeps() always
   * populates the real implementation.
   */
  triggerPekExtraction?: (
    reportId: string,
    pdfPath: string,
  ) => Promise<PekTriggerOutcome>;
}

/**
 * FIX-BCTC-D3B: default stub used ONLY when a caller-supplied `deps` object
 * omits `triggerPekExtraction` (test ergonomics — see the field's own doc
 * comment above). Never used by makeProductionDeps(), which always wires the
 * real triggerPekExtractionForReport() helper.
 */
const DEFAULT_PEK_TRIGGER_STUB: (
  reportId: string,
  pdfPath: string,
) => Promise<PekTriggerOutcome> = async (reportId, pdfPath) => ({
  outcome: "queued",
  status: 202,
  reportId,
  pdfPath,
});

export interface BctcPdfPullResult {
  /** Total queue rows examined (matched VPS prefix and were pending). */
  itemsProcessed: number;
  /**
   * PDFs successfully downloaded, saved, and advanced to 'pek_triggered'
   * (shell row upserted + PEK extraction trigger fired). Historically named
   * for the OLD synchronous 0-row-gate's "advanced to done" counter —
   * FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS repoints it at the new terminal
   * write (`pek_triggered`) so the field's numeric meaning ("this job
   * completed a full pull+shell+trigger cycle for the row") and its one
   * production consumer (schedulerJobTable.ts's `rowsWritten`) stay intact.
   */
  downloaded: number;
  /** Items that failed (HTTP error, size guard, fetch throw). */
  failed: number;
  /**
   * FIX-BCTC-VPS-QUEUE-SYNC G1: rows transitioned to deferred_infra because
   * their attempt count reached MAX_404_ATTEMPTS. Subset of `failed`.
   */
  deferred: number;
  /**
   * FIX-BCTC-DATA-GAP-FAMILY U1.3: rows at status='pending' with a real
   * http(s) source_url that is NOT pull-eligible (not VPS_BCTC_BASE_URL / not
   * HSX_STATICFILE_BASE_URL) whose source_url was reset to NULL so
   * bctcQueueEnricherJob's Arm-1 re-discovers them (enricher-reroute — the
   * enricher is the single discovery owner). Absent (undefined) when the arm
   * found nothing to reroute.
   */
  reroutedToDiscovery?: number;
  /**
   * FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD: set to 'already_running' when this
   * invocation early-returned because a previous invocation was still
   * in-flight (module-level `_isRunning` guard). All counts above are 0 in
   * that case — no query was even issued. Absent (undefined) on a normal run.
   */
  skippedReason?: "already_running";
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
      return withDeadline(
        (signal) =>
          fetch(url, {
            headers: { "X-API-Key": apiKey },
            signal,
          }),
        45_000,
        "bctcPdfPull",
      );
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

    triggerPekExtraction: async (reportId: string, pdfPath: string) => {
      // FIX-BCTC-D3B: shared helper (FIX-BCTC-D3A) — same implementation the
      // manual /api/trigger-pek-extract MCP route uses (bctcVpsIngestHandler.ts).
      const { triggerPekExtractionForReport } = await import(
        "../../infrastructure/fetchers/pekExtractTrigger.js"
      );
      return triggerPekExtractionForReport(reportId, pdfPath);
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
 * @param opts.now       - Injectable clock for the FIX-BCTC-R-HIGH-2 market-hours
 *                         guard (defaults to `new Date()`; tests pin a fixed Date
 *                         so the guard's outcome is deterministic).
 */
export async function runBctcPdfPullJob(opts: {
  db?: Database;
  batchSize?: number;
  deps?: BctcPdfPullDeps;
  pdfDir?: string;
  now?: Date;
} = {}): Promise<BctcPdfPullResult> {
  // ── Overlap guard (FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD) ────────────────────
  // See the `_isRunning` doc comment above for the full rationale. Early
  // return here means the DB query below is never even issued while a prior
  // invocation is still mid-flight. The `finally` below always clears the
  // flag — even if the body throws — so a thrown error can never wedge the
  // guard permanently (mirrors runBreadthHistoryPersisterJob / weatherCheckJob).
  if (_isRunning) {
    logger.warn("[bctcPdfPull] already running — skipping concurrent fire");
    return {
      itemsProcessed: 0,
      downloaded: 0,
      failed: 0,
      deferred: 0,
      skippedReason: "already_running",
    };
  }
  _isRunning = true;

  try {
    const db = opts.db ?? getDb();
    const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
    const deps = opts.deps ?? (await makeProductionDeps());
    const apiKey = Bun.env.VPS_PUSH_API_KEY ?? "";
    const now = opts.now ?? new Date();

    const result: BctcPdfPullResult = {
      itemsProcessed: 0,
      downloaded: 0,
      failed: 0,
      deferred: 0,
    };

    // ── 0. Enricher-reroute arm (FIX-BCTC-DATA-GAP-FAMILY U1.3) ─────────────
    // Rows at status='pending' with a real http(s) source_url that is NOT
    // pull-eligible (not VPS_BCTC_BASE_URL / not HSX_STATICFILE_BASE_URL) are
    // structurally unpullable forever: this job's SELECT below never matches
    // them, and the enricher never re-discovers because source_url is non-NULL
    // (Arm-1 only selects NULL/placeholder values). Live case: BID 2025-Q4
    // poisoned with an owa.hnx.vn corporate-governance URL stayed `pending`
    // with attempts=0 forever (telegram 5214-5228).
    //
    // Route them back to the enricher instead of widening the pull predicate:
    // the enricher is the single discovery owner, and owa.hnx.vn reachability
    // from the mcp-server container is unverified (architect brief 2026-08-28
    // U1.3). source_url is reset to NULL (status stays 'pending'), so Arm-1
    // re-discovers on the next enricher cycle. Bounded (LIMIT 50); non-fatal
    // on schema errors (e.g. missing last_attempt in simplified fixtures).
    {
      let rerouteRows: Array<{ id: number }> = [];
      try {
        rerouteRows = db
          .query<{ id: number }, [string, string, number]>(
            `SELECT id FROM bctc_vps_queue
             WHERE status = 'pending'
               AND source_url IS NOT NULL
               AND source_url LIKE 'http%'
               AND source_url NOT LIKE ?
               AND source_url NOT LIKE ?
             ORDER BY created_at ASC
             LIMIT ?`,
          )
          .all(`${VPS_BCTC_BASE_URL}%`, `${HSX_STATICFILE_BASE_URL}%`, 50);
      } catch (err) {
        logger.debug("[bctcPdfPull] enricher-reroute arm query failed (non-fatal)", {
          error: err instanceof Error ? err.message : String(err),
        });
        rerouteRows = [];
      }

      if (rerouteRows.length > 0) {
        const rerouteStmt = db.prepare<void, [number]>(
          `UPDATE bctc_vps_queue SET source_url = NULL, attempts = 0, last_attempt = datetime('now') WHERE id = ?`,
        );
        for (const row of rerouteRows) {
          rerouteStmt.run(row.id);
        }
        result.reroutedToDiscovery = rerouteRows.length;
        logger.warn("[bctcPdfPull] non-pull-eligible pending URLs rerouted to enricher for re-discovery", {
          rerouted: rerouteRows.length,
        });
      }
    }

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
    /**
     * FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS: replaces the OLD `updateDone`
     * (which the removed synchronous 0-row gate wrote after a table-row-count
     * check that could only ever read 0 for /pek-extract's fire-and-forget
     * 202). PDF saved + shell row upserted + PEK trigger attempted (any HTTP
     * outcome — see the call site below) → 'pek_triggered'. Reconciliation to
     * 'done'/'enrich_failed' is bctcExtractReconcileJob.ts's job
     * (FIX-BCTC-D3C-RECONCILE-JOB, not yet landed).
     *
     * FIX-BCTC-D3C-FOLLOW-UP-RESET-ATTEMPTS (2026-07-29): also reset
     * reconcile_attempts = 0 unconditionally on every entry into
     * pek_triggered. bctcExtractReconcileJob.ts only ever reads/increments
     * reconcile_attempts while status='pek_triggered', so this is the single
     * natural reset point — a no-op for genuinely first-time rows (already
     * defaults to 0) and the real fix for rows recycled via
     * bctcQueueEnricherJob.ts's Arm-2 grace-period retry, which would
     * otherwise carry a stale counter into the new cycle and re-exhaust the
     * reconciliation budget prematurely.
     */
    const updatePekTriggered = db.prepare<void, [number]>(
      `UPDATE bctc_vps_queue SET status = 'pek_triggered', reconcile_attempts = 0, last_attempt = datetime('now') WHERE id = ?`,
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

      // ── 4b. Ensure financial_reports shell row (FIX-BCTC-D2-ENSURE-SHELL-ROW) ──
      // Idempotent upsert: sets pdf_path at PDF-save time (no dependency on the
      // legacy scalar pipeline ever running) and creates a row for every pulled
      // PDF regardless of the downstream OCR-confidence gate (concerns 2+3 of
      // the design doc). `db` is passed explicitly — NOT the getDb() singleton —
      // so this write always lands in the same database the caller (this job,
      // and its test suite's dedicated :memory: instance) reads back from.
      // Errors are logged and non-fatal: the pull job's own success (file saved
      // to disk) must not be reverted by a shell-row write failure; the legacy
      // scalar pipeline triggered next can still create/complete the row itself.
      //
      // The returned `id` (report_id) is captured for the PEK trigger call in
      // Step 6 below (FIX-BCTC-D3B) — undefined when the upsert itself threw.
      let shellRow: { id: string; sortKey: string } | undefined;
      try {
        const shellQuarter = row.period_quarter.startsWith("Q")
          ? (row.period_quarter as "Q1" | "Q2" | "Q3" | "Q4")
          : (`Q${row.period_quarter}` as "Q1" | "Q2" | "Q3" | "Q4");
        shellRow = await ensureFinancialReportShellRow({
          db,
          actionCode: row.action_code,
          year: row.period_year,
          quarter: shellQuarter,
          pdfPath: filePath,
        });
      } catch (err) {
        logger.warn("[bctcPdfPull] ensureFinancialReportShellRow failed (non-fatal)", {
          ticker: row.action_code,
          filePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // ── 5. Trigger legacy scalar text-extraction (await — ensures text is
      //      stored before the row advances) ─────────────────────────────────
      // Bug 1352a: was fire-and-forget; MCP tools called immediately after
      // runBctcPdfPullJob saw empty text because OCR had not completed yet.
      // FIX-BCTC-EXTRACT-LOCALPATH: production triggerExtraction now delegates to
      // triggerPushBctcExtraction (3-tier fallback via filePath, not raw pdfUrl).
      // UNCHANGED by FIX-BCTC-D3B — this is the scalar/JSON pipeline, unrelated
      // to the table-extraction (/pek-extract) trigger in Step 6 below.
      try {
        await deps.triggerExtraction({
          actionCode: row.action_code,
          year: row.period_year,
          quarter: row.period_quarter,
          filePath,
          pdfUrl: row.source_url, // FIX-BCTC-EXTRACT-LOCALPATH: Tier 1 attempt; filePath is primary
        });
      } catch (err) {
        logger.warn("[bctcPdfPull] extraction trigger failed (non-fatal)", {
          ticker: row.action_code,
          filePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // ── 6. FIX-BCTC-D3B: fire the async PEK table-extraction trigger and
      //      mark 'pek_triggered' (replaces the OLD synchronous 0-row gate) ──
      // /pek-extract is fire-and-forget (202 accepted); there is no
      // synchronous success/failure signal to gate on here — the
      // NOT-YET-LANDED bctcExtractReconcileJob.ts (FIX-BCTC-D3C-RECONCILE-JOB)
      // is the sole authority for the eventual done/enrich_failed verdict. It
      // re-derives report_id via (action_code, sort_key) when it runs, so it
      // does NOT depend on the `shellRow` local variable below.
      //
      // ALL triggerPekExtraction() outcomes land the row at 'pek_triggered' —
      // none of {202 queued, 503 market-hours, 502 pdf-extractor error, 502
      // unreachable} is a proven synchronous success or failure at this
      // layer; only D3C's actual bctc_layout_units row-count check is. The
      // market-hours 503 is explicitly folded in per the design doc's state
      // machine note (§D3) rather than a separate pek_deferred_market_hours
      // status. The two genuine-error outcomes are already logged loudly by
      // triggerPekExtractionForReport() itself (log.error) — D3C will still
      // correctly terminal-fail those rows after MAX_RECONCILE_ATTEMPTS since
      // bctc_layout_units stays genuinely empty for them.
      // FIX-BCTC-R-HIGH-2: client-side market-hours pre-check (PM option A).
      // pdf-extractor's own Layer-2 guard already 503s any /pek-extract call
      // received during VN market hours (02:00-08:59 UTC) — that outcome was
      // already folded into 'pek_triggered' above (see the block comment),
      // so correctness does not depend on this guard. It exists purely to
      // avoid firing a call this cron KNOWS will fail every ~30 min during
      // market hours (noisy 503 log spam + a wasted round-trip). The row
      // still advances to 'pek_triggered' exactly as if the call had fired —
      // bctcExtractReconcileJob.ts (D3C) re-fires/re-checks later once market
      // hours have passed, so the guard only skips the network call, never
      // the state machine.
      if (shellRow && isVnMarketHours(now)) {
        logger.info("[bctcPdfPull] skipping PEK extraction trigger — VN market hours (client-side guard)", {
          ticker: row.action_code,
          reportId: shellRow.id,
        });
      } else if (shellRow) {
        try {
          const pekOutcome = await (deps.triggerPekExtraction ?? DEFAULT_PEK_TRIGGER_STUB)(
            shellRow.id,
            filePath,
          );
          logger.info("[bctcPdfPull] PEK extraction trigger fired", {
            ticker: row.action_code,
            reportId: shellRow.id,
            outcome: pekOutcome.outcome,
          });
        } catch (err) {
          // triggerPekExtractionForReport() never throws (all failure modes
          // are represented in its return union) — defensive catch only.
          logger.warn("[bctcPdfPull] triggerPekExtraction threw unexpectedly (non-fatal)", {
            ticker: row.action_code,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      } else {
        // Shell-row upsert failed above (rare — logged there already). No
        // report_id is available to call /pek-extract with this cycle; the
        // row still advances to 'pek_triggered' so D3C's own
        // (action_code, sort_key) re-derivation gets a chance to resolve it
        // (or terminal-fail it if the row genuinely never landed).
        logger.warn("[bctcPdfPull] skipping PEK extraction trigger — shell row unavailable", {
          ticker: row.action_code,
          filePath,
        });
      }

      updatePekTriggered.run(row.id);
      result.downloaded++;
    }

    logger.info("[bctcPdfPull] cycle complete", {
      itemsProcessed: result.itemsProcessed,
      downloaded: result.downloaded,
      failed: result.failed,
      deferred: result.deferred,
    });

    return result;
  } finally {
    _isRunning = false;
  }
}
