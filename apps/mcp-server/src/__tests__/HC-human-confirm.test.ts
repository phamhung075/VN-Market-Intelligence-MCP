/**
 * HC-human-confirm.test.ts — DV tests for sprint BCTC-HUMAN-CONFIRM
 *
 * HC-DEV-1 coverage: schema migrations (DV-HC-9), store CRUD + re-anchor
 * (DV-HC-11, DV-HC-12, DV-HC-13), and correction service (DV-HC-10).
 *
 * HC-DEV-2 coverage: Layer 1 WHERE guard (DV-HC-3/Layer1), Layer 2 finalize
 * guards (DV-HC-7, DV-HC-8), source_confidence INSERT persistence.
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
 *
 * Tests in this file (HC-DEV-2 scope):
 *   DV-HC-3-Layer1 — confirmed report excluded from getBctcPendingRefine WHERE clause
 *   DV-HC-7  — finalize_bctc_refine on CONFIRMED report skips; rows + refine_status unchanged
 *   DV-HC-8  — CORE INVARIANT: finalize on partially-corrected report; corrected row pinned,
 *              source_confidence=1.0 survives; uncorrected rows updated with parser confidence
 *   DV-HC-SC — source_confidence persists in INSERT: red→0.2, yellow→0.4, none→1.0, corrected→1.0
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
import {
  buildGetBctcPendingRefineHandler,
} from "../interface/mcp/tools/financial-reports/getBctcPendingRefineTool.js";
import {
  buildFinalizeBctcRefineHandler,
} from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";

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

// ── Helper: seed bctc_refined_units ───────────────────────────────────────────

function seedRefinedUnit(
  db: Database,
  reportId: string,
  unitId: string,
  markdown: string,
  pageNumbers: number[] = [4],
): void {
  db.prepare(
    `INSERT OR REPLACE INTO bctc_refined_units
       (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
     VALUES (?, ?, ?, ?, 1, 0.9, 'DONE')`,
  ).run(reportId, unitId, JSON.stringify(pageNumbers), markdown);
}

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

// ── HC-DEV-2: DV-HC-3-Layer1 — confirmed report excluded from pending refine ──

describe("DV-HC-3-Layer1 — confirmed report excluded from getBctcPendingRefine WHERE clause", () => {
  it("CONFIRMED report does not appear in pending refine results", async () => {
    const db = openTestDb();

    // Seed a CONFIRMED report with text_status=COMPLETE + refine_status=PENDING
    db.prepare(
      `INSERT INTO financial_reports
         (id, action_code, company_name, exchange, domain,
          period_year, period_quarter, period_type, period_start, period_end, sort_key,
          parsed_at,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
          text_status, refine_status, confirm_status, pdf_path)
       VALUES (?, 'VCB', 'Vietcombank', 'HOSE', 'banking',
               2025, 4, 'quarterly', '2025-10-01', '2025-12-31', '2025-Q4',
               datetime('now'),
               '{}', '{}', '{}', '{}',
               'COMPLETE', 'PENDING', 'CONFIRMED', '/data/VCB.pdf')`,
    ).run(REPORT_UUID);

    // Seed a PENDING (non-confirmed) report that SHOULD appear
    db.prepare(
      `INSERT INTO financial_reports
         (id, action_code, company_name, exchange, domain,
          period_year, period_quarter, period_type, period_start, period_end, sort_key,
          parsed_at,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
          text_status, refine_status, confirm_status, pdf_path)
       VALUES (?, 'ACB', 'ACB Bank', 'HOSE', 'banking',
               2025, 4, 'quarterly', '2025-10-01', '2025-12-31', '2025-Q4',
               datetime('now'),
               '{}', '{}', '{}', '{}',
               'COMPLETE', 'PENDING', 'PENDING', '/data/ACB.pdf')`,
    ).run(REPORT_UUID_2);

    const handler = buildGetBctcPendingRefineHandler(db);
    const result = await handler({});

    const parsed = JSON.parse(result.content[0].text) as Array<{ id: string }>;

    // CONFIRMED report must NOT appear
    const confirmedEntry = parsed.find((r) => r.id === REPORT_UUID);
    expect(confirmedEntry).toBeUndefined();

    // PENDING report MUST appear
    const pendingEntry = parsed.find((r) => r.id === REPORT_UUID_2);
    expect(pendingEntry).toBeDefined();

    db.close();
  });

  it("report with confirm_status=NULL still appears in pending refine (backward compat)", async () => {
    const db = openTestDb();

    // NULL confirm_status — old rows before migration default. Must still appear.
    db.prepare(
      `INSERT INTO financial_reports
         (id, action_code, company_name, exchange, domain,
          period_year, period_quarter, period_type, period_start, period_end, sort_key,
          parsed_at,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
          text_status, refine_status, pdf_path)
       VALUES (?, 'VHM', 'Vinhomes', 'HOSE', 'real_estate',
               2025, 4, 'quarterly', '2025-10-01', '2025-12-31', '2025-Q4',
               datetime('now'),
               '{}', '{}', '{}', '{}',
               'COMPLETE', 'PARTIAL', '/data/VHM.pdf')`,
    ).run(REPORT_UUID);

    const handler = buildGetBctcPendingRefineHandler(db);
    const result = await handler({ limit: 10 });

    const parsed = JSON.parse(result.content[0].text) as Array<{ id: string }>;
    const entry = parsed.find((r) => r.id === REPORT_UUID);
    expect(entry).toBeDefined();

    db.close();
  });
});

// ── HC-DEV-2: DV-HC-7 — finalize on CONFIRMED report skips entirely ───────────

describe("DV-HC-7 — finalize_bctc_refine on CONFIRMED report skips write entirely", () => {
  it("returns skipped:true; rows unchanged; refine_status not updated", async () => {
    const db = openTestDb();

    // Seed a CONFIRMED report
    db.prepare(
      `INSERT INTO financial_reports
         (id, action_code, company_name, exchange, domain,
          period_year, period_quarter, period_type, period_start, period_end, sort_key,
          parsed_at,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
          text_status, refine_status, confirm_status)
       VALUES (?, 'VCB', 'Vietcombank', 'HOSE', 'banking',
               2025, 4, 'quarterly', '2025-10-01', '2025-12-31', '2025-Q4',
               datetime('now'),
               '{}', '{}', '{}', '{}',
               'COMPLETE', 'DONE', 'CONFIRMED')`,
    ).run(REPORT_UUID);

    // Seed a table row that must NOT be touched
    const existingRowId = seedTableRow(db, REPORT_UUID, { value_current: 9999, label: "Sentinel" });

    // Seed a bctc_refined_units row with different data (would change the value if finalize ran)
    const markdown = [
      "| Chỉ tiêu | Giá trị |",
      "|---|---|",
      "| Sentinel | 1 |",
    ].join("\n");
    seedRefinedUnit(db, REPORT_UUID, "unit-1", markdown, [4]);

    // Call finalize — must skip
    const handler = buildFinalizeBctcRefineHandler(db);
    const result = await handler({ report_id: REPORT_UUID, report_status: "DONE" });

    const parsed = JSON.parse(result.content[0].text) as {
      ok: boolean; skipped?: boolean; reason?: string;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.skipped).toBe(true);
    expect(parsed.reason).toBe("confirmed");

    // Anti-false-green: direct DB read — row must be unchanged
    interface ValRow { value_current: number }
    const rowAfter = db
      .prepare<ValRow, [number]>("SELECT value_current FROM bctc_table_rows WHERE id = ?")
      .get(existingRowId);
    expect(rowAfter?.value_current).toBe(9999);  // sentinel value unchanged

    // refine_status must NOT have been updated
    interface StatusRow { refine_status: string }
    const statusAfter = db
      .prepare<StatusRow, [string]>("SELECT refine_status FROM financial_reports WHERE id = ?")
      .get(REPORT_UUID);
    expect(statusAfter?.refine_status).toBe("DONE");  // still the original "DONE"

    db.close();
  });
});

// ── HC-DEV-2: DV-HC-8 — CORE INVARIANT: corrections survive finalize re-run ───

describe("DV-HC-8 — CORE INVARIANT: corrected value + source_confidence=1.0 survive finalize re-parse", () => {
  it("corrected row pinned; uncorrected rows updated with parser confidence; confirm_status unchanged", async () => {
    const db = openTestDb();

    // Seed a PENDING report (not confirmed — finalize should run)
    db.prepare(
      `INSERT INTO financial_reports
         (id, action_code, company_name, exchange, domain,
          period_year, period_quarter, period_type, period_start, period_end, sort_key,
          parsed_at,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
          text_status, refine_status, confirm_status)
       VALUES (?, 'VCB', 'Vietcombank', 'HOSE', 'banking',
               2025, 4, 'quarterly', '2025-10-01', '2025-12-31', '2025-Q4',
               datetime('now'),
               '{}', '{}', '{}', '{}',
               'COMPLETE', 'PENDING', 'PENDING')`,
    ).run(REPORT_UUID);

    // Seed the initial table row (will be corrected by submitCorrection)
    const correctedRowId = seedTableRow(db, REPORT_UUID, {
      label: "Tiền và tương đương tiền",
      page_number: 4,
      statement_section: "general",
      code: null,
      value_current: 1000,
      row_order: 0,
    });

    // Human corrects this row: old_value=1000, new_value=2500
    const corrResult = submitCorrection(db, {
      report_id: REPORT_UUID,
      row_id: correctedRowId,
      new_value: 2500,
    });
    expect(corrResult.ok).toBe(true);

    // Verify correction was written
    const map = getCorrectionsMap(db, REPORT_UUID);
    expect(map.size).toBe(1);

    // Seed bctc_refined_units with BOTH the corrected row AND an uncorrected row.
    // Use 2-column format (label | value) so the parser unambiguously maps them.
    // The corrected row has a yellow flag (source_confidence=0.4 from parser,
    // but after applyCorrections post-pass it becomes 1.0 with value 2500).
    const markdown = [
      "| Chỉ tiêu | Giá trị |",
      "|---|---|",
      // corrected row — parser gives value 1000 (wrong), applyCorrections gives 2500 + confidence=1.0
      "| Tiền và tương đương tiền | 1.000 [độ tin cậy thấp] |",
      // uncorrected row — parser gives yellow flag, source_confidence=0.4
      "| Doanh thu thuần | 5.000 [độ tin cậy thấp] |",
    ].join("\n");
    seedRefinedUnit(db, REPORT_UUID, "unit-1", markdown, [4]);

    // Run finalize — must apply corrections post-pass
    const handler = buildFinalizeBctcRefineHandler(db);
    const result = await handler({ report_id: REPORT_UUID, report_status: "DONE" });

    const parsed = JSON.parse(result.content[0].text) as {
      ok: boolean; rows_parsed: number;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.rows_parsed).toBeGreaterThan(0);

    // Anti-false-green: direct DB reads

    // 1. Corrected row: value_current must be 2500 (human correction), source_confidence=1.0
    interface BtrRow { value_current: number | null; source_confidence: number; label: string }
    const allRows = db
      .prepare<BtrRow, [string]>(
        "SELECT value_current, source_confidence, label FROM bctc_table_rows WHERE report_id = ? ORDER BY row_order",
      )
      .all(REPORT_UUID);

    // ANTI-FALSE-GREEN: COUNT assertion — must be exactly 1 corrected row (not duplicates)
    const correctedRowCount = allRows.filter((r) => r.label === "Tiền và tương đương tiền").length;
    expect(correctedRowCount).toBe(1);

    const correctedRow = allRows.find((r) => r.label === "Tiền và tương đương tiền");
    expect(correctedRow).toBeDefined();
    expect(correctedRow?.value_current).toBe(2500);       // human value, NOT parser value 1000
    expect(correctedRow?.source_confidence).toBe(1.0);    // pinned by correction

    // 2. Uncorrected row: value_current=5000, source_confidence=0.4 (yellow flag from parser)
    // ANTI-FALSE-GREEN: COUNT assertion — must be exactly 1 uncorrected row
    const uncorrectedRowCount = allRows.filter((r) => r.label === "Doanh thu thuần").length;
    expect(uncorrectedRowCount).toBe(1);

    const uncorrectedRow = allRows.find((r) => r.label === "Doanh thu thuần");
    expect(uncorrectedRow).toBeDefined();
    expect(uncorrectedRow?.value_current).toBe(5000);
    expect(uncorrectedRow?.source_confidence).toBe(0.4);  // yellow flag from parser

    // 3. confirm_status still PENDING (finalize must NOT change it)
    interface StatusRow { confirm_status: string; refine_status: string }
    const statusAfter = db
      .prepare<StatusRow, [string]>(
        "SELECT confirm_status, refine_status FROM financial_reports WHERE id = ?",
      )
      .get(REPORT_UUID);
    expect(statusAfter?.confirm_status).toBe("PENDING");   // unchanged
    expect(statusAfter?.refine_status).toBe("DONE");       // updated by finalize

    db.close();
  });
});

// ── HC-DEV-2: DV-HC-SC — source_confidence persists in INSERT ────────────────

describe("DV-HC-SC — source_confidence persists in bctc_table_rows INSERT", () => {
  it("red flag row has source_confidence=0.2; yellow=0.4; no flag=1.0; corrected=1.0", async () => {
    const db = openTestDb();

    db.prepare(
      `INSERT INTO financial_reports
         (id, action_code, company_name, exchange, domain,
          period_year, period_quarter, period_type, period_start, period_end, sort_key,
          parsed_at,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
          text_status, refine_status, confirm_status)
       VALUES (?, 'VCB', 'Vietcombank', 'HOSE', 'banking',
               2025, 4, 'quarterly', '2025-10-01', '2025-12-31', '2025-Q4',
               datetime('now'),
               '{}', '{}', '{}', '{}',
               'COMPLETE', 'PENDING', 'PENDING')`,
    ).run(REPORT_UUID);

    // Seed a row to be corrected
    const rowForCorrection = seedTableRow(db, REPORT_UUID, {
      label: "Corrected Item",
      page_number: 4,
      statement_section: "general",
      code: null,
      value_current: 100,
      row_order: 0,
    });
    submitCorrection(db, { report_id: REPORT_UUID, row_id: rowForCorrection, new_value: 999 });

    // Seed refined units with four confidence variants (2-column: label | value)
    const markdown = [
      "| Chỉ tiêu | Giá trị |",
      "|---|---|",
      // red flag → source_confidence=0.2
      "| Red Item | 1.000 [ĐỘ TIN CẬY THẤP — OCR 1.000 vs image 2.000] |",
      // yellow flag → source_confidence=0.4
      "| Yellow Item | 2.000 [độ tin cậy thấp] |",
      // no flag → source_confidence=1.0
      "| Clean Item | 3.000 |",
      // corrected → applyCorrections overrides to source_confidence=1.0 and value=999
      "| Corrected Item | 100 [độ tin cậy thấp] |",
    ].join("\n");
    seedRefinedUnit(db, REPORT_UUID, "unit-sc", markdown, [4]);

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_UUID, report_status: "DONE" });

    // Direct DB read — verify all four confidence levels persisted
    interface BtrRow { label: string; source_confidence: number; value_current: number | null }
    const rows = db
      .prepare<BtrRow, [string]>(
        "SELECT label, source_confidence, value_current FROM bctc_table_rows WHERE report_id = ?",
      )
      .all(REPORT_UUID);

    const rowMap = new Map(rows.map((r) => [r.label, r]));

    const redRow = rowMap.get("Red Item");
    expect(redRow).toBeDefined();
    expect(redRow?.source_confidence).toBe(0.2);

    const yellowRow = rowMap.get("Yellow Item");
    expect(yellowRow).toBeDefined();
    expect(yellowRow?.source_confidence).toBe(0.4);

    const cleanRow = rowMap.get("Clean Item");
    expect(cleanRow).toBeDefined();
    expect(cleanRow?.source_confidence).toBe(1.0);

    const correctedRow = rowMap.get("Corrected Item");
    expect(correctedRow).toBeDefined();
    expect(correctedRow?.source_confidence).toBe(1.0);  // pinned by applyCorrections
    expect(correctedRow?.value_current).toBe(999);       // human-corrected value

    db.close();
  });
});

// ── HC-DEV-3 DV tests ─────────────────────────────────────────────────────────
// All tests below exercise the three HTTP route handlers via mock res injection.
// DB state is verified via direct DB reads (anti-false-green contract).
// ─────────────────────────────────────────────────────────────────────────────

import {
  handleBctcInspectFlags,
} from "../interface/mcp/routes/bctcFlagsHandler.js";
import {
  handleBctcInspectCorrect,
} from "../interface/mcp/routes/bctcCorrectHandler.js";
import {
  handleBctcInspectConfirm,
  handleBctcInspectConfirmReset,
} from "../interface/mcp/routes/bctcConfirmHandler.js";
import type { IncomingMessage } from "node:http";

// ── HTTP mock helpers ─────────────────────────────────────────────────────────

interface MockRes {
  statusCode: number;
  body: string;
  writeHead(code: number, _headers?: Record<string, string>): void;
  end(data: string): void;
}

function makeMockRes(): MockRes {
  const res: MockRes = {
    statusCode: 0,
    body: "",
    writeHead(code: number) { this.statusCode = code; },
    end(data: string) { this.body = data; },
  };
  return res;
}

/**
 * Build a minimal IncomingMessage-like object for GET requests (no body).
 */
function makeGetReq(): IncomingMessage {
  return {
    method: "GET",
    headers: {},
    [Symbol.asyncIterator]: async function* () { /* no body */ },
  } as unknown as IncomingMessage;
}

/**
 * Build a minimal IncomingMessage-like object for POST requests with a JSON body.
 */
function makePostReq(jsonBody: unknown): IncomingMessage {
  const bodyStr = JSON.stringify(jsonBody);
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    [Symbol.asyncIterator]: async function* () {
      yield bodyStr;
    },
  } as unknown as IncomingMessage;
}

// ── DV-HC-1: GET /flags/{doc_id} returns red flags with ocr_value/image_value ─

describe("DV-HC-1 — GET /flags/{doc_id} returns red flagged cells with ocr_value/image_value", () => {
  it("seeds red-flag markdown; assert exact ocr_value and image_value strings", async () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { refine_status: "DONE" });

    // Seed bctc_refined_units with known red-flag markdown
    const markdown = [
      "| Mã | Chỉ tiêu | Giá trị |",
      "|---|---|---|",
      "| 110 | Tiền và tương đương tiền | 1.234 [ĐỘ TIN CẬY THẤP — OCR 1.234 vs image 1.500] |",
    ].join("\n");
    db.prepare(
      `INSERT INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, 'unit-dv1', '[4]', ?, 1, 0.2, 'DONE')`,
    ).run(REPORT_UUID, markdown);

    // Seed matching bctc_table_rows row
    seedTableRow(db, REPORT_UUID, {
      label: "Tiền và tương đương tiền",
      page_number: 4,
      statement_section: "general",
      code: null,
      value_current: 1234,
    });

    const req = makeGetReq();
    const res = makeMockRes();
    await handleBctcInspectFlags(req, res as never, db, REPORT_UUID);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as {
      has_flags: boolean; flags: Array<{
        flag_type: string; ocr_value: string | null; image_value: string | null;
      }>;
    };
    expect(parsed.has_flags).toBe(true);

    const redFlag = parsed.flags.find((f) => f.flag_type === "red");
    expect(redFlag).toBeDefined();
    // Anti-false-green: exact string match from the markdown seed
    expect(redFlag?.ocr_value).toBe("1.234");
    expect(redFlag?.image_value).toBe("1.500");

    db.close();
  });

  it("returns 400 for invalid UUID", async () => {
    const db = openTestDb();
    const req = makeGetReq();
    const res = makeMockRes();
    await handleBctcInspectFlags(req, res as never, db, "not-a-uuid");
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body) as { error: string };
    expect(parsed.error).toBe("invalid_uuid");
    db.close();
  });

  it("returns 404 when report not found", async () => {
    const db = openTestDb();
    const req = makeGetReq();
    const res = makeMockRes();
    await handleBctcInspectFlags(req, res as never, db, REPORT_UUID);
    expect(res.statusCode).toBe(404);
    db.close();
  });
});

// ── DV-HC-2: GET /flags/{doc_id} returns yellow flag with null ocr/image ──────

describe("DV-HC-2 — GET /flags/{doc_id} yellow flag: null ocr_value and image_value", () => {
  it("seeds yellow-flag markdown; asserts both ocr_value and image_value are null", async () => {
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
       VALUES (?, 'unit-dv2', '[3]', ?, 1, 0.4, 'DONE')`,
    ).run(REPORT_UUID, markdown);

    seedTableRow(db, REPORT_UUID, {
      label: "Doanh thu thuần",
      page_number: 3,
      statement_section: "general",
      code: null,
      value_current: 5000,
    });

    const req = makeGetReq();
    const res = makeMockRes();
    await handleBctcInspectFlags(req, res as never, db, REPORT_UUID);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as {
      flags: Array<{
        flag_type: string;
        ocr_value: string | null;
        image_value: string | null;
      }>;
    };

    const yellowFlag = parsed.flags.find((f) => f.flag_type === "yellow");
    expect(yellowFlag).toBeDefined();
    // Anti-false-green: both must be null (yellow flags have no OCR vs image clause)
    expect(yellowFlag?.ocr_value).toBeNull();
    expect(yellowFlag?.image_value).toBeNull();

    db.close();
  });
});

// ── DV-HC-4: POST /correct/{doc_id} on confirmed report → 409 ─────────────────

describe("DV-HC-4 — POST /correct/{doc_id} on CONFIRMED report returns 409", () => {
  it("sets confirm_status=CONFIRMED first; asserts 409 response", async () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { confirm_status: "CONFIRMED", refine_status: "DONE" });
    const rowId = seedTableRow(db, REPORT_UUID, { value_current: 500 });

    const req = makePostReq({ row_id: rowId, new_value: 999 });
    const res = makeMockRes();
    await handleBctcInspectCorrect(req, res as never, db, REPORT_UUID);

    // Anti-false-green: HTTP status must be exactly 409
    expect(res.statusCode).toBe(409);
    const parsed = JSON.parse(res.body) as { ok: boolean; error: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("report_confirmed");

    db.close();
  });

  it("returns 400 for invalid JSON body", async () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID);

    const badReq = {
      method: "POST",
      headers: {},
      [Symbol.asyncIterator]: async function* () { yield "not-json"; },
    } as unknown as IncomingMessage;

    const res = makeMockRes();
    await handleBctcInspectCorrect(badReq, res as never, db, REPORT_UUID);
    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body) as { error: string };
    expect(parsed.error).toBe("invalid_json");
    db.close();
  });

  it("returns 400 when row_id is not an integer", async () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID);

    const req = makePostReq({ row_id: "not-a-number", new_value: 100 });
    const res = makeMockRes();
    await handleBctcInspectCorrect(req, res as never, db, REPORT_UUID);
    expect(res.statusCode).toBe(400);
    db.close();
  });
});

// ── DV-HC-5: POST /confirm/{doc_id} sets confirm_status=CONFIRMED ─────────────

describe("DV-HC-5 — POST /confirm/{doc_id} sets confirm_status=CONFIRMED", () => {
  it("after POST, direct DB read shows confirm_status=CONFIRMED", async () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { confirm_status: "PENDING" });

    const req = makePostReq({});
    const res = makeMockRes();
    await handleBctcInspectConfirm(req, res as never, db, REPORT_UUID);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as { ok: boolean; confirm_status: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.confirm_status).toBe("CONFIRMED");

    // Anti-false-green: DIRECT DB read, not HTTP response alone
    interface StatusRow { confirm_status: string; final_confirmed_at: string | null }
    const row = db
      .prepare<StatusRow, [string]>(
        "SELECT confirm_status, final_confirmed_at FROM financial_reports WHERE id = ?",
      )
      .get(REPORT_UUID);
    expect(row?.confirm_status).toBe("CONFIRMED");
    expect(row?.final_confirmed_at).not.toBeNull();  // timestamp was set

    db.close();
  });

  it("idempotent: re-confirm updates timestamp, returns 200", async () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { confirm_status: "CONFIRMED" });

    const req = makePostReq({});
    const res = makeMockRes();
    await handleBctcInspectConfirm(req, res as never, db, REPORT_UUID);
    expect(res.statusCode).toBe(200);

    // Direct DB read: still CONFIRMED
    interface StatusRow { confirm_status: string }
    const row = db
      .prepare<StatusRow, [string]>("SELECT confirm_status FROM financial_reports WHERE id = ?")
      .get(REPORT_UUID);
    expect(row?.confirm_status).toBe("CONFIRMED");

    db.close();
  });

  it("returns 400 for invalid UUID", async () => {
    const db = openTestDb();
    const req = makePostReq({});
    const res = makeMockRes();
    await handleBctcInspectConfirm(req, res as never, db, "bad-uuid");
    expect(res.statusCode).toBe(400);
    db.close();
  });
});

// ── DV-HC-6: POST /confirm/{doc_id}/reset clears status; corrections remain ───

describe("DV-HC-6 — POST /confirm/{doc_id}/reset clears confirm_status; corrections intact", () => {
  it("after reset, confirm_status=PENDING; bctc_human_corrections count unchanged", async () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { confirm_status: "CONFIRMED" });
    const rowId = seedTableRow(db, REPORT_UUID, { value_current: 1000 });

    // Seed a correction record (must survive the reset)
    upsertCorrection(db, {
      report_id: REPORT_UUID, row_id: rowId, label: "Tiền", page_number: 4,
      statement_section: "balance_sheet", code: null,
      old_value: 1000, new_value: 2000, correction_source: "human_ui",
      confirmed_by: "user", flag_type: "yellow",
      ocr_value_snapshot: null, image_value_snapshot: null, anchor_status: "ok",
    });

    // Verify correction is there before reset
    interface CountRow { cnt: number }
    const beforeCount = db
      .prepare<CountRow, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_human_corrections WHERE report_id = ?",
      )
      .get(REPORT_UUID);
    expect(beforeCount?.cnt).toBe(1);

    // POST reset
    const req = makePostReq({});
    const res = makeMockRes();
    await handleBctcInspectConfirmReset(req, res as never, db, REPORT_UUID);

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as { ok: boolean; confirm_status: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.confirm_status).toBe("PENDING");

    // Anti-false-green: DIRECT DB reads
    interface StatusRow { confirm_status: string; final_confirmed_at: string | null }
    const statusRow = db
      .prepare<StatusRow, [string]>(
        "SELECT confirm_status, final_confirmed_at FROM financial_reports WHERE id = ?",
      )
      .get(REPORT_UUID);
    expect(statusRow?.confirm_status).toBe("PENDING");
    expect(statusRow?.final_confirmed_at).toBeNull();  // timestamp cleared

    // Corrections must NOT be deleted (AC-FR3-2)
    const afterCount = db
      .prepare<CountRow, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_human_corrections WHERE report_id = ?",
      )
      .get(REPORT_UUID);
    expect(afterCount?.cnt).toBe(1);  // correction record still there

    db.close();
  });

  it("returns 400 for invalid UUID", async () => {
    const db = openTestDb();
    const req = makePostReq({});
    const res = makeMockRes();
    await handleBctcInspectConfirmReset(req, res as never, db, "not-uuid");
    expect(res.statusCode).toBe(400);
    db.close();
  });
});

// ── HC-DEV-4 MCP Tool tests ───────────────────────────────────────────────────
// Tests for MCP tools #145 (list_flagged_bctc_cells) and #146 (submit_bctc_correction).
// DV-HC-10b: submit_bctc_correction MCP tool delegates to same service as HTTP handler.
// Registry: both tools in toolRegistry array (verified by import resolving below).
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildListFlaggedBctcCellsHandler,
  registerListFlaggedBctcCellsTool,
} from "../interface/mcp/tools/financial-reports/listFlaggedBctcCellsTool.js";
import {
  buildSubmitBctcCorrectionHandler,
  registerSubmitBctcCorrectionTool,
} from "../interface/mcp/tools/financial-reports/submitBctcCorrectionTool.js";
import { toolRegistry } from "../interface/mcp/tools/registry.js";

// ── DV-HC-10b: submit_bctc_correction MCP tool delegates to same service ─────

describe("DV-HC-10b — submit_bctc_correction MCP tool delegates to bctcCorrectionService", () => {
  it("tool calls submitCorrection; persists to both tables (direct DB read)", async () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID);
    const rowId = seedTableRow(db, REPORT_UUID, { value_current: 400 });

    const handler = buildSubmitBctcCorrectionHandler(db);
    const toolResult = await handler({
      report_id: REPORT_UUID,
      row_id: rowId,
      new_value: 800,
      correction_source: "human_ui",
    });

    // Tool must return JSON text
    expect(toolResult.content[0].type).toBe("text");
    const parsed = JSON.parse(toolResult.content[0].text) as {
      ok: boolean; row_id: number; new_value: number; source_confidence: number;
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.row_id).toBe(rowId);
    expect(parsed.new_value).toBe(800);
    expect(parsed.source_confidence).toBe(1.0);

    // Anti-false-green: DIRECT DB reads (NOT via tool return value alone)
    // 1. Correction record persisted in bctc_human_corrections
    interface CorrRow { new_value: number; correction_source: string }
    const corrRow = db
      .prepare<CorrRow, [string, number]>(
        "SELECT new_value, correction_source FROM bctc_human_corrections WHERE report_id = ? AND row_id = ?",
      )
      .get(REPORT_UUID, rowId);
    expect(corrRow).not.toBeNull();
    expect(corrRow?.new_value).toBe(800);
    expect(corrRow?.correction_source).toBe("human_ui");

    // 2. bctc_table_rows updated: value_current + source_confidence = 1.0
    interface BtrRow { value_current: number; source_confidence: number }
    const btrRow = db
      .prepare<BtrRow, [number]>(
        "SELECT value_current, source_confidence FROM bctc_table_rows WHERE id = ?",
      )
      .get(rowId);
    expect(btrRow?.value_current).toBe(800);
    expect(btrRow?.source_confidence).toBe(1.0);

    db.close();
  });

  it("tool returns ok:false + error:report_confirmed when report is CONFIRMED", async () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { confirm_status: "CONFIRMED" });
    const rowId = seedTableRow(db, REPORT_UUID, { value_current: 100 });

    const handler = buildSubmitBctcCorrectionHandler(db);
    const toolResult = await handler({
      report_id: REPORT_UUID,
      row_id: rowId,
      new_value: 999,
    });

    const parsed = JSON.parse(toolResult.content[0].text) as {
      ok: boolean; error: string; http_status: number;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("report_confirmed");
    expect(parsed.http_status).toBe(409);

    db.close();
  });

  it("tool rejects invalid UUID via Zod schema — returns validation_error", async () => {
    const db = openTestDb();
    const handler = buildSubmitBctcCorrectionHandler(db);
    const toolResult = await handler({
      report_id: "not-a-valid-uuid",
      row_id: 1,
      new_value: 100,
    });

    const parsed = JSON.parse(toolResult.content[0].text) as {
      error: string; details: unknown[];
    };
    expect(parsed.error).toBe("validation_error");
    expect(Array.isArray(parsed.details)).toBe(true);

    db.close();
  });

  it("tool rejects non-integer row_id via Zod schema — returns validation_error", async () => {
    const db = openTestDb();
    const handler = buildSubmitBctcCorrectionHandler(db);
    const toolResult = await handler({
      report_id: REPORT_UUID,
      row_id: 1.5,  // not an integer
      new_value: 100,
    });

    const parsed = JSON.parse(toolResult.content[0].text) as {
      error: string; details: unknown[];
    };
    expect(parsed.error).toBe("validation_error");

    db.close();
  });
});

// ── list_flagged_bctc_cells MCP tool tests ────────────────────────────────────

describe("list_flagged_bctc_cells MCP tool (#145) — delegates to bctcFlagEnumerationService", () => {
  it("returns flagged cells matching the service output", async () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { refine_status: "DONE" });

    // Seed a red-flag refined unit
    const markdown = [
      "| Mã | Chỉ tiêu | Giá trị |",
      "|---|---|---|",
      "| 110 | Tiền và tương đương tiền | 1.234 [ĐỘ TIN CẬY THẤP — OCR 1.234 vs image 1.500] |",
    ].join("\n");
    db.prepare(
      `INSERT INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, 'unit-mcp1', '[4]', ?, 1, 0.2, 'DONE')`,
    ).run(REPORT_UUID, markdown);
    seedTableRow(db, REPORT_UUID, {
      label: "Tiền và tương đương tiền", page_number: 4,
      statement_section: "general", code: null, value_current: 1234,
    });

    const handler = buildListFlaggedBctcCellsHandler(db);
    const toolResult = await handler({ report_id: REPORT_UUID });

    expect(toolResult.content[0].type).toBe("text");
    const parsed = JSON.parse(toolResult.content[0].text) as {
      doc_id: string;
      has_flags: boolean;
      flag_count: number;
      flags: Array<{ flag_type: string; ocr_value: string | null; image_value: string | null }>;
    };

    expect(parsed.doc_id).toBe(REPORT_UUID);
    expect(parsed.has_flags).toBe(true);
    expect(parsed.flag_count).toBeGreaterThan(0);

    const redFlag = parsed.flags.find((f) => f.flag_type === "red");
    expect(redFlag).toBeDefined();
    // Anti-false-green: exact match from seeded markdown
    expect(redFlag?.ocr_value).toBe("1.234");
    expect(redFlag?.image_value).toBe("1.500");

    db.close();
  });

  it("returns empty flags list (not error) when no flags present (AC-FR8-2)", async () => {
    const db = openTestDb();
    seedReport(db, REPORT_UUID, { refine_status: "DONE" });
    // No bctc_refined_units seeded — no flags

    const handler = buildListFlaggedBctcCellsHandler(db);
    const toolResult = await handler({ report_id: REPORT_UUID });

    const parsed = JSON.parse(toolResult.content[0].text) as {
      has_flags: boolean;
      flags: unknown[];
    };
    expect(parsed.has_flags).toBe(false);
    expect(Array.isArray(parsed.flags)).toBe(true);
    expect(parsed.flags.length).toBe(0);

    db.close();
  });

  it("rejects invalid UUID via Zod schema — returns validation_error", async () => {
    const db = openTestDb();
    const handler = buildListFlaggedBctcCellsHandler(db);
    const toolResult = await handler({ report_id: "not-a-uuid" });

    const parsed = JSON.parse(toolResult.content[0].text) as {
      error: string; details: unknown[];
    };
    expect(parsed.error).toBe("validation_error");

    db.close();
  });
});

// ── Registry: both tools discoverable ─────────────────────────────────────────

describe("HC-DEV-4 registry — both MCP tools registered in toolRegistry", () => {
  it("registerListFlaggedBctcCellsTool is in the toolRegistry array", () => {
    expect(toolRegistry.includes(registerListFlaggedBctcCellsTool)).toBe(true);
  });

  it("registerSubmitBctcCorrectionTool is in the toolRegistry array", () => {
    expect(toolRegistry.includes(registerSubmitBctcCorrectionTool)).toBe(true);
  });

  it("toolRegistry array includes both new registration functions (confirms additive entry)", () => {
    // The registry array contains registration functions (some register multiple tools each).
    // After HC-DEV-4: 2 new entries for #145 and #146. The array length grows by 2.
    // We verify both new functions are present (already verified by includes() above),
    // and that the total is ≥ 103 (101 pre-HC-DEV-4 + 2 new).
    expect(toolRegistry.length).toBeGreaterThanOrEqual(103);
  });
});
