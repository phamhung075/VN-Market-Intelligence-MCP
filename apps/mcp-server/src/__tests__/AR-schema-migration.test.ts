// apps/mcp-server/src/__tests__/AR-schema-migration.test.ts
// Sprint BCTC-AGENTIC-REFINE — Schema Migration Tests (FR-9)
//
// Tests:
//   - bctc_refined_units table exists after migration
//   - text_status column exists on financial_reports after migration
//   - refine_status column exists on financial_reports after migration
//   - Second migration run → no error (idempotent)
//   - UNIQUE(report_id, unit_id) constraint verified
//   - window_status column exists per §0.6.5

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeInMemoryDb(): Database {
  return new Database(":memory:");
}

function getColumnNames(db: Database, table: string): string[] {
  const cols = db
    .query<{ name: string }, []>(`PRAGMA table_info(${table})`)
    .all();
  return cols.map((c) => c.name);
}

function tableExists(db: Database, table: string): boolean {
  const row = db
    .query<{ count: number }, [string]>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?",
    )
    .get(table);
  return (row?.count ?? 0) > 0;
}

function indexExists(db: Database, indexName: string): boolean {
  const row = db
    .query<{ count: number }, [string]>(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='index' AND name=?",
    )
    .get(indexName);
  return (row?.count ?? 0) > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("AR-schema-migration: bctc_refined_units table", () => {
  let db: Database;

  beforeEach(() => {
    db = makeInMemoryDb();
    initFinancialReportsTables(db);
  });

  it("bctc_refined_units table exists after migration", () => {
    expect(tableExists(db, "bctc_refined_units")).toBe(true);
  });

  it("bctc_refined_units has expected columns", () => {
    const cols = getColumnNames(db, "bctc_refined_units");
    expect(cols).toContain("id");
    expect(cols).toContain("report_id");
    expect(cols).toContain("unit_id");
    expect(cols).toContain("page_numbers_json");
    expect(cols).toContain("markdown");
    expect(cols).toContain("row_count");
    expect(cols).toContain("confidence");
    expect(cols).toContain("flags");
    expect(cols).toContain("window_status"); // §0.6.5 requirement
    expect(cols).toContain("refined_at");
  });

  it("idx_bru_report index exists on bctc_refined_units", () => {
    expect(indexExists(db, "idx_bru_report")).toBe(true);
  });

  it("UNIQUE(report_id, unit_id) constraint enforced", () => {
    // Insert first row
    db.prepare(
      `INSERT INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("FPT", "unit-0001", "[1]", "# markdown", 0, 0.8, "DONE");

    // Try to insert duplicate — must fail
    expect(() => {
      db.prepare(
        `INSERT INTO bctc_refined_units
           (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run("FPT", "unit-0001", "[1]", "# different", 0, 0.5, "DONE");
    }).toThrow();
  });

  it("DELETE-then-INSERT idempotency: second write replaces first without duplication", () => {
    // First insert
    db.prepare(
      `INSERT INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("FPT", "unit-0001", "[1]", "# v1", 0, 0.8, "DONE");

    // DELETE-then-INSERT (idempotency pattern)
    db.transaction(() => {
      db.prepare("DELETE FROM bctc_refined_units WHERE report_id=?").run("FPT");
      db.prepare(
        `INSERT INTO bctc_refined_units
           (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run("FPT", "unit-0001", "[1]", "# v2", 0, 0.9, "DONE");
    })();

    const count = db
      .query<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_refined_units WHERE report_id=?",
      )
      .get("FPT");
    expect(count?.cnt).toBe(1);

    // Verify content is the new version
    const row = db
      .query<{ markdown: string; confidence: number }, [string]>(
        "SELECT markdown, confidence FROM bctc_refined_units WHERE report_id=?",
      )
      .get("FPT");
    expect(row?.markdown).toBe("# v2");
    expect(row?.confidence).toBeCloseTo(0.9, 5);
  });
});

describe("AR-schema-migration: financial_reports columns", () => {
  let db: Database;

  beforeEach(() => {
    db = makeInMemoryDb();
    initFinancialReportsTables(db);
  });

  it("text_status column exists on financial_reports after migration", () => {
    const cols = getColumnNames(db, "financial_reports");
    expect(cols).toContain("text_status");
  });

  it("refine_status column exists on financial_reports after migration", () => {
    const cols = getColumnNames(db, "financial_reports");
    expect(cols).toContain("refine_status");
  });
});

describe("AR-schema-migration: idempotency (run migration twice)", () => {
  it("running initFinancialReportsTables twice does not throw", () => {
    const db = makeInMemoryDb();
    // First run
    expect(() => initFinancialReportsTables(db)).not.toThrow();
    // Second run — must be idempotent
    expect(() => initFinancialReportsTables(db)).not.toThrow();
  });

  it("after double migration, bctc_refined_units still has correct columns", () => {
    const db = makeInMemoryDb();
    initFinancialReportsTables(db);
    initFinancialReportsTables(db); // second run

    const cols = getColumnNames(db, "bctc_refined_units");
    expect(cols).toContain("window_status");
    expect(cols).toContain("confidence");
    expect(cols).toContain("report_id");
    expect(cols).toContain("unit_id");
  });

  it("after double migration, financial_reports still has text_status and refine_status", () => {
    const db = makeInMemoryDb();
    initFinancialReportsTables(db);
    initFinancialReportsTables(db); // second run

    const cols = getColumnNames(db, "financial_reports");
    expect(cols).toContain("text_status");
    expect(cols).toContain("refine_status");
  });
});
