/**
 * FIX-BCTC-ENRICH-SILENT-0ROWS — SUPERSEDED by FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS
 * (2026-07-10). Rewritten, not deleted — see rationale below.
 *
 * ORIGINAL CONTRACT (now removed from bctcPdfPullJob.ts):
 *   AC-1: a 0-row enrich (bctc_table_rows == 0 AND bctc_md_tables == 0 right
 *         after triggerExtraction) MUST NOT mark the queue row 'done' —
 *         it stayed 'enrich_failed'.
 *   AC-2/AC-3/AC-5/AC-6: sendBugFn (LOUD Telegram signal) fired synchronously
 *         on a 0-row enrich; result.enrichFailed counted each occurrence;
 *         genericity across bank/non-bank tickers; sendBugFn-throw resilience.
 *   AC-4/AC-4b/AC-8: NON-REGRESSION — a multi-row enrich (or md_tables-only)
 *         still advanced the queue to 'done'.
 *   AC-7: no financial_reports header at all after extraction also produced
 *         'enrich_failed'.
 *
 * WHY THIS IS OBSOLETE (design: docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md §D3):
 *   The synchronous bctc_table_rows/bctc_md_tables count this suite tested
 *   was gating on the WRONG signal to begin with — /pek-extract (the only
 *   proven-functional table-extraction endpoint) is 202/fire-and-forget, so
 *   a row-count check taken immediately after firing it is structurally
 *   guaranteed to read 0 regardless of whether extraction will eventually
 *   succeed. FIX-BCTC-D3B removed the gate entirely: every row that reaches
 *   PDF-save now advances to the new intermediate status 'pek_triggered',
 *   with NO synchronous done/enrich_failed decision left in this job.
 *   `result.enrichFailed` and the `sendBugFn` option no longer exist on
 *   bctcPdfPullJob.ts's public interface (removed, not deprecated — nothing
 *   sets/reads them any more). The synchronous BUG-notification behaviour is
 *   preserved, but MOVED to the reconciliation job (bctcExtractReconcileJob.ts,
 *   FIX-BCTC-D3C-RECONCILE-JOB, not yet landed) — it fires only after a
 *   'pek_triggered' row exhausts MAX_RECONCILE_ATTEMPTS with a genuinely-empty
 *   bctc_layout_units, giving the async pipeline a fair chance first.
 *
 * WHAT THIS FILE NOW COVERS (explicit, not silent — per dev-mcp-server's
 * regression-test-update convention): the row-count value (0 rows, N rows,
 * or no header row at all) NO LONGER influences bctcPdfPullJob's queue-status
 * decision — ALL three scenarios below land on 'pek_triggered'. This is the
 * direct behavioural proof that the OLD gate is gone, not a placeholder.
 * D3C's own reconciliation-job test suite (to be authored alongside
 * bctcExtractReconcileJob.ts) is where the "0 rows → eventually enrich_failed"
 * /  "N rows → eventually done" contract now lives.
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

describe("FIX-BCTC-ENRICH-SILENT-0ROWS (superseded by FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS)", () => {
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

  // ── was AC-1/AC-2/AC-3/AC-5/AC-6: 0-row scenario ────────────────────────────
  // OLD: 0 bctc_table_rows AND 0 bctc_md_tables → 'enrich_failed' + BUG alert.
  // NEW: row-count is never inspected by this job any more → 'pek_triggered'.

  it("0-row scenario: queue lands on pek_triggered, NOT enrich_failed (gate removed)", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}VCB/20260101-VCB-BCTC.pdf`;
    insertQueueItem(testDb, "VCB", 2026, "Q1", sourceUrl);

    // Header exists (simulates the legacy scalar pipeline having run) but
    // NO bctc_table_rows / bctc_md_tables — the exact scenario the OLD gate
    // used to fail loud on.
    const reportId = "aaaaaaaa-0000-0000-0000-000000000001";
    seedFinancialReportHeader(testDb, "VCB", 2026, 1, reportId);

    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps({ triggerExtraction: async (_params) => { /* legacy pipeline ran, 0 table rows */ } }),
    });

    const row = getQueueRow(testDb, "VCB", 2026, "Q1");
    expect(row?.status).toBe("pek_triggered");
    expect(row?.status).not.toBe("enrich_failed");
    expect(result.downloaded).toBe(1);
  });

  // ── was AC-4/AC-4b/AC-8: multi-row (or md_tables-only) NON-REGRESSION ───────
  // OLD: proved the happy path still advanced to 'done'.
  // NEW: proves the SAME multi-row scenario lands on the SAME 'pek_triggered'
  //      status as the 0-row scenario above — the row-count branching that
  //      used to distinguish these two cases is gone entirely.

  it("multi-row scenario (145 rows pre-seeded): also lands on pek_triggered — row count no longer branches the outcome", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}FPT/20260130-FPT-BCTC.pdf`;
    insertQueueItem(testDb, "FPT", 2026, "Q1", sourceUrl);

    const reportId = "aaaaaaaa-0000-0000-0000-000000000005";
    seedFinancialReportHeader(testDb, "FPT", 2026, 1, reportId);
    seedTableRows(testDb, reportId, 145); // 145 rows — known good case (ex-AC-4)

    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps(),
    });

    const row = getQueueRow(testDb, "FPT", 2026, "Q1");
    expect(row?.status).toBe("pek_triggered");
    expect(result.downloaded).toBe(1);
  });

  // ── was AC-7: no financial_reports header at all after extraction ──────────
  // OLD: no header row (extraction produced nothing) → 'enrich_failed'.
  // NEW: irrelevant to bctcPdfPullJob's own status decision — Step 4b
  //      (ensureFinancialReportShellRow) unconditionally creates a shell row
  //      regardless of whether the LEGACY triggerExtraction dep produced a
  //      header of its own, so the queue still advances to 'pek_triggered'.

  it("no legacy-pipeline header produced: shell row (Step 4b) still exists and queue still lands on pek_triggered", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}HPG/20260101-HPG-BCTC.pdf`;
    insertQueueItem(testDb, "HPG", 2026, "Q1", sourceUrl);
    // No header seeded, no seedFinancialReportHeader call — legacy pipeline
    // (triggerExtraction, mocked as a no-op below) produces nothing of its own.

    const result = await runBctcPdfPullJob({
      db: testDb,
      deps: makeDeps({ triggerExtraction: async (_params) => { /* no-op: legacy pipeline silent */ } }),
    });

    const shellRow = testDb
      .prepare(`SELECT id, pdf_path FROM financial_reports WHERE action_code = ? AND sort_key = ?`)
      .get("HPG", "2026-Q1") as { id: string; pdf_path: string | null } | null;
    expect(shellRow).not.toBeNull(); // Step 4b's shell row, independent of the legacy pipeline
    expect(shellRow!.pdf_path).not.toBeNull();

    const row = getQueueRow(testDb, "HPG", 2026, "Q1");
    expect(row?.status).toBe("pek_triggered");
    expect(result.downloaded).toBe(1);
  });
});
