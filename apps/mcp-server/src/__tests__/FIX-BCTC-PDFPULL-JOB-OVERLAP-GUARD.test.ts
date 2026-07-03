/**
 * FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD
 *
 * Root cause (docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md):
 * bctcPdfPullJob had NO module-level re-entrancy guard between its 30-min
 * cron invocations. A full batch can legitimately take ~65-70 min (observed 05:30
 * run = 69.9 min), and because a queue row stays 'pending' until its own
 * processing chain finishes, overlapping invocations re-SELECT and
 * redundantly re-process the SAME rows (HCM PDF re-saved 4x, NKG 3x in <1
 * min in live logs), saturating pdf-extractor and starving net throughput.
 *
 * Fix: module-level `_isRunning` guard mirroring the EXISTING in-repo pattern
 * (runBreadthHistoryPersisterJob / weatherCheckJob) — early-return
 * `{ skippedReason: 'already_running' }` on re-entry, `finally` always clears
 * the flag so a thrown error can never wedge the guard permanently.
 *
 * This file covers exactly the 3 DoD assertions:
 *   (a) a second concurrent invocation while the first is in-flight
 *       early-returns already_running and does NOT re-process (no fetch
 *       issued, no queue-row mutation).
 *   (b) the guard resets after completion so the next tick runs normally.
 *   (c) the guard resets even if the body throws.
 *
 * All I/O is injected — no real network, no real file system.
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
// Helpers (scoped to this test file — mirror bctc-pdf-pull-job.test.ts)
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
): { status: string; attempts: number } | undefined {
  return db.prepare(
    `SELECT status, attempts FROM bctc_vps_queue
     WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
  ).get(code, year, quarter) as any;
}

/** Seeds a minimal financial_reports + bctc_table_rows so the 0-row gate passes. */
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

function mockOkResponse(bytes: number): Response {
  return new Response(new Uint8Array(bytes).fill(0x25).buffer as ArrayBuffer, { status: 200 });
}

function makeDeps(overrides: Partial<BctcPdfPullDeps> = {}): BctcPdfPullDeps {
  return {
    fetchPdf: async () => mockOkResponse(MIN_PDF_BYTES + 1_000),
    savePdf: async () => {},
    triggerExtraction: async () => {},
    ...overrides,
  };
}

/** A controllable gate: fetchPdf blocks on `promise` until `release()` is called. */
function createGate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD", () => {
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

  // ── (a) second concurrent invocation early-returns and does NOT re-process ──

  it("(a) a second invocation while the first is in-flight early-returns already_running and does not re-process", async () => {
    const sourceUrl = `${VPS_BCTC_BASE_URL}VCB/vcb.pdf`;
    insertQueueItem(testDb, "VCB", 2025, "Q4", sourceUrl);
    seedExtractionResult(testDb, "VCB", 2025, "Q4");

    const gate = createGate();
    const fetchCalls: string[] = [];

    // Shared deps used by BOTH invocations — if the second invocation ever
    // reached deps.fetchPdf, fetchCalls.length would grow past 1.
    const slowDeps: BctcPdfPullDeps = {
      fetchPdf: async (url) => {
        fetchCalls.push(url);
        await gate.promise;
        return mockOkResponse(MIN_PDF_BYTES + 1_000);
      },
      savePdf: async () => {},
      triggerExtraction: async () => {},
    };

    // Kick off the first invocation but do NOT await it yet. The async
    // function body runs synchronously (DB query is sync in bun:sqlite)
    // right up to the `await deps.fetchPdf(...)` call, so by the time this
    // line returns control, the row has already been read and fetchPdf is
    // blocked on the gate — i.e. genuinely "in-flight".
    const firstRunPromise = runBctcPdfPullJob({ db: testDb, deps: slowDeps });

    // Let any pending microtasks flush (defensive — not strictly required
    // given the synchronous-until-first-await guarantee above).
    await Promise.resolve();
    expect(fetchCalls.length).toBe(1);

    // Second concurrent invocation — must early-return immediately without
    // ever issuing its own DB query or calling deps.fetchPdf.
    const secondResult = await runBctcPdfPullJob({ db: testDb, deps: slowDeps });

    expect(secondResult.skippedReason).toBe("already_running");
    expect(secondResult.itemsProcessed).toBe(0);
    expect(secondResult.downloaded).toBe(0);
    expect(secondResult.failed).toBe(0);
    expect(secondResult.deferred).toBe(0);
    expect(secondResult.enrichFailed).toBe(0);

    // Proof of "does NOT re-process": fetchPdf was never called a 2nd time...
    expect(fetchCalls.length).toBe(1);
    // ...and the queue row itself was never touched by the second invocation.
    const rowMidFlight = getQueueRow(testDb, "VCB", 2025, "Q4");
    expect(rowMidFlight?.status).toBe("pending");
    expect(rowMidFlight?.attempts).toBe(0);

    // Release the gate so the first invocation can complete cleanly.
    gate.release();
    const firstResult = await firstRunPromise;
    expect(firstResult.skippedReason).toBeUndefined();
    expect(firstResult.downloaded).toBe(1);

    const rowAfter = getQueueRow(testDb, "VCB", 2025, "Q4");
    expect(rowAfter?.status).toBe("done");
  });

  // ── (b) guard resets after completion — next tick runs normally ─────────────

  it("(b) the guard resets after completion so the next invocation runs normally", async () => {
    insertQueueItem(testDb, "FPT", 2025, "Q4", `${VPS_BCTC_BASE_URL}FPT/fpt.pdf`);
    seedExtractionResult(testDb, "FPT", 2025, "Q4");

    const firstResult = await runBctcPdfPullJob({ db: testDb, deps: makeDeps() });
    expect(firstResult.skippedReason).toBeUndefined();
    expect(firstResult.downloaded).toBe(1);

    // A brand-new item for the second run — proves the guard was cleared and
    // the job performed a real (non-skipped) pass.
    insertQueueItem(testDb, "HPG", 2025, "Q4", `${VPS_BCTC_BASE_URL}HPG/hpg.pdf`);
    seedExtractionResult(testDb, "HPG", 2025, "Q4");

    const secondResult = await runBctcPdfPullJob({ db: testDb, deps: makeDeps() });
    expect(secondResult.skippedReason).toBeUndefined();
    expect(secondResult.itemsProcessed).toBe(1);
    expect(secondResult.downloaded).toBe(1);

    const row = getQueueRow(testDb, "HPG", 2025, "Q4");
    expect(row?.status).toBe("done");
  });

  // ── (c) guard resets even if the body throws ────────────────────────────────

  it("(c) the guard resets even if the job body throws", async () => {
    insertQueueItem(testDb, "ACB", 2025, "Q4", `${VPS_BCTC_BASE_URL}ACB/acb.pdf`);

    // A db wrapper whose query() delegates to the real testDb (so the
    // pending row is genuinely found) but whose prepare() always throws —
    // this forces runBctcPdfPullJob to throw partway through (at the
    // updateDone/updateAttempt prepare() calls), never reaching its own
    // `return result;`.
    const throwingDb = {
      query: testDb.query.bind(testDb),
      prepare: () => {
        throw new Error("simulated prepare() failure");
      },
    } as unknown as Database;

    let threw = false;
    try {
      await runBctcPdfPullJob({ db: throwingDb, deps: makeDeps() });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);

    // The throwing invocation never wrote anything (prepare threw before any
    // execution), so the row is untouched — confirm the real DB is still
    // usable and the guard is clear for a normal follow-up invocation.
    const rowAfterThrow = getQueueRow(testDb, "ACB", 2025, "Q4");
    expect(rowAfterThrow?.status).toBe("pending");

    seedExtractionResult(testDb, "ACB", 2025, "Q4");
    const followUpResult = await runBctcPdfPullJob({ db: testDb, deps: makeDeps() });

    expect(followUpResult.skippedReason).toBeUndefined();
    expect(followUpResult.itemsProcessed).toBe(1);
    expect(followUpResult.downloaded).toBe(1);

    const rowAfter = getQueueRow(testDb, "ACB", 2025, "Q4");
    expect(rowAfter?.status).toBe("done");
  });
});
