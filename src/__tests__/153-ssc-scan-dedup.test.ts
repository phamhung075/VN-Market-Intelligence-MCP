/**
 * Task 153 — SSC Scan Deduplication
 *
 * Tests the `ssc_doc_id`-based deduplication guard:
 *   1. New `ssc_doc_id` column exists on `financial_reports` after migration.
 *   2. `isDocAlreadyProcessed` returns false when doc is unknown.
 *   3. `isDocAlreadyProcessed` returns true after a row with that ssc_doc_id is inserted.
 *   4. `checkSscReports` skips docs whose ssc_doc_id is already processed.
 *   5. `checkSscReports` processes docs whose ssc_doc_id is NOT yet seen.
 *   6. Second scan of same docs completes in < 100 ms (single index lookup).
 *   7. `isDocAlreadyProcessed` is injectable via CheckSscReportsOptions.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// DB setup — in-memory SQLite for isolation
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  process.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function seedReport(db: Database, id: string, docId: string): void {
  db.prepare(`
    INSERT OR REPLACE INTO financial_reports
      (id, action_code, company_name, exchange, domain,
       period_year, period_type, period_start, period_end, sort_key,
       ssc_doc_id, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
    VALUES (?, 'VCB', 'Vietcombank', 'HOSE', 'banking',
            2025, 'Q1', '2025-01-01', '2025-03-31', ?,
            ?, datetime('now'),
            '{}', '{}', '{}', '{}')
  `).run(id, `2025-Q1-${id}`, docId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 153 — SSC scan deduplication", () => {

  // ── 1. ssc_doc_id column exists on financial_reports ─────────────────────
  it("financial_reports table has ssc_doc_id column after initDatabase", () => {
    const db = getDb();
    // PRAGMA table_info returns one row per column; check ssc_doc_id is present
    const cols = db
      .prepare("PRAGMA table_info(financial_reports)")
      .all() as Array<{ name: string }>;

    const names = cols.map((c) => c.name);
    expect(names).toContain("ssc_doc_id");
  });

  // ── 2. isDocAlreadyProcessed returns false for unknown docId ─────────────
  it("isDocAlreadyProcessed returns false when docId is not in financial_reports", async () => {
    const { isDocAlreadyProcessed } = await import(
      "../infrastructure/db/alertStore.js"
    );
    const db = getDb();
    const result = isDocAlreadyProcessed("non-existent-doc-id", db);
    expect(result).toBe(false);
  });

  // ── 3. isDocAlreadyProcessed returns true after seeding the docId ─────────
  it("isDocAlreadyProcessed returns true when ssc_doc_id is present in financial_reports", async () => {
    const { isDocAlreadyProcessed } = await import(
      "../infrastructure/db/alertStore.js"
    );
    const db = getDb();

    const docId = "vcb-q1-2025-bctc.pdf";
    seedReport(db, "fr-dedup-153-1", docId);

    const result = isDocAlreadyProcessed(docId, db);
    expect(result).toBe(true);
  });

  // ── 4. checkSscReports skips docs already seen via ssc_doc_id guard ───────
  it("skips pipeline when isDocProcessedFn returns true", async () => {
    const { checkSscReports } = await import(
      "../application/usecases/checkSscReports.js"
    );

    const pipelineCalls: string[] = [];

    const knownDocId = "vcb-q2-2025.pdf";

    const result = await checkSscReports({
      getWatchlistFn: async () => [{ code: "VCB", alertReportNew: true }],
      listDocsFn: async () => [
        {
          title: "BCTC Q2 VCB",
          url: `https://ssc.gov.vn/${knownDocId}`,
          publishedAt: "15/07/2025",
          reportType: "quarterly" as const,
        },
      ],
      isDocProcessedFn: (_docId: string) => true,   // already processed
      pipelineFn: async (params) => {
        pipelineCalls.push(params.pdfUrl);
        return null;
      },
      storeAlertsFn: () => {},
    });

    expect(result.newReports).toBe(0);
    expect(pipelineCalls.length).toBe(0);
  });

  // ── 5. checkSscReports calls pipeline when docId is new ───────────────────
  it("calls pipeline when isDocProcessedFn returns false (doc is new)", async () => {
    const { checkSscReports } = await import(
      "../application/usecases/checkSscReports.js"
    );

    const pipelineCalls: string[] = [];

    const result = await checkSscReports({
      getWatchlistFn: async () => [{ code: "FPT", alertReportNew: false }],
      listDocsFn: async () => [
        {
          title: "BCTC Q1 FPT",
          url: "https://ssc.gov.vn/fpt-q1-2025.pdf",
          publishedAt: "10/04/2025",
          reportType: "quarterly" as const,
        },
      ],
      isDocProcessedFn: (_docId: string) => false,  // not yet seen
      pipelineFn: async (params) => {
        pipelineCalls.push(params.pdfUrl);
        return null;
      },
      storeAlertsFn: () => {},
    });

    expect(result.newReports).toBe(1);
    expect(pipelineCalls.length).toBe(1);
    expect(pipelineCalls[0]).toBe("https://ssc.gov.vn/fpt-q1-2025.pdf");
  });

  // ── 6. Second scan of 51 already-seen docs completes in < 100 ms ──────────
  it("second scan of 51 already-processed docs completes in < 100 ms", async () => {
    const { isDocAlreadyProcessed } = await import(
      "../infrastructure/db/alertStore.js"
    );
    const db = getDb();

    // Seed 51 documents into the DB
    for (let i = 0; i < 51; i++) {
      const docId = `doc-153-perf-${i}.pdf`;
      const id = `fr-perf-${i}`;
      db.prepare(`
        INSERT OR REPLACE INTO financial_reports
          (id, action_code, company_name, exchange, domain,
           period_year, period_type, period_start, period_end, sort_key,
           ssc_doc_id, parsed_at,
           balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
        VALUES (?, 'VCB', 'Vietcombank', 'HOSE', 'banking',
                2025, 'Q1', '2025-01-01', '2025-03-31', ?,
                ?, datetime('now'),
                '{}', '{}', '{}', '{}')
      `).run(id, `2025-Q1-perf-${i}`, docId);
    }

    const start = performance.now();
    for (let i = 0; i < 51; i++) {
      const seen = isDocAlreadyProcessed(`doc-153-perf-${i}.pdf`, db);
      expect(seen).toBe(true);
    }
    const elapsed = performance.now() - start;

    // 51 index lookups must complete well under 100 ms
    expect(elapsed).toBeLessThan(100);
  });

  // ── 7. isDocProcessedFn is injectable (override in CheckSscReportsOptions) ─
  it("isDocProcessedFn override controls skip/process behaviour independently", async () => {
    const { checkSscReports } = await import(
      "../application/usecases/checkSscReports.js"
    );

    const processed: string[] = [];
    const skipped: string[] = [];

    const docs = [
      { title: "A", url: "https://ssc.gov.vn/vcb-a.pdf", publishedAt: "01/01/2025", reportType: "quarterly" as const },
      { title: "B", url: "https://ssc.gov.vn/vcb-b.pdf", publishedAt: "01/02/2025", reportType: "quarterly" as const },
    ];

    // docId for "A" is already processed; "B" is new
    const processedIds = new Set(["https://ssc.gov.vn/vcb-a.pdf"]);

    await checkSscReports({
      getWatchlistFn: async () => [{ code: "VCB", alertReportNew: false }],
      listDocsFn: async () => docs,
      isDocProcessedFn: (docId: string) => processedIds.has(docId),
      pipelineFn: async (params) => {
        processed.push(params.pdfUrl);
        return null;
      },
      storeAlertsFn: () => {},
    });

    expect(processed).toContain("https://ssc.gov.vn/vcb-b.pdf");
    expect(processed).not.toContain("https://ssc.gov.vn/vcb-a.pdf");
  });
});
