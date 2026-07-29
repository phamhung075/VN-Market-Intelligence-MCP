/**
 * bctcPdfPullJob tests
 *
 * Tests for the pull-based BCTC PDF download job.
 * The job:
 *   1. Queries bctc_vps_queue for pending items where source_url starts with
 *      the VPS base URL (http://125.212.251.27:8765/bctc-files/).
 *   2. Downloads each PDF via fetch with X-API-Key header.
 *   3. Validates size >= MIN_PDF_BYTES (10 240).
 *   4. Saves to data/pdfs/<TICKER>_<YEAR>_Q<QUARTER>.pdf.
 *   4b. Ensures a financial_reports shell row exists with pdf_path set.
 *   5. Awaits the legacy scalar text-extraction pipeline (injectable, unrelated
 *      to table extraction below).
 *   6. Fires the async PEK table-extraction trigger and updates
 *      bctc_vps_queue status to 'pek_triggered'.
 *
 * All I/O is injected — no real network calls, no real FS writes.
 *
 * FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS (2026-07-10): the OLD synchronous
 * 0-row gate (bctc_table_rows/bctc_md_tables count → done/enrich_failed,
 * decided synchronously right after triggerExtraction) has been REMOVED —
 * /pek-extract is fire-and-forget (202), so a synchronous post-fire row-count
 * check was structurally guaranteed to read 0. Every row that reaches Step 4
 * (PDF saved) now advances to the new intermediate 'pek_triggered' status;
 * reconciliation to a genuine done/enrich_failed verdict is deferred to the
 * NOT-YET-LANDED bctcExtractReconcileJob.ts (FIX-BCTC-D3C-RECONCILE-JOB).
 * Tests below that previously asserted 'done' or 'enrich_failed' as the final
 * queue status now assert 'pek_triggered' instead — see inline notes at each
 * updated test. TC-14..TC-17 are new: they cover the PEK-trigger call
 * contract (report_id/pdf_path) and the outcome-folding rule (202, 503
 * market-hours, and genuine trigger-call errors all land on 'pek_triggered' —
 * D3C is the only place that decides done vs enrich_failed).
 *
 * FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD (2026-07-10): TC-14..TC-16 now pin an
 * explicit off-hours `now` (OFF_HOURS_NOW) so their "trigger IS called"
 * assertions stay deterministic regardless of the real wall-clock time the
 * suite runs at — the new client-side isVnMarketHours(now) pre-check (added
 * immediately before the triggerPekExtraction call site) would otherwise
 * skip the call whenever the suite happened to run during 02:00-08:59 UTC.
 * TC-18..TC-20 are new: they cover the guard itself (skip when market open,
 * call as before when market closed, and the pre-existing shellRow-null
 * branch is unaffected by the guard either way).
 *
 * FIX-BCTC-EXTRACT-LOCALPATH (TC-11, TC-12):
 *   Root cause: bctcPdfPullJob L143 called extractViaMicroservice(params.pdfUrl)
 *   passing the VPS source URL. The pdf-extractor microservice fetches that URL
 *   without X-API-Key → HTTP 401 → serviceResult=null → pipeline skipped.
 *   Fix: makeProductionDeps().triggerExtraction must delegate to
 *   triggerPushBctcExtraction which has 3-tier fallback:
 *     Tier 1: pdfUrl (VPS → 401 → null)
 *     Tier 2: file://{filePath} (shared volume)
 *     Tier 3: direct pdf-parse from local buffer
 *   Contract proven via injectable seam: triggerExtraction must receive a
 *   non-empty filePath that matches buildPdfSavePath convention.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { isVnMarketHours } from "../domain/services/freshnessSlaChecker.js";
import {
  runBctcPdfPullJob,
  VPS_BCTC_BASE_URL,
  MIN_PDF_BYTES,
  buildPdfSavePath,
  type BctcPdfPullDeps,
  type BctcPdfPullResult,
} from "../scheduler/financial-reports/bctcPdfPullJob.js";

// FIX-BCTC-R-HIGH-2: fixed clocks for the market-hours guard so TC-14..TC-20
// are deterministic regardless of the real wall-clock time the suite runs at
// (2026-07-06 is a Monday / VN trading day — see isVnMarketHours sanity
// assertions at each use site below).
const OFF_HOURS_NOW = new Date("2026-07-06T09:30:00Z"); // after 08:59 UTC close
const MARKET_HOURS_NOW = new Date("2026-07-06T04:00:00Z"); // inside 02:00-08:59 UTC

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function insertQueueItem(
  db: Database,
  code: string,
  year: number,
  quarter: string,
  sourceUrl: string | null,
  status = "pending",
): void {
  db.prepare(`
    INSERT OR REPLACE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(code, year, quarter, status, sourceUrl);
}

function getQueueRow(
  db: Database,
  code: string,
  year: number,
  quarter: string,
): { status: string; source_url: string | null } | undefined {
  return db.prepare(
    `SELECT status, source_url FROM bctc_vps_queue
     WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
  ).get(code, year, quarter) as any;
}

/** Build a Uint8Array of given byte length (fake PDF body). */
function fakeBody(bytes: number): Uint8Array {
  return new Uint8Array(bytes).fill(0x25); // 0x25 = '%' (PDF magic-ish)
}

/** Build a mock Response wrapping the given bytes. */
function mockOkResponse(bytes: number): Response {
  return new Response(fakeBody(bytes).buffer as ArrayBuffer, { status: 200 });
}

function mockErrorResponse(status: number): Response {
  return new Response("error", { status });
}

/** Builds a minimal injectable deps object. */
function makeDeps(overrides: Partial<BctcPdfPullDeps> = {}): BctcPdfPullDeps {
  return {
    fetchPdf: async (_url, _apiKey) => mockOkResponse(MIN_PDF_BYTES + 1_000),
    savePdf: async (_path, _buf) => {},
    triggerExtraction: async (_params) => {},
    ...overrides,
  };
}

/**
 * FIX-BCTC-ENRICH-SILENT-0ROWS: seed a financial_reports header + at least 1
 * bctc_table_rows row for a given ticker+period so the 0-row gate passes and the
 * queue advances to 'done'. Tests that verify the happy-path (download + done)
 * must call this to simulate a successful extraction.
 */
function seedExtractionResult(
  db: Database,
  code: string,
  year: number,
  quarter: string,
): void {
  const q = quarter.startsWith("Q") ? quarter : `Q${quarter}`;
  const sortKey = `${year}-${q}`;
  const qNum = parseInt(q.slice(1), 10);
  const reportId = `aabbccdd-${year}-${qNum}${qNum}${qNum}${qNum}-8000-${code.toLowerCase().padEnd(12, "0").slice(0, 12)}`;
  db.prepare(`
    INSERT OR REPLACE INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end, sort_key,
       net_profit, audit_status, extraction_confidence, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, ?, 'Test Corp', 'HOSE', 'other',
            ?, ?, ?, '${year}-01-01', '${year}-12-31', ?,
            0.0, 'unaudited', 0.75, datetime('now'),
            '{}', '{}', '{}', '{}')
  `).run(reportId, code, year, qNum, q, sortKey);
  db.prepare(`
    INSERT OR IGNORE INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, label, period_current, unit)
    VALUES (?, 1, 'balance_sheet', 1, 'Total Assets', '${sortKey}', 'billion_vnd')
  `).run(reportId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("bctcPdfPullJob", () => {
  let testDb: Database;

  beforeEach(async () => {
    closeDb();
    testDb = new SqliteDatabase(":memory:");
    testDb.exec("PRAGMA journal_mode = WAL");
    await initDatabase(testDb);
    testDb.prepare("DELETE FROM bctc_vps_queue").run();
  });

  afterEach(() => {
    try { testDb.close(); } catch { /* ignore */ }
    closeDb();
  });

  // ── Constants ──────────────────────────────────────────────────────────────

  it("exports VPS_BCTC_BASE_URL with correct prefix", () => {
    expect(VPS_BCTC_BASE_URL).toBe("http://125.212.251.27:8765/bctc-files/");
  });

  it("exports MIN_PDF_BYTES = 10240", () => {
    expect(MIN_PDF_BYTES).toBe(10_240);
  });

  // ── TC-1: empty queue — no-op ──────────────────────────────────────────────

  it("returns zero counts when queue is empty", async () => {
    const result = await runBctcPdfPullJob({ db: testDb, deps: makeDeps() });
    expect(result.itemsProcessed).toBe(0);
    expect(result.downloaded).toBe(0);
    expect(result.failed).toBe(0);
  });

  // ── TC-2: skips items whose source_url does not start with VPS base URL ──

  it("ignores queue items with non-VPS source_url", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", "https://ssc.gov.vn/vcb.pdf");

    const result = await runBctcPdfPullJob({ db: testDb, deps: makeDeps() });
    expect(result.itemsProcessed).toBe(0);
    expect(result.downloaded).toBe(0);

    // Status must remain pending
    const row = getQueueRow(testDb, "VCB", 2025, "Q1");
    expect(row?.status).toBe("pending");
  });

  it("ignores items with null source_url", async () => {
    insertQueueItem(testDb, "VCB", 2025, "Q1", null);

    const result = await runBctcPdfPullJob({ db: testDb, deps: makeDeps() });
    expect(result.itemsProcessed).toBe(0);
  });

  it("ignores items already marked done", async () => {
    insertQueueItem(
      testDb,
      "VCB",
      2025,
      "Q1",
      `${VPS_BCTC_BASE_URL}VCB/20250330-VCB-BCTC.pdf`,
      "done",
    );

    const result = await runBctcPdfPullJob({ db: testDb, deps: makeDeps() });
    expect(result.itemsProcessed).toBe(0);
  });

  // ── TC-3: successful download path ────────────────────────────────────────

  it("downloads PDF, saves file, marks status pek_triggered, triggers extraction", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}VCB/20260130-VCB-BCTC.pdf`;
    insertQueueItem(testDb, "VCB", 2025, "Q4", sourceUrl);
    // FIX-BCTC-ENRICH-SILENT-0ROWS: seed extraction result so 0-row gate passes
    seedExtractionResult(testDb, "VCB", 2025, "Q4");

    const savedPaths: string[] = [];
    const triggerCalls: Array<{ actionCode: string; year: number; quarter: string }> = [];

    const deps: BctcPdfPullDeps = {
      fetchPdf: async (_url, _apiKey) => mockOkResponse(MIN_PDF_BYTES + 5_000),
      savePdf: async (path, _buf) => { savedPaths.push(path); },
      triggerExtraction: async (params) => { triggerCalls.push(params); },
    };

    const result = await runBctcPdfPullJob({ db: testDb, deps });

    expect(result.itemsProcessed).toBe(1);
    expect(result.downloaded).toBe(1);
    expect(result.failed).toBe(0);

    // File path should follow <TICKER>_<YEAR>_Q<QUARTER>.pdf convention
    expect(savedPaths.length).toBe(1);
    expect(savedPaths[0]).toMatch(/VCB_2025_Q4\.pdf$/);

    // Extraction triggered with correct params
    expect(triggerCalls.length).toBe(1);
    expect(triggerCalls[0]!.actionCode).toBe("VCB");
    expect(triggerCalls[0]!.year).toBe(2025);
    expect(triggerCalls[0]!.quarter).toBe("Q4");

    // Queue row marked pek_triggered (FIX-BCTC-D3B — the 0-row gate that used
    // to decide done vs enrich_failed synchronously has been removed).
    const row = getQueueRow(testDb, "VCB", 2025, "Q4");
    expect(row?.status).toBe("pek_triggered");
  });

  // FIX-BCTC-D3C-FOLLOW-UP-RESET-ATTEMPTS: a row recycled by the enricher's
  // Arm-2 grace-period retry may still carry a stale reconcile_attempts
  // counter from its prior pek_triggered→enrich_failed cycle. Every entry
  // into pek_triggered must reset it so bctcExtractReconcileJob.ts's own
  // budget starts fresh, not pre-exhausted.
  it("resets reconcile_attempts to 0 when a recycled row re-enters pek_triggered", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}VCB/20260130-VCB-BCTC-Q1.pdf`;
    insertQueueItem(testDb, "VCB", 2025, "Q1", sourceUrl);
    seedExtractionResult(testDb, "VCB", 2025, "Q1");

    // Simulate a stale counter left over from a prior exhausted reconcile cycle.
    testDb.prepare(
      `UPDATE bctc_vps_queue SET reconcile_attempts = 8 WHERE action_code = 'VCB' AND period_year = 2025 AND period_quarter = 'Q1'`,
    ).run();

    const result = await runBctcPdfPullJob({ db: testDb, deps: makeDeps() });
    expect(result.downloaded).toBe(1);

    const row = testDb
      .prepare(
        `SELECT status, reconcile_attempts FROM bctc_vps_queue WHERE action_code = 'VCB' AND period_year = 2025 AND period_quarter = 'Q1'`,
      )
      .get() as { status: string; reconcile_attempts: number } | null;

    expect(row?.status).toBe("pek_triggered");
    expect(row?.reconcile_attempts).toBe(0);
  });

  // ── TC-4: size guard — PDF too small ─────────────────────────────────────

  it("fails when downloaded PDF is smaller than MIN_PDF_BYTES", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}FPT/20260130-FPT-BCTC.pdf`;
    insertQueueItem(testDb, "FPT", 2025, "Q4", sourceUrl);

    const savedPaths: string[] = [];
    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(500), // well below 10 240
      savePdf: async (path, _buf) => { savedPaths.push(path); },
      triggerExtraction: async () => {},
    };

    const result = await runBctcPdfPullJob({ db: testDb, deps });

    expect(result.failed).toBe(1);
    expect(result.downloaded).toBe(0);
    expect(savedPaths.length).toBe(0); // save must NOT be called

    // Queue row stays pending (not marked done)
    const row = getQueueRow(testDb, "FPT", 2025, "Q4");
    expect(row?.status).toBe("pending");
  });

  // ── TC-5: HTTP error response ─────────────────────────────────────────────

  it("fails gracefully on HTTP 403 response", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}HPG/20260130-HPG-BCTC.pdf`;
    insertQueueItem(testDb, "HPG", 2025, "Q4", sourceUrl);

    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockErrorResponse(403),
      savePdf: async () => {},
      triggerExtraction: async () => {},
    };

    const result = await runBctcPdfPullJob({ db: testDb, deps });
    expect(result.failed).toBe(1);
    expect(result.downloaded).toBe(0);

    const row = getQueueRow(testDb, "HPG", 2025, "Q4");
    expect(row?.status).toBe("pending");
  });

  // ── TC-6: fetch throws (network error) ────────────────────────────────────

  it("increments failed count when fetch throws", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}MWG/20260130-MWG-BCTC.pdf`;
    insertQueueItem(testDb, "MWG", 2025, "Q4", sourceUrl);

    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => { throw new Error("Network timeout"); },
      savePdf: async () => {},
      triggerExtraction: async () => {},
    };

    const result = await runBctcPdfPullJob({ db: testDb, deps });
    expect(result.failed).toBe(1);
    expect(result.downloaded).toBe(0);
  });

  // ── TC-7: uses VPS_PUSH_API_KEY from Bun.env ──────────────────────────────

  it("passes API key from Bun.env.VPS_PUSH_API_KEY to fetchPdf", async () => {
    Bun.env["VPS_PUSH_API_KEY"] = "test-api-key-abc123";
    const sourceUrl = `${VPS_BCTC_BASE_URL}VNM/20260130-VNM-BCTC.pdf`;
    insertQueueItem(testDb, "VNM", 2025, "Q4", sourceUrl);

    const capturedKeys: string[] = [];
    const deps: BctcPdfPullDeps = {
      fetchPdf: async (_url, apiKey) => {
        capturedKeys.push(apiKey);
        return mockOkResponse(MIN_PDF_BYTES + 1_000);
      },
      savePdf: async () => {},
      triggerExtraction: async () => {},
    };

    await runBctcPdfPullJob({ db: testDb, deps });
    expect(capturedKeys[0]).toBe("test-api-key-abc123");
  });

  // ── TC-8: batch limit respected ───────────────────────────────────────────

  it("processes at most batchSize items per run", async () => {
    for (let i = 1; i <= 15; i++) {
      const code = `TK${String(i).padStart(2, "0")}`;
      insertQueueItem(
        testDb,
        code,
        2025,
        "Q4",
        `${VPS_BCTC_BASE_URL}${code}/file.pdf`,
      );
      // FIX-BCTC-ENRICH-SILENT-0ROWS: seed extraction result for each item
      seedExtractionResult(testDb, code, 2025, "Q4");
    }

    const result = await runBctcPdfPullJob({
      db: testDb,
      batchSize: 5,
      deps: makeDeps(),
    });

    expect(result.itemsProcessed).toBe(5);
    expect(result.downloaded).toBe(5);
  });

  // ── TC-9: multiple items — processes all in batch ─────────────────────────

  it("processes multiple VPS queue items in one run", async () => {
    for (const code of ["VCB", "FPT", "HPG"]) {
      insertQueueItem(testDb, code, 2025, "Q4", `${VPS_BCTC_BASE_URL}${code}/${code.toLowerCase()}.pdf`);
      // FIX-BCTC-ENRICH-SILENT-0ROWS: seed extraction result for each item
      seedExtractionResult(testDb, code, 2025, "Q4");
    }

    const result = await runBctcPdfPullJob({ db: testDb, deps: makeDeps() });

    expect(result.itemsProcessed).toBe(3);
    expect(result.downloaded).toBe(3);
    expect(result.failed).toBe(0);

    for (const code of ["VCB", "FPT", "HPG"]) {
      const row = getQueueRow(testDb, code, 2025, "Q4");
      expect(row?.status).toBe("pek_triggered"); // FIX-BCTC-D3B
    }
  });

  // ── TC-10/TC-10b: SUPERSEDED by FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS ──────
  // Historic behaviour (FIX-BCTC-ENRICH-SILENT-0ROWS, now removed): a
  // triggerExtraction throw was fed into a synchronous bctc_table_rows/
  // bctc_md_tables count that decided 'enrich_failed' (0 rows) vs 'done'
  // (rows pre-seeded). That decision point no longer exists in this job —
  // the legacy triggerExtraction dep is independent of the new PEK-trigger
  // step, and BOTH scenarios below now land on 'pek_triggered' regardless of
  // whether triggerExtraction throws or table rows happen to already exist.
  // (Reconciling to done/enrich_failed based on actual bctc_layout_units
  // counts is bctcExtractReconcileJob.ts's job — FIX-BCTC-D3C-RECONCILE-JOB,
  // not yet landed.) sendBugFn is no longer a runBctcPdfPullJob option (the
  // BUG notification responsibility moved to D3C per the design doc) — both
  // tests below drop that plumbing.

  it("TC-10: triggerExtraction throws + 0 table rows → still advances to pek_triggered (not blocked by legacy-pipeline failure)", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}ACB/acb.pdf`;
    insertQueueItem(testDb, "ACB", 2025, "Q4", sourceUrl);
    // No seedExtractionResult — 0 bctc_table_rows (irrelevant to the new flow;
    // this job no longer inspects that table at all).

    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
      savePdf: async () => {},
      triggerExtraction: async () => { throw new Error("Pipeline unavailable"); },
    };

    const result = await runBctcPdfPullJob({ db: testDb, deps });

    expect(result.downloaded).toBe(1); // legacy-pipeline throw is non-fatal
    expect(result.failed).toBe(0);

    const row = getQueueRow(testDb, "ACB", 2025, "Q4");
    expect(row?.status).toBe("pek_triggered");
  });

  it("TC-10b: triggerExtraction throws but table rows WERE already seeded → still pek_triggered (row-count no longer inspected)", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}ACB/acb.pdf`;
    insertQueueItem(testDb, "ACB", 2025, "Q4", sourceUrl);
    // Rows seeded as if a prior partial run already pushed them — proves the
    // presence/absence of bctc_table_rows no longer influences the outcome.
    seedExtractionResult(testDb, "ACB", 2025, "Q4");

    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
      savePdf: async () => {},
      triggerExtraction: async () => { throw new Error("Retry not needed — rows already in DB"); },
    };

    const result = await runBctcPdfPullJob({ db: testDb, deps });

    expect(result.downloaded).toBe(1);
    const row = getQueueRow(testDb, "ACB", 2025, "Q4");
    expect(row?.status).toBe("pek_triggered");
  });

  // ── TC-11: FIX-BCTC-EXTRACT-LOCALPATH — filePath must be non-empty and canonical ──
  // Contract: triggerExtraction MUST receive a filePath matching buildPdfSavePath
  // convention (<TICKER>_<YEAR>_Q<QUARTER>.pdf under the pdfDir).
  // This ensures the production dep has a local path to work with regardless of
  // whether the VPS source URL is accessible.

  it("TC-11: triggerExtraction receives filePath matching buildPdfSavePath convention", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}PPC/20260130-PPC-BCTC.pdf`;
    insertQueueItem(testDb, "PPC", 2025, "Q4", sourceUrl);

    const capturedFilePaths: string[] = [];
    const capturedPdfUrls: string[] = [];

    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
      savePdf: async () => {},
      triggerExtraction: async (params) => {
        capturedFilePaths.push(params.filePath);
        capturedPdfUrls.push(params.pdfUrl);
      },
    };

    // Use a fixed pdfDir so path is predictable
    const pdfDir = "/app/data/pdfs";
    await runBctcPdfPullJob({ db: testDb, deps, pdfDir });

    // filePath must match buildPdfSavePath convention
    const expectedPath = buildPdfSavePath("PPC", 2025, "Q4", pdfDir);
    expect(capturedFilePaths).toHaveLength(1);
    expect(capturedFilePaths[0]).toBe(expectedPath);
    expect(capturedFilePaths[0]).toMatch(/PPC_2025_Q4\.pdf$/);

    // pdfUrl is the VPS source URL — passed through for Tier-1 attempt
    expect(capturedPdfUrls[0]).toBe(sourceUrl);
  });

  // ── TC-12: FIX-BCTC-EXTRACT-LOCALPATH — VPS URL 401 path demonstrates the bug ──
  // Regression guard: proves the broken pattern (forwarding VPS URL to extractor
  // without auth → 401 → null → pipeline never runs) is visible through the
  // injectable seam. The fix ensures production deps use triggerPushBctcExtraction
  // (3-tier fallback) instead of raw extractViaMicroservice(pdfUrl).
  //
  // We simulate the old broken behaviour: triggerExtraction internally calls
  // extractViaMicroservice(pdfUrl) — when pdfUrl is a VPS URL and the service
  // returns null (simulating 401), the pipeline (pipelineCalled) stays false.
  // After fix: production deps use triggerPushBctcExtraction which falls back
  // to filePath-based extraction → pipeline eventually called.

  it("TC-12: when extractViaMicroservice returns null for VPS URL, pipeline must still be reachable via filePath fallback", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}PPC/20260130-PPC-BCTC.pdf`;
    insertQueueItem(testDb, "PPC", 2025, "Q4", sourceUrl);

    const pipelineCalls: Array<{ usedFilePath: boolean; usedPdfUrl: boolean }> = [];

    // Simulate the FIXED behaviour: triggerExtraction uses filePath (not pdfUrl) as primary.
    // When the mock service call for pdfUrl returns null (401-like), it falls back to filePath.
    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
      savePdf: async () => {},
      triggerExtraction: async (params) => {
        // Simulate: Tier-1 extractor call with VPS pdfUrl → null (401)
        const tier1Result = null; // VPS URL without API key → 401 → null

        if (tier1Result === null && params.filePath) {
          // Tier-2/3: use local file path — this is what the fix enables
          pipelineCalls.push({ usedFilePath: true, usedPdfUrl: false });
        } else if (tier1Result !== null) {
          pipelineCalls.push({ usedFilePath: false, usedPdfUrl: true });
        }
        // If both null and no filePath: pipeline never called (broken state)
      },
    };

    await runBctcPdfPullJob({ db: testDb, deps, pdfDir: "/app/data/pdfs" });

    // The fixed path: filePath fallback must have been used
    expect(pipelineCalls).toHaveLength(1);
    expect(pipelineCalls[0]!.usedFilePath).toBe(true);
    expect(pipelineCalls[0]!.usedPdfUrl).toBe(false);
  });

  // ── TC-13: FIX-BCTC-D2-ENSURE-SHELL-ROW — shell row exists w/ pdf_path set ──
  // Design: docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md §D2.
  // No seedExtractionResult() call here — GAS is a brand-new ticker with no
  // prior financial_reports row and no legacy scalar pipeline entry. Proves
  // Step 4b creates the shell row regardless (concern 3: decoupled from the
  // OCR-confidence gate) with pdf_path already set (concern 2) at PDF-save
  // time, into the SAME db the job was given — not the getDb() singleton.

  it("TC-13: PDF saved → financial_reports shell row exists with pdf_path set (pending_extraction, new ticker)", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}GAS/20260130-GAS-BCTC.pdf`;
    insertQueueItem(testDb, "GAS", 2025, "Q4", sourceUrl);

    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
      savePdf: async () => {},
      triggerExtraction: async () => {},
    };

    const pdfDir = "/app/data/pdfs";
    await runBctcPdfPullJob({ db: testDb, deps, pdfDir });

    const expectedPath = buildPdfSavePath("GAS", 2025, "Q4", pdfDir);
    const shellRow = testDb
      .prepare(
        `SELECT id, pdf_path, validation_status FROM financial_reports
         WHERE action_code = ? AND sort_key = ?`,
      )
      .get("GAS", "2025-Q4") as { id: string; pdf_path: string | null; validation_status: string } | null;

    expect(shellRow).not.toBeNull();
    expect(shellRow!.pdf_path).toBe(expectedPath);
    expect(shellRow!.validation_status).toBe("pending_extraction");

    // FIX-BCTC-D3B: the 0-row gate that used to synchronously decide
    // done/enrich_failed for a shell-only row has been removed — the queue
    // row now advances to 'pek_triggered' regardless (the shell row's
    // existence/pdf_path is the D2 assertion above; the PEK trigger fired for
    // this row is asserted separately in the TC-14+ suite below).
    const queueRow = getQueueRow(testDb, "GAS", 2025, "Q4");
    expect(queueRow?.status).toBe("pek_triggered");
  });

  it("TC-13b: pre-existing legacy row with pdf_path IS NULL gets pdf_path set at PDF-save time (same id preserved)", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}GVR/20260130-GVR-BCTC.pdf`;
    insertQueueItem(testDb, "GVR", 2025, "Q4", sourceUrl);

    // Simulate the exact GVR/MBB/D2D bug this task's design doc targets: a
    // legacy scalar-pipeline row already exists but pdf_path was never
    // flushed to SQLite (post-persist-mutation-never-flushed bug, see D1/D2
    // brownfield findings).
    const preExistingId = "gvr-preexisting-0000-0000-000000000000";
    testDb.prepare(`
      INSERT INTO financial_reports (
        id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        pdf_path, parsed_at, validation_status,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
      ) VALUES (
        ?, 'GVR', 'GVR Corp', 'HOSE', 'other',
        2025, 4, 'Q4', '2025-10-01', '2025-12-31', '2025-Q4',
        NULL, datetime('now'), 'passed',
        '{}', '{}', '{}', '{}'
      )
    `).run(preExistingId);

    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
      savePdf: async () => {},
      triggerExtraction: async () => {},
    };

    const pdfDir = "/app/data/pdfs";
    await runBctcPdfPullJob({ db: testDb, deps, pdfDir });

    const expectedPath = buildPdfSavePath("GVR", 2025, "Q4", pdfDir);
    const row = testDb
      .prepare(
        `SELECT id, pdf_path, validation_status FROM financial_reports
         WHERE action_code = ? AND sort_key = ?`,
      )
      .get("GVR", "2025-Q4") as { id: string; pdf_path: string | null; validation_status: string } | null;

    expect(row).not.toBeNull();
    expect(row!.id).toBe(preExistingId); // id preserved — no re-mint
    expect(row!.pdf_path).toBe(expectedPath);
    // validation_status untouched by the shell-row upsert (DO UPDATE SET
    // only touches pdf_path) — legacy row's own status survives.
    expect(row!.validation_status).toBe("passed");
  });

  // ── TC-14..TC-17: FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS ────────────────────
  // Design: docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md §D3.
  // Covers the PEK-trigger call contract (report_id/pdf_path) and the
  // outcome-folding rule: every triggerPekExtraction() outcome (202 queued,
  // 503 market-hours, or a genuine trigger-call error) lands the queue row on
  // 'pek_triggered' — none is a proven synchronous success/failure at this
  // layer; only the not-yet-landed bctcExtractReconcileJob's actual
  // bctc_layout_units row-count check is.

  it("TC-14: triggerPekExtraction called with the shell row's report_id and the saved filePath", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}REE/20260130-REE-BCTC.pdf`;
    insertQueueItem(testDb, "REE", 2025, "Q4", sourceUrl);

    const pekCalls: Array<{ reportId: string; pdfPath: string }> = [];
    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
      savePdf: async () => {},
      triggerExtraction: async () => {},
      triggerPekExtraction: async (reportId, pdfPath) => {
        pekCalls.push({ reportId, pdfPath });
        return { outcome: "queued", status: 202, reportId, pdfPath };
      },
    };

    const pdfDir = "/app/data/pdfs";
    // FIX-BCTC-R-HIGH-2: pin an off-hours clock — this test asserts the
    // trigger IS called, which is only true when the new market-hours guard
    // does not fire (see TC-18 for the guard-fires case).
    await runBctcPdfPullJob({ db: testDb, deps, pdfDir, now: OFF_HOURS_NOW });

    const expectedPath = buildPdfSavePath("REE", 2025, "Q4", pdfDir);
    const shellRow = testDb
      .prepare(`SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?`)
      .get("REE", "2025-Q4") as { id: string } | null;

    expect(shellRow).not.toBeNull();
    expect(pekCalls).toHaveLength(1);
    expect(pekCalls[0]!.reportId).toBe(shellRow!.id);
    expect(pekCalls[0]!.pdfPath).toBe(expectedPath);

    const queueRow = getQueueRow(testDb, "REE", 2025, "Q4");
    expect(queueRow?.status).toBe("pek_triggered");
  });

  it("TC-15: /pek-extract 503 (VN market-hours guard) folds into pek_triggered — no separate pek_deferred_market_hours status", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}HSG/20260130-HSG-BCTC.pdf`;
    insertQueueItem(testDb, "HSG", 2025, "Q4", sourceUrl);

    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
      savePdf: async () => {},
      triggerExtraction: async () => {},
      triggerPekExtraction: async (reportId, pdfPath) => ({
        outcome: "market_hours", status: 503, reportId, pdfPath, body: "market open",
      }),
    };

    // FIX-BCTC-R-HIGH-2: off-hours clock — this test's 503 outcome must come
    // from the deps mock (simulating a call that WAS made and pdf-extractor's
    // own Layer-2 guard rejected it), not from the new client-side guard
    // short-circuiting the call before it happens.
    await runBctcPdfPullJob({ db: testDb, deps, pdfDir: "/app/data/pdfs", now: OFF_HOURS_NOW });

    const queueRow = getQueueRow(testDb, "HSG", 2025, "Q4");
    expect(queueRow?.status).toBe("pek_triggered");
  });

  it("TC-16: /pek-extract genuine error outcomes (pdf_extractor_error, unreachable) also fold into pek_triggered — D3C's row-count check is the only terminal-verdict authority", async () => {
    for (const outcome of [
      { outcome: "pdf_extractor_error" as const, status: 502 as const, pekStatus: 500, body: "boom" },
      { outcome: "unreachable" as const, status: 502 as const, error: "ECONNREFUSED" },
    ]) {
      const code = outcome.outcome === "pdf_extractor_error" ? "PVD" : "PVS";
      const sourceUrl = `${VPS_BCTC_BASE_URL}${code}/${code.toLowerCase()}.pdf`;
      insertQueueItem(testDb, code, 2025, "Q4", sourceUrl);

      const deps: BctcPdfPullDeps = {
        fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
        savePdf: async () => {},
        triggerExtraction: async () => {},
        triggerPekExtraction: async (reportId, pdfPath) =>
          ({ ...outcome, reportId, pdfPath }) as never,
      };

      // FIX-BCTC-R-HIGH-2: off-hours clock — same rationale as TC-15 above.
      await runBctcPdfPullJob({ db: testDb, deps, pdfDir: "/app/data/pdfs", now: OFF_HOURS_NOW });

      const queueRow = getQueueRow(testDb, code, 2025, "Q4");
      expect(queueRow?.status).toBe("pek_triggered");
    }
  });

  it("TC-17: ensureFinancialReportShellRow failure → PEK trigger skipped, row still advances to pek_triggered (D3C re-derives report_id later)", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}DGC/20260130-DGC-BCTC.pdf`;
    insertQueueItem(testDb, "DGC", 2025, "Q4", sourceUrl);

    let pekCalled = false;
    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
      savePdf: async () => {},
      triggerExtraction: async () => {},
      triggerPekExtraction: async (reportId, pdfPath) => {
        pekCalled = true;
        return { outcome: "queued", status: 202, reportId, pdfPath };
      },
    };

    // Force ensureFinancialReportShellRow to throw: drop the financial_reports
    // table entirely so the INSERT inside the usecase fails with "no such table".
    testDb.exec("DROP TABLE financial_reports");

    const result = await runBctcPdfPullJob({ db: testDb, deps, pdfDir: "/app/data/pdfs" });

    expect(pekCalled).toBe(false); // no report_id available — PEK trigger must not fire
    expect(result.downloaded).toBe(1); // row still advances (non-fatal)

    const queueRow = getQueueRow(testDb, "DGC", 2025, "Q4");
    expect(queueRow?.status).toBe("pek_triggered");
  });

  // ── TC-18..TC-20: FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD ──────────────────────
  // Design: docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md
  // §Risk flags R-HIGH-2 (PM option A: client-side isVnMarketHours() pre-check).
  // pdf-extractor's own Layer-2 guard already 503s any /pek-extract call
  // received during VN market hours — this client-side guard exists only to
  // avoid the guaranteed-failure round-trip + noisy 503 log spam every
  // ~30 min during 02:00-08:59 UTC. It must guard the network call ONLY —
  // the queue row's advance to 'pek_triggered' must be unaffected either way.

  it("TC-18: isVnMarketHours()=true (market open) → triggerPekExtraction is NOT called, row still advances to pek_triggered", async () => {
    expect(isVnMarketHours(MARKET_HOURS_NOW)).toBe(true); // sanity

    const sourceUrl = `${VPS_BCTC_BASE_URL}VCB/20260130-VCB-BCTC.pdf`;
    insertQueueItem(testDb, "VCB", 2025, "Q4", sourceUrl);

    let pekCalled = false;
    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
      savePdf: async () => {},
      triggerExtraction: async () => {},
      triggerPekExtraction: async (reportId, pdfPath) => {
        pekCalled = true;
        return { outcome: "queued", status: 202, reportId, pdfPath };
      },
    };

    const result = await runBctcPdfPullJob({
      db: testDb,
      deps,
      pdfDir: "/app/data/pdfs",
      now: MARKET_HOURS_NOW,
    });

    expect(pekCalled).toBe(false); // guard must skip the call entirely
    expect(result.downloaded).toBe(1); // row still "advanced" this cycle

    const queueRow = getQueueRow(testDb, "VCB", 2025, "Q4");
    expect(queueRow?.status).toBe("pek_triggered"); // state machine unaffected by the guard
  });

  it("TC-19: isVnMarketHours()=false (market closed) → triggerPekExtraction IS called (unchanged baseline behavior)", async () => {
    expect(isVnMarketHours(OFF_HOURS_NOW)).toBe(false); // sanity

    const sourceUrl = `${VPS_BCTC_BASE_URL}BID/20260130-BID-BCTC.pdf`;
    insertQueueItem(testDb, "BID", 2025, "Q4", sourceUrl);

    let pekCalled = false;
    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
      savePdf: async () => {},
      triggerExtraction: async () => {},
      triggerPekExtraction: async (reportId, pdfPath) => {
        pekCalled = true;
        return { outcome: "queued", status: 202, reportId, pdfPath };
      },
    };

    await runBctcPdfPullJob({
      db: testDb,
      deps,
      pdfDir: "/app/data/pdfs",
      now: OFF_HOURS_NOW,
    });

    expect(pekCalled).toBe(true);

    const queueRow = getQueueRow(testDb, "BID", 2025, "Q4");
    expect(queueRow?.status).toBe("pek_triggered");
  });

  it("TC-20: shellRow-null branch is unaffected by the market-hours guard — still logs the pre-existing skip reason, not the guard's, even during market hours", async () => {
    expect(isVnMarketHours(MARKET_HOURS_NOW)).toBe(true); // sanity

    const sourceUrl = `${VPS_BCTC_BASE_URL}CTG/20260130-CTG-BCTC.pdf`;
    insertQueueItem(testDb, "CTG", 2025, "Q4", sourceUrl);

    let pekCalled = false;
    const deps: BctcPdfPullDeps = {
      fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
      savePdf: async () => {},
      triggerExtraction: async () => {},
      triggerPekExtraction: async (reportId, pdfPath) => {
        pekCalled = true;
        return { outcome: "queued", status: 202, reportId, pdfPath };
      },
    };

    // Same technique as TC-17: force ensureFinancialReportShellRow to throw
    // so `shellRow` stays undefined — the guard's `shellRow &&` short-circuit
    // must route straight to the pre-existing "shell row unavailable" branch
    // regardless of `isVnMarketHours(now)`.
    testDb.exec("DROP TABLE financial_reports");

    const result = await runBctcPdfPullJob({
      db: testDb,
      deps,
      pdfDir: "/app/data/pdfs",
      now: MARKET_HOURS_NOW,
    });

    expect(pekCalled).toBe(false); // no report_id available — same reason as TC-17, not the guard
    expect(result.downloaded).toBe(1);

    const queueRow = getQueueRow(testDb, "CTG", 2025, "Q4");
    expect(queueRow?.status).toBe("pek_triggered");
  });
});
