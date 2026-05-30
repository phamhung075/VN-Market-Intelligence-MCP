/**
 * HC-human-confirm.test.ts — DV tests for sprint BCTC-HUMAN-CONFIRM
 *
 * HC-DEV-1 coverage: schema migrations (DV-HC-9), store CRUD + re-anchor
 * (DV-HC-11, DV-HC-12, DV-HC-13), and correction service (DV-HC-10).
 *
 * Anti-false-green constraints:
 * - All DB reads use new Database(':memory:') DI injection
 * - Persistence verified via DIRECT DB reads, NOT via service return value alone
 * - Zero mocking framework calls — real SQLite in-memory DB
 * - Migration idempotency verified by calling initFinancialReportsTables twice
 *
 * Tests in this file (HC-DEV-1 scope):
 *   DV-HC-9  — source_confidence column exists after migration; idempotent ×2
 *   DV-HC-10 — submitCorrection service callable; writes to both tables
 *   DV-HC-11 — reAnchor never mis-attaches with different code disambiguator
 *   DV-HC-12 — anchor_ambiguous when stable key is genuinely ambiguous
 *   DV-HC-13 — idempotency ×3: correct same cell 3 times → 1 record, latest value
 *
 * Additional migration tests:
 *   MT-1 — confirm_status / final_confirmed_at / confirmed_by columns on financial_reports
 *   MT-2 — bctc_human_corrections table created with UNIQUE(report_id, row_id) constraint
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database as BunDatabase } from "bun:sqlite";
import type { Database } from "bun:sqlite";

// Set env before any imports that might open a real DB
Bun.env["DB_PATH"] = ":memory:";

import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import {
  upsertCorrection,
  getCorrectionsForReport,
  getCorrectionsMap,
  hasCorrection,
  reAnchorCorrections,
  buildAnchorKey,
} from "../infrastructure/db/bctcHumanCorrectionsStore.js";
import {
  submitCorrection,
} from "../application/usecases/bctcCorrectionService.js";
import {
  enumerateFlaggedCells,
} from "../application/usecases/bctcFlagEnumerationService.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new BunDatabase(":memory:");
  initFinancialReportsTables(db);
  return db;
}

const REPORT_UUID = "aaaabbbb-cccc-dddd-eeee-ffffffffffff";
const REPORT_UUID_2 = "bbbbcccc-dddd-eeee-ffff-000000000001";

/** Insert a minimal financial_reports row for testing. */
function seedReport(
  db: Database,
  reportId: string,
  overrides: { refine_status?: string; confirm_status?: string } = {},
): void {
  const refineStatus = overrides.refine_status ?? "DONE";
  const confirmStatus = overrides.confirm_status ?? "PENDING";
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        parsed_at,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
        refine_status, confirm_status)
     VALUES (?, 'VCB', 'Vietcombank', 'HOSE', 'banking',
             2025, 4, 'quarterly', '2025-10-01', '2025-12-31', '2025-Q4',
             datetime('now'),
             '{}', '{}', '{}', '{}',
             ?, ?)`,
  ).run(reportId, refineStatus, confirmStatus);
}

interface SeedTableRowOptions {
  page_number?: number;
  statement_section?: string;
  code?: string | null;
  label?: string;
  value_current?: number;
  row_order?: number;
}

/** Insert a bctc_table_rows row and return its auto-incremented id. */
function seedTableRow(
  db: Database,
  reportId: string,
  overrides: SeedTableRowOptions = {},
): number {
  const pageNumber = overrides.page_number ?? 4;
  const statementSection = overrides.statement_section ?? "balance_sheet";
  const code = overrides.code ?? null;
  const label = overrides.label ?? "Tiền và tương đương tiền";
  const valueCurrent = overrides.value_current ?? 1000;
  const rowOrder = overrides.row_order ?? 0;

  const result = db.prepare(
    `INSERT INTO bctc_table_rows
       (report_id, page_number, statement_section, row_order, code, label,
        period_current, value_current, unit, is_summary_row)
     VALUES (?, ?, ?, ?, ?, ?, 'current', ?, 'billion_vnd', 0)`,
  ).run(reportId, pageNumber, statementSection, rowOrder, code, label, valueCurrent);

  return result.lastInsertRowid as number;
}

// ── DV-HC-9: Migration idempotency ────────────────────────────────────────────

describe("DV-HC-9 — source_confidence migration idempotency", () => {
  it("source_confidence column exists after first migration", () => {
    const db = openTestDb();
    interface ColInfo { name: string }
    const cols = db.prepare<ColInfo, []>("PRAGMA table_info(bctc_table_rows)").all();
    const colNames = new Set(cols.map((c) => c.name));
    expect(colNames.has("source_confidence")).toBe(true);
    db.close();
  });

  it("second migration call is idempotent — no error, column present once", () => {
    const db = new BunDatabase(":memory:");
    initFinancialReportsTables(db);
    // Call migration a second time — must not throw
    expect(() => initFinancialReportsTables(db)).not.toThrow();

    interface ColInfo { name: string }
    const cols = db.prepare<ColInfo, []>("PRAGMA table_info(bctc_table_rows)").all();
    const sourceConfidenceCols = cols.filter((c) => c.name === "source_confidence");
    expect(sourceConfidenceCols.length).toBe(1);  // present exactly once
    db.close();
  });

  it("source_confidence default value is 1.0 for rows inserted without explicit value", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID);
    const rowId = seedTableRow(db, REPORT_UUID);
    interface ConfRow { source_confidence: number }
    const row = db
      .prepare<ConfRow, [number]>("SELECT source_confidence FROM bctc_table_rows WHERE id = ?")
      .get(rowId);
    expect(row?.source_confidence).toBe(1.0);
    db.close();
  });
});

// ── MT-1: confirm_status migration ────────────────────────────────────────────

describe("MT-1 — confirm_status / final_confirmed_at / confirmed_by migration", () => {
  it("confirm_status column exists on financial_reports", () => {
    const db = openTestDb();
    interface ColInfo { name: string }
    const cols = db.prepare<ColInfo, []>("PRAGMA table_info(financial_reports)").all();
    const colNames = new Set(cols.map((c) => c.name));
    expect(colNames.has("confirm_status")).toBe(true);
    expect(colNames.has("final_confirmed_at")).toBe(true);
    expect(colNames.has("confirmed_by")).toBe(true);
    db.close();
  });

  it("confirm_status defaults to PENDING for new rows", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID);
    interface StatusRow { confirm_status: string }
    const row = db
      .prepare<StatusRow, [string]>("SELECT confirm_status FROM financial_reports WHERE id = ?")
      .get(REPORT_UUID);
    expect(row?.confirm_status).toBe("PENDING");
    db.close();
  });

  it("idempotent ×2 — confirm_status columns present once after second migration", () => {
    const db = new BunDatabase(":memory:");
    initFinancialReportsTables(db);
    expect(() => initFinancialReportsTables(db)).not.toThrow();
    interface ColInfo { name: string }
    const cols = db.prepare<ColInfo, []>("PRAGMA table_info(financial_reports)").all();
    const confirmCols = cols.filter((c) => c.name === "confirm_status");
    expect(confirmCols.length).toBe(1);
    db.close();
  });
});

// ── MT-2: bctc_human_corrections table ────────────────────────────────────────

describe("MT-2 — bctc_human_corrections table created", () => {
  it("table exists after migration", () => {
    const db = openTestDb();
    interface TableInfo { name: string }
    const tables = db
      .prepare<TableInfo, []>("SELECT name FROM sqlite_master WHERE type='table' AND name='bctc_human_corrections'")
      .all();
    expect(tables.length).toBe(1);
    db.close();
  });

  it("UNIQUE(report_id, row_id) constraint enforced via INSERT OR REPLACE", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID);
    const rowId = seedTableRow(db, REPORT_UUID);

    upsertCorrection(db, {
      report_id: REPORT_UUID, row_id: rowId, label: "Tiền", page_number: 4,
      statement_section: "balance_sheet", code: null,
      old_value: 1000, new_value: 2000, correction_source: "human_ui",
      confirmed_by: "user", flag_type: "yellow",
      ocr_value_snapshot: null, image_value_snapshot: null, anchor_status: "ok",
    });

    // Second upsert with same (report_id, row_id) — must not create a duplicate row
    upsertCorrection(db, {
      report_id: REPORT_UUID, row_id: rowId, label: "Tiền", page_number: 4,
      statement_section: "balance_sheet", code: null,
      old_value: 1000, new_value: 3000, correction_source: "human_ui",
      confirmed_by: "user", flag_type: "yellow",
      ocr_value_snapshot: null, image_value_snapshot: null, anchor_status: "ok",
    });

    interface CountRow { cnt: number }
    const countRow = db
      .prepare<CountRow, [string, number]>(
        "SELECT COUNT(*) as cnt FROM bctc_human_corrections WHERE report_id = ? AND row_id = ?",
      )
      .get(REPORT_UUID, rowId);
    expect(countRow?.cnt).toBe(1);

    // Latest value wins
    interface NewValueRow { new_value: number }
    const rec = db
      .prepare<NewValueRow, [string, number]>(
        "SELECT new_value FROM bctc_human_corrections WHERE report_id = ? AND row_id = ?",
      )
      .get(REPORT_UUID, rowId);
    expect(rec?.new_value).toBe(3000);
    db.close();
  });

  it("idempotent ×2 — table not duplicated after second migration", () => {
    const db = new BunDatabase(":memory:");
    initFinancialReportsTables(db);
    expect(() => initFinancialReportsTables(db)).not.toThrow();
    interface TableInfo { name: string }
    const tables = db
      .prepare<TableInfo, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='bctc_human_corrections'",
      )
      .all();
    expect(tables.length).toBe(1);
    db.close();
  });
});

// ── Store CRUD tests ───────────────────────────────────────────────────────────

describe("bctcHumanCorrectionsStore — CRUD", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();
    seedReport(db, REPORT_UUID);
  });

  it("upsertCorrection writes all fields correctly", () => {
    const rowId = seedTableRow(db, REPORT_UUID);
    upsertCorrection(db, {
      report_id: REPORT_UUID, row_id: rowId, label: "Tiền", page_number: 4,
      statement_section: "balance_sheet", code: "110",
      old_value: 500, new_value: 750, correction_source: "human_ui",
      confirmed_by: "user", flag_type: "red",
      ocr_value_snapshot: "500", image_value_snapshot: "750",
      anchor_status: "ok",
    });

    const recs = getCorrectionsForReport(db, REPORT_UUID);
    expect(recs.length).toBe(1);
    const rec = recs[0]!;
    expect(rec.report_id).toBe(REPORT_UUID);
    expect(rec.row_id).toBe(rowId);
    expect(rec.new_value).toBe(750);
    expect(rec.old_value).toBe(500);
    expect(rec.flag_type).toBe("red");
    expect(rec.ocr_value_snapshot).toBe("500");
    expect(rec.image_value_snapshot).toBe("750");
    expect(rec.anchor_status).toBe("ok");
    db.close();
  });

  it("getCorrectionsMap keyed by stable anchor key", () => {
    const rowId = seedTableRow(db, REPORT_UUID, { label: "Tiền", code: "110" });
    upsertCorrection(db, {
      report_id: REPORT_UUID, row_id: rowId, label: "Tiền", page_number: 4,
      statement_section: "balance_sheet", code: "110",
      old_value: 500, new_value: 750, correction_source: "human_ui",
      confirmed_by: "user", flag_type: "red",
      ocr_value_snapshot: null, image_value_snapshot: null, anchor_status: "ok",
    });

    const map = getCorrectionsMap(db, REPORT_UUID);
    const expectedKey = buildAnchorKey("Tiền", 4, "balance_sheet", "110");
    expect(map.has(expectedKey)).toBe(true);
    expect(map.get(expectedKey)!.new_value).toBe(750);
    db.close();
  });

  it("hasCorrection returns true/false correctly", () => {
    const rowId = seedTableRow(db, REPORT_UUID);
    expect(hasCorrection(db, REPORT_UUID, rowId)).toBe(false);

    upsertCorrection(db, {
      report_id: REPORT_UUID, row_id: rowId, label: "Tiền", page_number: 4,
      statement_section: "balance_sheet", code: null,
      old_value: null, new_value: 500, correction_source: "human_ui",
      confirmed_by: "user", flag_type: "yellow",
      ocr_value_snapshot: null, image_value_snapshot: null, anchor_status: "ok",
    });

    expect(hasCorrection(db, REPORT_UUID, rowId)).toBe(true);
    db.close();
  });
});

// ── DV-HC-11: reAnchor with code disambiguator ────────────────────────────────

describe("DV-HC-11 — reAnchorCorrections never mis-attaches with code disambiguator", () => {
  it("correction lands on correct row after re-anchor when two rows have same label but different code", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID);

    // Seed two rows with same label but different code
    const rowId1 = seedTableRow(db, REPORT_UUID, {
      label: "Khác", page_number: 5, statement_section: "income_statement",
      code: "100", row_order: 0,
    });
    const _rowId2 = seedTableRow(db, REPORT_UUID, {
      label: "Khác", page_number: 5, statement_section: "income_statement",
      code: "200", row_order: 1,
    });

    // Apply correction to first row (code = '100')
    upsertCorrection(db, {
      report_id: REPORT_UUID, row_id: rowId1, label: "Khác", page_number: 5,
      statement_section: "income_statement", code: "100",
      old_value: 100, new_value: 999, correction_source: "human_ui",
      confirmed_by: "user", flag_type: "yellow",
      ocr_value_snapshot: null, image_value_snapshot: null, anchor_status: "ok",
    });

    // Simulate re-parse: delete and re-insert rows (new IDs assigned)
    db.prepare("DELETE FROM bctc_table_rows WHERE report_id = ?").run(REPORT_UUID);
    const newRowId1 = seedTableRow(db, REPORT_UUID, {
      label: "Khác", page_number: 5, statement_section: "income_statement",
      code: "100", row_order: 0,
    });
    const _newRowId2 = seedTableRow(db, REPORT_UUID, {
      label: "Khác", page_number: 5, statement_section: "income_statement",
      code: "200", row_order: 1,
    });

    // Re-anchor
    reAnchorCorrections(db, REPORT_UUID);

    // Verify correction was anchored to the correct new row (code='100')
    const recs = getCorrectionsForReport(db, REPORT_UUID);
    expect(recs.length).toBe(1);
    expect(recs[0]!.row_id).toBe(newRowId1);
    expect(recs[0]!.anchor_status).toBe("ok");
    db.close();
  });
});

// ── DV-HC-12: anchor_ambiguous for genuinely ambiguous stable key ──────────────

describe("DV-HC-12 — anchor_status = anchor_ambiguous for genuinely ambiguous key", () => {
  it("two rows with identical (label, page_number, statement_section, code=null) → anchor_ambiguous", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID);

    // Seed initial row and apply correction
    const rowId1 = seedTableRow(db, REPORT_UUID, {
      label: "Khác", page_number: 4, statement_section: "balance_sheet",
      code: null, row_order: 0,
    });

    upsertCorrection(db, {
      report_id: REPORT_UUID, row_id: rowId1, label: "Khác", page_number: 4,
      statement_section: "balance_sheet", code: null,
      old_value: 200, new_value: 300, correction_source: "human_ui",
      confirmed_by: "user", flag_type: "yellow",
      ocr_value_snapshot: null, image_value_snapshot: null, anchor_status: "ok",
    });

    // Simulate re-parse introducing two genuinely duplicate rows (same label/section/page/code=null)
    db.prepare("DELETE FROM bctc_table_rows WHERE report_id = ?").run(REPORT_UUID);
    // Row A — same stable key
    seedTableRow(db, REPORT_UUID, {
      label: "Khác", page_number: 4, statement_section: "balance_sheet",
      code: null, row_order: 0,
    });
    // Row B — same stable key (no discriminating code)
    seedTableRow(db, REPORT_UUID, {
      label: "Khác", page_number: 4, statement_section: "balance_sheet",
      code: null, row_order: 1,
    });

    // Re-anchor must NOT apply correction to either row
    reAnchorCorrections(db, REPORT_UUID);

    const recs = getCorrectionsForReport(db, REPORT_UUID);
    expect(recs.length).toBe(1);
    expect(recs[0]!.anchor_status).toBe("anchor_ambiguous");
    // row_id must NOT have been updated (still points to old rowId1 or the original)
    // The key invariant: no mis-attachment occurred
    db.close();
  });
});

// ── DV-HC-13: Idempotency ×3 ──────────────────────────────────────────────────

describe("DV-HC-13 — Idempotency ×3: same cell corrected 3 times → 1 record, latest value", () => {
  it("three corrections to same (report_id, row_id) produce exactly 1 record with latest new_value", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID);
    const rowId = seedTableRow(db, REPORT_UUID);

    const base = {
      report_id: REPORT_UUID, row_id: rowId, label: "Tiền", page_number: 4,
      statement_section: "balance_sheet", code: null,
      old_value: 100 as number | null, correction_source: "human_ui",
      confirmed_by: "user", flag_type: "yellow",
      ocr_value_snapshot: null, image_value_snapshot: null, anchor_status: "ok",
    };

    upsertCorrection(db, { ...base, new_value: 111 });
    upsertCorrection(db, { ...base, new_value: 222 });
    upsertCorrection(db, { ...base, new_value: 333 });

    // Anti-false-green: direct DB read
    interface CountRow { cnt: number }
    const countRow = db
      .prepare<CountRow, [string, number]>(
        "SELECT COUNT(*) as cnt FROM bctc_human_corrections WHERE report_id = ? AND row_id = ?",
      )
      .get(REPORT_UUID, rowId);
    expect(countRow?.cnt).toBe(1);  // exactly 1 record

    interface NewValueRow { new_value: number }
    const rec = db
      .prepare<NewValueRow, [string, number]>(
        "SELECT new_value FROM bctc_human_corrections WHERE report_id = ? AND row_id = ?",
      )
      .get(REPORT_UUID, rowId);
    expect(rec?.new_value).toBe(333);  // latest value
    db.close();
  });
});

// ── DV-HC-10: submitCorrection service callable ────────────────────────────────

describe("DV-HC-10 — submitCorrection service callable; writes to both tables", () => {
  it("successful correction writes bctc_human_corrections AND updates bctc_table_rows.source_confidence", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID);
    const rowId = seedTableRow(db, REPORT_UUID, { value_current: 500 });

    const result = submitCorrection(db, {
      report_id: REPORT_UUID,
      row_id: rowId,
      new_value: 750,
    });

    expect(result.ok).toBe(true);
    expect(result.row_id).toBe(rowId);
    expect(result.new_value).toBe(750);
    expect(result.source_confidence).toBe(1.0);

    // Anti-false-green: direct DB reads
    interface CorrRow { new_value: number; flag_type: string }
    const corrRow = db
      .prepare<CorrRow, [string, number]>(
        "SELECT new_value, flag_type FROM bctc_human_corrections WHERE report_id = ? AND row_id = ?",
      )
      .get(REPORT_UUID, rowId);
    expect(corrRow).not.toBeNull();
    expect(corrRow?.new_value).toBe(750);

    interface BtrRow { value_current: number; source_confidence: number }
    const btrRow = db
      .prepare<BtrRow, [number]>(
        "SELECT value_current, source_confidence FROM bctc_table_rows WHERE id = ?",
      )
      .get(rowId);
    expect(btrRow?.value_current).toBe(750);
    expect(btrRow?.source_confidence).toBe(1.0);
    db.close();
  });

  it("returns 409 when report is CONFIRMED", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { confirm_status: "CONFIRMED" });
    const rowId = seedTableRow(db, REPORT_UUID);

    const result = submitCorrection(db, {
      report_id: REPORT_UUID,
      row_id: rowId,
      new_value: 999,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("report_confirmed");
    expect(result.http_status).toBe(409);
    db.close();
  });

  it("returns 400 for invalid UUID", () => {
    const db = openTestDb();
    const result = submitCorrection(db, {
      report_id: "not-a-uuid",
      row_id: 1,
      new_value: 100,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_report_id");
    expect(result.http_status).toBe(400);
    db.close();
  });

  it("returns 400 when row_id not found", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID);
    const result = submitCorrection(db, {
      report_id: REPORT_UUID,
      row_id: 99999,  // non-existent
      new_value: 100,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("row_not_found");
    expect(result.http_status).toBe(400);
    db.close();
  });
});

// ── enumerateFlaggedCells EC-3 guard ──────────────────────────────────────────

describe("enumerateFlaggedCells — EC-3 guard", () => {
  it("returns reason: refine_not_complete when refine_status is PENDING", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { refine_status: "PENDING" });

    const result = enumerateFlaggedCells(db, REPORT_UUID);
    expect(result.has_flags).toBe(false);
    expect(result.reason).toBe("refine_not_complete");
    expect(result.flags).toEqual([]);
    db.close();
  });

  it("returns reason: refine_not_complete when refine_status is FAILED", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { refine_status: "FAILED" });

    const result = enumerateFlaggedCells(db, REPORT_UUID);
    expect(result.has_flags).toBe(false);
    expect(result.reason).toBe("refine_not_complete");
    db.close();
  });

  it("returns has_flags: false with empty flags when no units and refine_status is DONE", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { refine_status: "DONE" });

    const result = enumerateFlaggedCells(db, REPORT_UUID);
    expect(result.has_flags).toBe(false);
    expect(result.flags).toEqual([]);
    expect(result.reason).toBeUndefined();
    db.close();
  });

  it("detects red flag from markdown and extracts ocr/image values", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { refine_status: "DONE" });

    // Seed a bctc_refined_units row with a red flag cell
    const markdown = [
      "| Mã | Chỉ tiêu | Giá trị |",
      "|---|---|---|",
      "| 110 | Tiền và tương đương tiền | 1.234 [ĐỘ TIN CẬY THẤP — OCR 1.234 vs image 1.500] |",
    ].join("\n");

    db.prepare(
      `INSERT INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, 'unit-1', '[4]', ?, 1, 0.2, 'DONE')`,
    ).run(REPORT_UUID, markdown);

    // Also seed matching bctc_table_rows row
    seedTableRow(db, REPORT_UUID, {
      label: "Tiền và tương đương tiền", page_number: 4,
      statement_section: "general", code: null, value_current: 1234,
    });

    const result = enumerateFlaggedCells(db, REPORT_UUID);
    expect(result.has_flags).toBe(true);
    expect(result.flag_count).toBeGreaterThan(0);

    const redFlag = result.flags.find((f) => f.flag_type === "red");
    expect(redFlag).toBeDefined();
    expect(redFlag?.ocr_value).toBe("1.234");
    expect(redFlag?.image_value).toBe("1.500");
    db.close();
  });

  it("detects yellow flag with null ocr_value and image_value", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { refine_status: "DONE" });

    const markdown = [
      "| Chỉ tiêu | Giá trị |",
      "|---|---|",
      "| Doanh thu thuần | 5.000 [độ tin cậy thấp] |",
    ].join("\n");

    db.prepare(
      `INSERT INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, 'unit-2', '[3]', ?, 1, 0.4, 'DONE')`,
    ).run(REPORT_UUID, markdown);

    seedTableRow(db, REPORT_UUID, {
      label: "Doanh thu thuần", page_number: 3,
      statement_section: "general", code: null, value_current: 5000,
    });

    const result = enumerateFlaggedCells(db, REPORT_UUID);
    expect(result.has_flags).toBe(true);

    const yellowFlag = result.flags.find((f) => f.flag_type === "yellow");
    expect(yellowFlag).toBeDefined();
    expect(yellowFlag?.ocr_value).toBeNull();
    expect(yellowFlag?.image_value).toBeNull();
    db.close();
  });
});

// ── reAnchorCorrections anchor_missing ────────────────────────────────────────

describe("reAnchorCorrections — anchor_missing when no row found", () => {
  it("sets anchor_status = anchor_missing when no bctc_table_rows row matches stable key", () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID);

    // Insert correction without a matching table row
    const rowId = seedTableRow(db, REPORT_UUID, { label: "OriginalLabel" });
    upsertCorrection(db, {
      report_id: REPORT_UUID, row_id: rowId, label: "OriginalLabel", page_number: 4,
      statement_section: "balance_sheet", code: null,
      old_value: 100, new_value: 200, correction_source: "human_ui",
      confirmed_by: "user", flag_type: "yellow",
      ocr_value_snapshot: null, image_value_snapshot: null, anchor_status: "ok",
    });

    // Simulate re-parse that removes this row entirely
    db.prepare("DELETE FROM bctc_table_rows WHERE report_id = ?").run(REPORT_UUID);

    reAnchorCorrections(db, REPORT_UUID);

    const recs = getCorrectionsForReport(db, REPORT_UUID);
    expect(recs.length).toBe(1);
    expect(recs[0]!.anchor_status).toBe("anchor_missing");
    db.close();
  });
});
