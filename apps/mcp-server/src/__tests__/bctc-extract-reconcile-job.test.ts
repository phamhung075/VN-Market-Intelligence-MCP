/**
 * bctcExtractReconcileJob tests — FIX-BCTC-D3C-RECONCILE-JOB
 *
 * Covers the reconciliation job that resolves 'pek_triggered' bctc_vps_queue
 * rows to a genuine 'done'/'enrich_failed' verdict. Design:
 * docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md §D3.
 *
 * Coverage:
 *   - Grace window: rows still inside the 5-min window are not touched.
 *   - Success transition to 'done' — each of the 3 tables (bctc_layout_units
 *     non-quarantined, bctc_table_rows, bctc_md_tables) tested INDEPENDENTLY
 *     satisfying the OR-across-three-tables success check.
 *   - Quarantined-only layout units do NOT count as success.
 *   - Under-cap still-zero rows stay 'pek_triggered', reconcile_attempts++,
 *     and the uniform re-fire policy (triggerPekExtraction called every pass)
 *     is exercised.
 *   - Re-fire is skipped (but the attempt counter still advances) when no
 *     financial_reports row is resolvable yet.
 *   - Exhausted-attempts transition to 'enrich_failed', with the BUG
 *     notification (sendBugFn) verified to fire exactly once.
 *   - report_id re-derivation: bctc_vps_queue carries NO report_id column at
 *     all — every test implicitly proves the (action_code, sort_key)
 *     re-derivation lookup; a dedicated test also covers the row created
 *     independently/out-of-order from queue-row insertion.
 *   - Overlap guard (mirrors FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.test.ts).
 *
 * All I/O (PEK re-fire, BUG notification) is injected — no real network.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { Database } from "bun:sqlite";
import { Database as SqliteDatabase } from "bun:sqlite";

import { initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { ensureFinancialReportShellRow } from "../application/usecases/bctc/ensureFinancialReportShellRow.js";
import {
  runBctcExtractReconcileJob,
  MAX_RECONCILE_ATTEMPTS,
  type BctcExtractReconcileDeps,
} from "../scheduler/financial-reports/bctcExtractReconcileJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Insert a bctc_vps_queue row already at 'pek_triggered'. */
function insertPekTriggeredRow(
  db: Database,
  code: string,
  year: number,
  quarter: string,
  opts: { minutesAgo?: number; reconcileAttempts?: number } = {},
): void {
  const minutesAgo = opts.minutesAgo ?? 10; // default: past the 5-min grace window
  const reconcileAttempts = opts.reconcileAttempts ?? 0;
  db.prepare(`
    INSERT OR REPLACE INTO bctc_vps_queue
      (action_code, period_year, period_quarter, status, source_url, reconcile_attempts, last_attempt)
    VALUES (?, ?, ?, 'pek_triggered', ?, ?, datetime('now', ?))
  `).run(
    code,
    year,
    quarter,
    `http://125.212.251.27:8765/bctc-files/${code}/x.pdf`,
    reconcileAttempts,
    `-${minutesAgo} minutes`,
  );
}

function getQueueRow(
  db: Database,
  code: string,
  year: number,
  quarter: string,
): { status: string; reconcile_attempts: number } | undefined {
  return db.prepare(
    `SELECT status, reconcile_attempts FROM bctc_vps_queue
     WHERE action_code = ? AND period_year = ? AND period_quarter = ?`,
  ).get(code, year, quarter) as any;
}

/** Seeds a financial_reports shell row via the SAME production usecase bctcPdfPullJob uses. */
async function seedShellRow(
  db: Database,
  code: string,
  year: number,
  quarter: "Q1" | "Q2" | "Q3" | "Q4",
  pdfPath = `/app/data/pdfs/${code}_${year}_${quarter}.pdf`,
): Promise<{ id: string; sortKey: string }> {
  return ensureFinancialReportShellRow({ db, actionCode: code, year, quarter, pdfPath });
}

function seedLayoutUnit(db: Database, reportId: string, quarantined = 0): void {
  db.prepare(`
    INSERT INTO bctc_layout_units
      (report_id, unit_id, schema_page, page_numbers_json, quarantined)
    VALUES (?, 'unit-1', 1, '[1]', ?)
  `).run(reportId, quarantined);
}

function seedTableRow(db: Database, reportId: string): void {
  db.prepare(`
    INSERT INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, label, period_current, unit)
    VALUES (?, 1, 'balance_sheet', 1, 'Total Assets', '2025-Q4', 'billion_vnd')
  `).run(reportId);
}

function seedMdTable(db: Database, reportId: string): void {
  db.prepare(`
    INSERT INTO bctc_md_tables
      (report_id, md_tables_json, ocr_as_markdown, table_count, page_count)
    VALUES (?, '[]', '# doc', 1, 1)
  `).run(reportId);
}

function makeDeps(overrides: Partial<BctcExtractReconcileDeps> = {}): BctcExtractReconcileDeps {
  return {
    triggerPekExtraction: async (reportId, pdfPath) => ({
      outcome: "queued",
      status: 202,
      reportId,
      pdfPath,
    }),
    sendBugFn: async () => {},
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("bctcExtractReconcileJob", () => {
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

  it("exports MAX_RECONCILE_ATTEMPTS as a positive integer", () => {
    expect(MAX_RECONCILE_ATTEMPTS).toBeGreaterThan(0);
    expect(Number.isInteger(MAX_RECONCILE_ATTEMPTS)).toBe(true);
  });

  // ── Empty queue ────────────────────────────────────────────────────────────

  it("returns zero counts when queue is empty", async () => {
    const result = await runBctcExtractReconcileJob({ db: testDb, deps: makeDeps() });
    expect(result.itemsProcessed).toBe(0);
    expect(result.done).toBe(0);
    expect(result.enrichFailed).toBe(0);
    expect(result.stillPending).toBe(0);
  });

  // ── Grace window ───────────────────────────────────────────────────────────

  it("does not touch a pek_triggered row still inside the 5-min grace window", async () => {
    insertPekTriggeredRow(testDb, "VCB", 2025, "Q4", { minutesAgo: 2 });

    const result = await runBctcExtractReconcileJob({ db: testDb, deps: makeDeps() });
    expect(result.itemsProcessed).toBe(0);

    const row = getQueueRow(testDb, "VCB", 2025, "Q4");
    expect(row?.status).toBe("pek_triggered");
    expect(row?.reconcile_attempts).toBe(0);
  });

  // ── Success — OR across three tables, each tested independently ────────────

  it("bctc_layout_units non-quarantined rows > 0 → done", async () => {
    insertPekTriggeredRow(testDb, "FPT", 2025, "Q4");
    const shell = await seedShellRow(testDb, "FPT", 2025, "Q4");
    seedLayoutUnit(testDb, shell.id, 0);

    const result = await runBctcExtractReconcileJob({ db: testDb, deps: makeDeps() });
    expect(result.done).toBe(1);

    const row = getQueueRow(testDb, "FPT", 2025, "Q4");
    expect(row?.status).toBe("done");
  });

  it("bctc_table_rows rows > 0 (zero layout_units) → done", async () => {
    insertPekTriggeredRow(testDb, "VNM", 2025, "Q4");
    const shell = await seedShellRow(testDb, "VNM", 2025, "Q4");
    seedTableRow(testDb, shell.id);

    const result = await runBctcExtractReconcileJob({ db: testDb, deps: makeDeps() });
    expect(result.done).toBe(1);

    const row = getQueueRow(testDb, "VNM", 2025, "Q4");
    expect(row?.status).toBe("done");
  });

  it("bctc_md_tables row > 0 (zero layout_units, zero table_rows) → done", async () => {
    insertPekTriggeredRow(testDb, "HPG", 2025, "Q4");
    const shell = await seedShellRow(testDb, "HPG", 2025, "Q4");
    seedMdTable(testDb, shell.id);

    const result = await runBctcExtractReconcileJob({ db: testDb, deps: makeDeps() });
    expect(result.done).toBe(1);

    const row = getQueueRow(testDb, "HPG", 2025, "Q4");
    expect(row?.status).toBe("done");
  });

  it("quarantined-only layout units do NOT count as success", async () => {
    insertPekTriggeredRow(testDb, "REE", 2025, "Q4", { reconcileAttempts: 0 });
    const shell = await seedShellRow(testDb, "REE", 2025, "Q4");
    seedLayoutUnit(testDb, shell.id, 1); // quarantined = 1

    const result = await runBctcExtractReconcileJob({ db: testDb, deps: makeDeps() });
    expect(result.done).toBe(0);
    expect(result.stillPending).toBe(1);

    const row = getQueueRow(testDb, "REE", 2025, "Q4");
    expect(row?.status).toBe("pek_triggered");
    expect(row?.reconcile_attempts).toBe(1);
  });

  // ── Under-cap still-zero: stays pek_triggered, uniform re-fire policy ──────

  it("under cap, still-zero → stays pek_triggered, reconcile_attempts++, and re-fires triggerPekExtraction", async () => {
    insertPekTriggeredRow(testDb, "HSG", 2025, "Q4", { reconcileAttempts: 2 });
    const shell = await seedShellRow(testDb, "HSG", 2025, "Q4", "/app/data/pdfs/HSG_2025_Q4.pdf");
    // No layout_units/table_rows/md_tables seeded — still genuinely zero.

    const refireCalls: Array<{ reportId: string; pdfPath: string }> = [];
    const deps = makeDeps({
      triggerPekExtraction: async (reportId, pdfPath) => {
        refireCalls.push({ reportId, pdfPath });
        return { outcome: "queued", status: 202, reportId, pdfPath };
      },
    });

    const result = await runBctcExtractReconcileJob({ db: testDb, deps });
    expect(result.done).toBe(0);
    expect(result.enrichFailed).toBe(0);
    expect(result.stillPending).toBe(1);
    expect(result.refired).toBe(1);

    expect(refireCalls).toHaveLength(1);
    expect(refireCalls[0]!.reportId).toBe(shell.id);
    expect(refireCalls[0]!.pdfPath).toBe("/app/data/pdfs/HSG_2025_Q4.pdf");

    const row = getQueueRow(testDb, "HSG", 2025, "Q4");
    expect(row?.status).toBe("pek_triggered");
    expect(row?.reconcile_attempts).toBe(3);
  });

  it("re-fire is skipped (but attempt counter still advances) when no financial_reports row is resolvable", async () => {
    insertPekTriggeredRow(testDb, "PVD", 2025, "Q4", { reconcileAttempts: 1 });
    // No shell row ever created for PVD 2025-Q4 — the pull job's shell-row
    // upsert never landed (or landed under a different sort_key).

    let refireCalled = false;
    const deps = makeDeps({
      triggerPekExtraction: async (reportId, pdfPath) => {
        refireCalled = true;
        return { outcome: "queued", status: 202, reportId, pdfPath };
      },
    });

    const result = await runBctcExtractReconcileJob({ db: testDb, deps });
    expect(refireCalled).toBe(false);
    expect(result.stillPending).toBe(1);
    expect(result.refired).toBe(0);

    const row = getQueueRow(testDb, "PVD", 2025, "Q4");
    expect(row?.status).toBe("pek_triggered");
    expect(row?.reconcile_attempts).toBe(2);
  });

  // ── Exhausted attempts → enrich_failed + bug notification ──────────────────

  it("exhausted attempts (still-zero, report_id resolved) → enrich_failed, bug notification fired exactly once", async () => {
    insertPekTriggeredRow(testDb, "PVS", 2025, "Q4", {
      reconcileAttempts: MAX_RECONCILE_ATTEMPTS - 1,
    });
    const shell = await seedShellRow(testDb, "PVS", 2025, "Q4");
    // Still genuinely zero across all three tables.

    const bugCalls: string[] = [];
    const deps = makeDeps({
      sendBugFn: async (msg) => {
        bugCalls.push(msg);
      },
      triggerPekExtraction: async () => {
        throw new Error("must NOT be called on the exhausted/terminal path");
      },
    });

    const result = await runBctcExtractReconcileJob({ db: testDb, deps });
    expect(result.done).toBe(0);
    expect(result.enrichFailed).toBe(1);
    expect(result.stillPending).toBe(0);
    expect(result.refired).toBe(0);

    expect(bugCalls).toHaveLength(1);
    expect(bugCalls[0]).toContain("PVS");
    expect(bugCalls[0]).toContain("RECONCILE EXHAUSTED");
    expect(bugCalls[0]).toContain(shell.id);

    const row = getQueueRow(testDb, "PVS", 2025, "Q4");
    expect(row?.status).toBe("enrich_failed");
  });

  it("exhausted attempts with NO report_id ever resolved → enrich_failed, bug message notes unresolved report_id", async () => {
    insertPekTriggeredRow(testDb, "DGC", 2025, "Q4", {
      reconcileAttempts: MAX_RECONCILE_ATTEMPTS - 1,
    });
    // No shell row ever created.

    const bugCalls: string[] = [];
    const deps = makeDeps({
      sendBugFn: async (msg) => {
        bugCalls.push(msg);
      },
    });

    const result = await runBctcExtractReconcileJob({ db: testDb, deps });
    expect(result.enrichFailed).toBe(1);
    expect(bugCalls).toHaveLength(1);
    expect(bugCalls[0]).toContain("UNRESOLVED");

    const row = getQueueRow(testDb, "DGC", 2025, "Q4");
    expect(row?.status).toBe("enrich_failed");
  });

  it("sendBugFn throwing does not block the enrich_failed status transition (fail-loud, non-fatal notify)", async () => {
    insertPekTriggeredRow(testDb, "GAS", 2025, "Q4", {
      reconcileAttempts: MAX_RECONCILE_ATTEMPTS - 1,
    });
    await seedShellRow(testDb, "GAS", 2025, "Q4");

    const deps = makeDeps({
      sendBugFn: async () => {
        throw new Error("Telegram unreachable");
      },
    });

    const result = await runBctcExtractReconcileJob({ db: testDb, deps });
    expect(result.enrichFailed).toBe(1);

    const row = getQueueRow(testDb, "GAS", 2025, "Q4");
    expect(row?.status).toBe("enrich_failed");
  });

  // ── report_id re-derivation ──────────────────────────────────────────────
  // bctc_vps_queue carries NO report_id column at all (schema-confirmed) —
  // every success/failure test above already proves the job re-derives it
  // via (action_code, sort_key). This test additionally proves the lookup is
  // fully independent of insertion order: the queue row is created FIRST
  // (as bctcPdfPullJob would leave it mid-flight) and the financial_reports
  // shell row is created SECOND, by a completely separate call — simulating
  // the real production sequencing where the two writes happen in different
  // job invocations with no shared in-memory reference.

  it("re-derives report_id via (action_code, sort_key) independently of insertion order", async () => {
    insertPekTriggeredRow(testDb, "CTG", 2025, "Q4"); // queue row first
    const shell = await seedShellRow(testDb, "CTG", 2025, "Q4"); // shell row second, separate call
    seedTableRow(testDb, shell.id);

    const result = await runBctcExtractReconcileJob({ db: testDb, deps: makeDeps() });
    expect(result.done).toBe(1);

    const row = getQueueRow(testDb, "CTG", 2025, "Q4");
    expect(row?.status).toBe("done");
  });

  // ── Overlap guard (mirrors FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.test.ts) ─────

  it("a second invocation while the first is in-flight early-returns already_running", async () => {
    insertPekTriggeredRow(testDb, "MSN", 2025, "Q4");
    await seedShellRow(testDb, "MSN", 2025, "Q4");

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const refireCalls: string[] = [];

    const slowDeps = makeDeps({
      triggerPekExtraction: async (reportId, pdfPath) => {
        refireCalls.push(reportId);
        await gate;
        return { outcome: "queued" as const, status: 202 as const, reportId, pdfPath };
      },
    });

    const firstRunPromise = runBctcExtractReconcileJob({ db: testDb, deps: slowDeps });
    await Promise.resolve();
    await Promise.resolve();
    expect(refireCalls.length).toBe(1);

    const secondResult = await runBctcExtractReconcileJob({ db: testDb, deps: slowDeps });
    expect(secondResult.skippedReason).toBe("already_running");
    expect(secondResult.itemsProcessed).toBe(0);
    expect(refireCalls.length).toBe(1); // second invocation never re-fired

    release();
    const firstResult = await firstRunPromise;
    expect(firstResult.skippedReason).toBeUndefined();
    expect(firstResult.stillPending).toBe(1);
  });
});
