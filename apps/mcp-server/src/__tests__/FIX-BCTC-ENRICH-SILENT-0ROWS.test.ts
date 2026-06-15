/**
 * FIX-BCTC-ENRICH-SILENT-0ROWS — TDD test suite
 *
 * AC-1: A 0-row enrich (bctc_table_rows == 0 AND bctc_md_tables == 0 for the
 *        ticker+period after triggerExtraction completes) MUST NOT mark the
 *        bctc_vps_queue row 'done'. Queue row must stay 'enrich_failed'.
 *
 * AC-2: A 0-row enrich MUST call sendBugFn (LOUD signal) with a message that
 *        includes the ticker, year, quarter, and the word "0-rows".
 *
 * AC-3: The result.enrichFailed counter MUST be incremented for each 0-row item.
 *
 * AC-4 (NON-REGRESSION): A multi-row enrich (> 0 bctc_table_rows) still advances
 *        the queue to 'done'. FPT 2026Q1 (145 rows) must not regress.
 *
 * AC-5: When sendBugFn throws, the queue row is still marked 'enrich_failed'
 *        (bug notification errors must never block the fail-loud path).
 *
 * AC-6: GENERIC — applies to ANY ticker, not just VCB or CTG. A zero-row
 *        outcome for a non-bank ticker also triggers fail-loud.
 *
 * Design: all I/O is injectable via BctcPdfPullDeps.
 * - triggerExtraction: async fn (may succeed or throw)
 * - sendBugFn: injectable in opts
 * - bctc_table_rows: populated via SQL in test DB (simulates pdf-extractor push)
 * - bctc_md_tables: populated via SQL in test DB
 * Queue item uses a VPS source URL so the pull job picks it up.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import {
  runBctcPdfPullJob,
  VPS_BCTC_BASE_URL,
  MIN_PDF_BYTES,
  type BctcPdfPullDeps,
} from "../scheduler/financial-reports/bctcPdfPullJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function insertQueueItem(
  db: Database,
  code: string,
  year: number,
  quarter: string,
  sourceUrl: string,
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
): { status: string } | undefined {
  return db.prepare(
    `SELECT status FROM bctc_vps_queue
     WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
  ).get(code, year, quarter) as any;
}

/** Seed a financial_reports header (no table rows). Uses minimal columns. */
function seedFinancialReportHeader(
  db: Database,
  code: string,
  year: number,
  quarter: number,
  reportId: string,
): void {
  const q = `Q${quarter}`;
  const sortKey = `${year}-${q}`;
  const startMonth = String((quarter - 1) * 3 + 1).padStart(2, "0");
  const endMonth = String(quarter * 3).padStart(2, "0");
  db.prepare(`
    INSERT OR REPLACE INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_quarter, period_type, period_start, period_end, sort_key,
       net_profit, audit_status, extraction_confidence, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, ?, 'Test Corp', 'HOSE', 'other',
            ?, ?, ?, ?, ?, ?,
            0.0, 'unaudited', 0.75, datetime('now'),
            '{}', '{}', '{}', '{}')
  `).run(
    reportId, code,
    year, quarter, q,
    `${year}-${startMonth}-01`, `${year}-${endMonth}-30`, sortKey,
  );
}

/** Seed bctc_table_rows for a report (simulates pdf-extractor pushing N rows). */
function seedTableRows(db: Database, reportId: string, count: number): void {
  for (let i = 0; i < count; i++) {
    db.prepare(`
      INSERT INTO bctc_table_rows
        (report_id, page_number, statement_section, row_order, label, period_current, unit)
      VALUES (?, 1, 'balance_sheet', ?, 'Row ${i}', '2026Q1', 'billion_vnd')
    `).run(reportId, i);
  }
}

/** Seed bctc_md_tables for a report. */
function seedMdTables(db: Database, reportId: string, tableCount: number): void {
  db.prepare(`
    INSERT OR REPLACE INTO bctc_md_tables
      (report_id, md_tables_json, ocr_as_markdown, table_count, page_count)
    VALUES (?, ?, '', ?, 1)
  `).run(reportId, JSON.stringify(new Array(tableCount).fill("| col |")), tableCount);
}

function fakeBody(bytes: number): Uint8Array {
  return new Uint8Array(bytes).fill(0x25);
}

function mockOkResponse(bytes: number): Response {
  return new Response(fakeBody(bytes).buffer as ArrayBuffer, { status: 200 });
}

/** Builds a minimal injectable deps object — extraction is a no-op by default. */
function makeDeps(overrides: Partial<BctcPdfPullDeps> = {}): BctcPdfPullDeps {
  return {
    fetchPdf: async (_url, _apiKey) => mockOkResponse(MIN_PDF_BYTES + 1_000),
    savePdf: async (_path, _buf) => {},
    triggerExtraction: async (_params) => {},
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-ENRICH-SILENT-0ROWS", () => {
  let testDb: Database;

  beforeEach(async () => {
    closeDb();
    testDb = new SqliteDatabase(":memory:");
    testDb.exec("PRAGMA journal_mode = WAL");
    await initDatabase(testDb);
    testDb.prepare("DELETE FROM bctc_vps_queue").run();
    testDb.prepare("DELETE FROM financial_reports").run();
    testDb.prepare("DELETE FROM bctc_table_rows").run();
    testDb.prepare("DELETE FROM bctc_md_tables").run();
  });

  afterEach(() => {
    try { testDb.close(); } catch { /* ignore */ }
    closeDb();
  });

  // ── AC-1: 0-row enrich must NOT advance queue to 'done' ────────────────────

  it("AC-1: queue stays NOT done when triggerExtraction yields 0 bctc_table_rows and 0 bctc_md_tables", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}VCB/20260101-VCB-BCTC.pdf`;
    insertQueueItem(testDb, "VCB", 2026, "Q1", sourceUrl);

    // triggerExtraction runs but pdf-extractor yields 0 rows (B02-TCTD parse fails)
    // → financial_reports header exists (inserted during fetch) but bctc_table_rows = 0
    // and bctc_md_tables = 0
    const reportId = "aaaaaaaa-0000-0000-0000-000000000001";
    seedFinancialReportHeader(testDb, "VCB", 2026, 1, reportId);
    // NO seedTableRows — 0 rows

    const bugMessages: string[] = [];
    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps({
        triggerExtraction: async (_params) => {
          // extraction ran but produced 0 table rows (already seeded above as header-only)
        },
      }),
      sendBugFn: async (msg) => { bugMessages.push(msg); },
    });

    // Queue must NOT be 'done'
    const row = getQueueRow(testDb, "VCB", 2026, "Q1");
    expect(row?.status).not.toBe("done");
    // Must be marked enrich_failed
    expect(row?.status).toBe("enrich_failed");
    // enrichFailed counter incremented
    expect(result.enrichFailed).toBe(1);
    // downloaded not counted (PDF was downloaded but enrich failed)
    expect(result.downloaded).toBe(0);
  });

  // ── AC-2: 0-row enrich emits LOUD signal (sendBugFn called) ────────────────

  it("AC-2: sendBugFn called with ticker + period + '0-rows' on 0-row enrich", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}CTG/20260101-CTG-BCTC.pdf`;
    insertQueueItem(testDb, "CTG", 2026, "Q1", sourceUrl);

    const reportId = "aaaaaaaa-0000-0000-0000-000000000002";
    seedFinancialReportHeader(testDb, "CTG", 2026, 1, reportId);
    // No rows seeded — 0 table rows

    const bugMessages: string[] = [];
    await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps(),
      sendBugFn: async (msg) => { bugMessages.push(msg); },
    });

    // Bug message must have been sent
    expect(bugMessages.length).toBeGreaterThan(0);
    const msg = bugMessages[0]!;
    // Must include ticker, period info, and "0-rows" identifier
    expect(msg).toContain("CTG");
    expect(msg).toContain("0-rows");
  });

  // ── AC-3: enrichFailed counter incremented ──────────────────────────────────

  it("AC-3: result.enrichFailed counts each 0-row item", async () => {
    // Two 0-row items
    for (const [ticker, id] of [
      ["VCB", "aaaaaaaa-0000-0000-0000-000000000003"],
      ["CTG", "aaaaaaaa-0000-0000-0000-000000000004"],
    ] as [string, string][]) {
      insertQueueItem(testDb, ticker, 2026, "Q1", `${VPS_BCTC_BASE_URL}${ticker}/vcb.pdf`);
      seedFinancialReportHeader(testDb, ticker, 2026, 1, id);
      // No table rows seeded
    }

    const bugMessages: string[] = [];
    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps(),
      sendBugFn: async (msg) => { bugMessages.push(msg); },
    });

    expect(result.enrichFailed).toBe(2);
    expect(bugMessages.length).toBe(2);
  });

  // ── AC-4: NON-REGRESSION — multi-row enrich still advances to 'done' ───────

  it("AC-4: happy path — multi-row enrich (FPT 145 rows) still advances to done", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}FPT/20260130-FPT-BCTC.pdf`;
    insertQueueItem(testDb, "FPT", 2026, "Q1", sourceUrl);

    const reportId = "aaaaaaaa-0000-0000-0000-000000000005";
    seedFinancialReportHeader(testDb, "FPT", 2026, 1, reportId);
    seedTableRows(testDb, reportId, 145); // 145 rows — known good case

    const bugMessages: string[] = [];
    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps({
        triggerExtraction: async (_params) => {
          // extraction produced 145 rows (already seeded)
        },
      }),
      sendBugFn: async (msg) => { bugMessages.push(msg); },
    });

    // Queue must be 'done' (happy path non-regression)
    const row = getQueueRow(testDb, "FPT", 2026, "Q1");
    expect(row?.status).toBe("done");
    expect(result.downloaded).toBe(1);
    expect(result.enrichFailed).toBe(0);
    expect(bugMessages.length).toBe(0); // no bug sent on success
  });

  // ── AC-4b: NON-REGRESSION — bctc_md_tables > 0 (with 0 table_rows) → done ─
  // Some extractors produce only md tables, no structured rows. That's still valid.

  it("AC-4b: if bctc_md_tables > 0 (and table_rows == 0), queue advances to done", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}VNM/20260130-VNM-BCTC.pdf`;
    insertQueueItem(testDb, "VNM", 2026, "Q1", sourceUrl);

    const reportId = "aaaaaaaa-0000-0000-0000-000000000006";
    seedFinancialReportHeader(testDb, "VNM", 2026, 1, reportId);
    // 0 table_rows but 3 md_tables → still has data
    seedMdTables(testDb, reportId, 3);

    const bugMessages: string[] = [];
    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps(),
      sendBugFn: async (msg) => { bugMessages.push(msg); },
    });

    const row = getQueueRow(testDb, "VNM", 2026, "Q1");
    expect(row?.status).toBe("done");
    expect(result.downloaded).toBe(1);
    expect(result.enrichFailed).toBe(0);
    expect(bugMessages.length).toBe(0);
  });

  // ── AC-5: sendBugFn throws → still marks enrich_failed ─────────────────────

  it("AC-5: sendBugFn throw must not prevent enrich_failed from being set", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}MBB/20260101-MBB-BCTC.pdf`;
    insertQueueItem(testDb, "MBB", 2026, "Q1", sourceUrl);

    const reportId = "aaaaaaaa-0000-0000-0000-000000000007";
    seedFinancialReportHeader(testDb, "MBB", 2026, 1, reportId);
    // 0 rows

    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps(),
      sendBugFn: async (_msg) => { throw new Error("Telegram unavailable"); },
    });

    // Even if Telegram throws, queue must be enrich_failed
    const row = getQueueRow(testDb, "MBB", 2026, "Q1");
    expect(row?.status).toBe("enrich_failed");
    expect(result.enrichFailed).toBe(1);
    expect(result.downloaded).toBe(0);
  });

  // ── AC-6: GENERIC — non-bank ticker with 0 rows also fails loud ─────────────

  it("AC-6: generic — non-bank ticker (D2D) with 0-row enrich also fails loud", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}D2D/20260101-D2D-BCTC.pdf`;
    insertQueueItem(testDb, "D2D", 2026, "Q1", sourceUrl);

    const reportId = "aaaaaaaa-0000-0000-0000-000000000008";
    seedFinancialReportHeader(testDb, "D2D", 2026, 1, reportId);
    // No rows

    const bugMessages: string[] = [];
    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps(),
      sendBugFn: async (msg) => { bugMessages.push(msg); },
    });

    const row = getQueueRow(testDb, "D2D", 2026, "Q1");
    expect(row?.status).toBe("enrich_failed");
    expect(result.enrichFailed).toBe(1);
    expect(bugMessages.length).toBeGreaterThan(0);
    expect(bugMessages[0]).toContain("D2D");
    expect(bugMessages[0]).toContain("0-rows");
  });

  // ── AC-7: No financial_reports header → extraction never ran → mark enrich_failed

  it("AC-7: if no financial_reports row for ticker+period after extraction, mark enrich_failed", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}HPG/20260101-HPG-BCTC.pdf`;
    insertQueueItem(testDb, "HPG", 2026, "Q1", sourceUrl);
    // No header seeded — extraction produced nothing at all

    const bugMessages: string[] = [];
    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps({
        triggerExtraction: async (_params) => {
          // Extraction ran but produced no DB rows at all
        },
      }),
      sendBugFn: async (msg) => { bugMessages.push(msg); },
    });

    const row = getQueueRow(testDb, "HPG", 2026, "Q1");
    expect(row?.status).toBe("enrich_failed");
    expect(result.enrichFailed).toBe(1);
    expect(bugMessages.length).toBeGreaterThan(0);
  });

  // ── AC-8: VCB 2025Q4 (112 rows) non-regression ──────────────────────────────

  it("AC-8: VCB 2025Q4 with 112 rows still advances to done (non-regression)", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}VCB/20260101-VCB-Q4-BCTC.pdf`;
    insertQueueItem(testDb, "VCB", 2025, "Q4", sourceUrl);

    const reportId = "aaaaaaaa-0000-0000-0000-000000000009";
    seedFinancialReportHeader(testDb, "VCB", 2025, 4, reportId);
    seedTableRows(testDb, reportId, 112);

    const bugMessages: string[] = [];
    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps(),
      sendBugFn: async (msg) => { bugMessages.push(msg); },
    });

    const row = getQueueRow(testDb, "VCB", 2025, "Q4");
    expect(row?.status).toBe("done");
    expect(result.downloaded).toBe(1);
    expect(result.enrichFailed).toBe(0);
    expect(bugMessages.length).toBe(0);
  });
});
