/**
 * FIX-BCTC-BANK-BS-SECTION-CLASSIFIER.test.ts
 *
 * Root of the stuck W5 CTG chain (parent_task: W5-FU-CTG-REFINE-96e36139,
 * report_id 96e36139-5dac-414d-8e4d-20a4725890d1, CTG 2026-Q1, bank form
 * B02a/TCTDHN).
 *
 * DEFECT (dispatcher/po RAW-probe evidence, orch-state row status_note):
 *   finalize_bctc_refine's markdown->bctc_table_rows materialization for
 *   this bank form:
 *     1. unit-0002 (pages 4-5, TÀI SẢN side, 34 rows, ends
 *        "TỔNG TÀI SẢN CÓ = 2,924,176,928") is dropped ENTIRELY (0 rows).
 *     2. unit-0003 (page 6, NGUỒN VỐN side, 29 rows) only 8/29 rows
 *        survive, mistagged statement_section="general".
 *     3. Post-apply: balance_sheet row count = 0 (VCB same-form baseline: 57).
 *     4. Consequence: CTG total_assets frozen at 0; equity_total/
 *        total_liabilities frozen at stale wrong-row values.
 *
 * ROOT CAUSES FOUND (3, all structural — classified by form SHAPE, no
 * per-ticker/date-literal hacks), reproduced against the PRE-fix parser via
 * a standalone probe before writing this fixture:
 *
 *   RC-1 (refinedMarkdownParser.ts, 3-cell branch): a BLANK "Mã số" (code)
 *     column — the norm for B02a/TCTDHN sub-items, per the task's own
 *     "mostly-blank Ma column" trigger hint — made a 3-cell row
 *     [code(blank), label, value_current] get mis-routed into the
 *     [label, value_current, value_prior] branch (the `firstCell !== ""`
 *     guard excluded exactly the blank-code case from the "treat as code"
 *     path). The blank code cell became an EMPTY labelRaw, which trips the
 *     "empty label after flag stripping" drop — the row silently vanishes.
 *     This is RC-1 for unit-0003's partial (8/29) survival.
 *
 *   RC-2 (refinedMarkdownParser.ts, header/separator state machine): once
 *     `headerConsumed` starts false, the ONLY way it was ever set true was
 *     via a `|---|` separator row. If the source markdown's separator line
 *     is lost in transcription (plausible for a long Roman-numeral/bold-
 *     header table split across 2 pages), `headerConsumed` NEVER flips —
 *     EVERY subsequent row for the rest of the document is silently
 *     treated as "still waiting for the header" and dropped, with zero
 *     parse errors. This is RC-2 for unit-0002's total (0/34) drop.
 *
 *   RC-3 (finalizeBctcRefineTool.ts + bctcRefineJob.ts orchestration):
 *     `parseRefinedMarkdown` resets `statement_section` to "general" at the
 *     start of EVERY unit, independently. Real multi-page VN BCTC
 *     statements print their header line ("BẢNG CÂN ĐỐI KẾ TOÁN") once, on
 *     the FIRST page — a continuation unit (unit-0003, page 6, continuing
 *     the balance sheet opened on unit-0002's pages 4-5) legitimately has
 *     NO header line of its own, so it always fell back to "general". This
 *     is RC-3 for unit-0003's statement_section mistagging.
 *
 * FIX: RC-1 — drop the `firstCell !== ""` exclusion (blank first cell in a
 * 3-cell row is ALWAYS the blank-code layout, never an empty-label layout —
 * a real BCTC data row can never be nameless). RC-2 — content-based
 * recovery using the already-defined-but-previously-unused `isHeaderRow`
 * heuristic: a pipe-row containing any parseable numeric cell is
 * structurally DATA, never a header: promote directly to data mode instead
 * of waiting forever for a separator that will never arrive. RC-3 —
 * `parseRefinedMarkdown` gained an optional `initialSection` param + a
 * `finalSection` field on `ParseResult`; both orchestrators
 * (finalizeBctcRefineTool.ts, bctcRefineJob.ts) thread `finalSection`
 * forward as the NEXT unit's `initialSection`, in their existing page-order
 * iteration (`ORDER BY unit_id ASC` / `runBoundedPool`'s fixed-index
 * result array) — `parseRefinedMarkdown` itself stays pure/stateless.
 *
 * Values below (total_assets=2,924,176,928, total_liabilities=2,735,484,770,
 * equity_total=188,692,158 — identity holds EXACTLY:
 * 2,735,484,770 + 188,692,158 = 2,924,176,928) are pinned to the task's own
 * stated DoD targets (orch-state status_note); row content/labels are a
 * representative SYNTHETIC B02a/TCTDHN-shaped reconstruction (Roman-numeral
 * hierarchy, blank Ma column, bold section headers, dropped separator) —
 * this repo has no live-DB access path for this worker (deploy-gated), so
 * the real transcribed markdown text is not reproduced verbatim; the
 * corruption SHAPE and DoD numbers are.
 *
 * @module __tests__/FIX-BCTC-BANK-BS-SECTION-CLASSIFIER
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { parseRefinedMarkdown } from "../application/utils/refinedMarkdownParser.js";
import { isBankFormFromRows } from "../domain/services/financial-reports/bctcFormType.js";
import { aggregateScalars, type AggregatorRow } from "../domain/services/financial-reports/bctcScalarAggregator.js";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildFinalizeBctcRefineHandler } from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";

// ═══════════════════════════════════════════════════════════════════════════
// Part 1 — RC-1: blank "Mã số" column in a 3-cell row (RED→GREEN)
// ═══════════════════════════════════════════════════════════════════════════

describe("RC-1: blank Ma (code) column in a 3-cell row must not drop the row", () => {
  const MD = [
    "BẢNG CÂN ĐỐI KẾ TOÁN",
    "",
    "| Mã số | Chỉ tiêu | Số cuối kỳ |",
    "|---|---|---|",
    "|  | Tiền mặt, vàng bạc, đá quý | 12.930.996 |",
    "| I | Tiền gửi tại NHNN | 21.355.164 |",
  ].join("\n");

  it("the blank-code row survives with code=null and the REAL label/value (not an empty label)", () => {
    const result = parseRefinedMarkdown(MD, "rc1-fixture", [4]);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    const blankCodeRow = result.rows.find((r) => r.label.includes("Tiền mặt"));
    expect(blankCodeRow).toBeDefined();
    expect(blankCodeRow!.code).toBeNull();
    expect(blankCodeRow!.label).toBe("Tiền mặt, vàng bạc, đá quý");
    expect(blankCodeRow!.value_current).toBe(12930996);
  });

  it("a normal coded row on the same table is unaffected (non-regression)", () => {
    const result = parseRefinedMarkdown(MD, "rc1-fixture", [4]);
    const codedRow = result.rows.find((r) => r.label.includes("NHNN"));
    expect(codedRow).toBeDefined();
    expect(codedRow!.code).toBe("I");
    expect(codedRow!.value_current).toBe(21355164);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 2 — RC-2: dropped |---| separator must not swallow the whole table
// ═══════════════════════════════════════════════════════════════════════════

describe("RC-2: a table missing its |---| separator row must not drop every row", () => {
  const MD = [
    "BẢNG CÂN ĐỐI KẾ TOÁN",
    "",
    "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
    // NO separator row here — the exact corruption reproduced live.
    "| I | Tiền mặt, vàng bạc, đá quý | 12.930.996 | 11.500.000 |",
    "| II | Tiền gửi tại NHNN | 21.355.164 | 35.225.543 |",
    "|  | TỔNG TÀI SẢN CÓ | 2.924.176.928 |",
  ].join("\n");

  it("all data rows are recovered (before the fix: 0 rows, 0 errors — silently swallowed)", () => {
    const result = parseRefinedMarkdown(MD, "rc2-fixture", [4]);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((r) => r.statement_section === "balance_sheet")).toBe(true);
  });

  it("the header/label-only row itself is still correctly excluded (not counted as data)", () => {
    const result = parseRefinedMarkdown(MD, "rc2-fixture", [4]);
    expect(result.rows.some((r) => r.label === "Mã số")).toBe(false);
    expect(result.rows.some((r) => r.label === "Chỉ tiêu")).toBe(false);
  });

  it("the grand-total row (blank code, single value) survives with the correct value", () => {
    const result = parseRefinedMarkdown(MD, "rc2-fixture", [4]);
    const total = result.rows.find((r) => r.label.includes("TỔNG TÀI SẢN"));
    expect(total).toBeDefined();
    expect(total!.value_current).toBe(2924176928);
  });

  it("non-regression: a table WITH a real separator still behaves exactly as before", () => {
    const withSep = [
      "| Mã số | Chỉ tiêu | Số cuối kỳ |",
      "|---|---|---|",
      "| 01 | Some item | 100.000 |",
    ].join("\n");
    const result = parseRefinedMarkdown(withSep, "rc2-nonregression", [1]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.code).toBe("01");
    expect(result.rows[0]?.value_current).toBe(100000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 3 — RC-3: cross-unit statement_section carry-forward
// ═══════════════════════════════════════════════════════════════════════════

describe("RC-3: parseRefinedMarkdown threads statement_section across ordered units", () => {
  it("default initialSection is 'general' — 0-diff for every pre-existing 3-arg caller", () => {
    const md = [
      "| Mã số | Chỉ tiêu | Số cuối kỳ |",
      "|---|---|---|",
      "| VIII | Vốn và các quỹ | 188.692.158 |",
    ].join("\n");
    const result = parseRefinedMarkdown(md, "rc3-default", [6]);
    expect(result.rows[0]?.statement_section).toBe("general");
    expect(result.finalSection).toBe("general");
  });

  it("a continuation unit with NO header line inherits the CALLER-supplied initialSection", () => {
    const md = [
      "| Mã số | Chỉ tiêu | Số cuối kỳ |",
      "|---|---|---|",
      "| VIII | Vốn và các quỹ | 188.692.158 |",
    ].join("\n");
    const result = parseRefinedMarkdown(md, "rc3-carried", [6], "balance_sheet");
    expect(result.rows[0]?.statement_section).toBe("balance_sheet");
    expect(result.finalSection).toBe("balance_sheet");
  });

  it("a unit WITH its own header line still overrides the carried-in section (header always wins)", () => {
    const md = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Số cuối kỳ |",
      "|---|---|---|",
      "| 1 | Thu nhập lãi thuần | 17.420.998 |",
    ].join("\n");
    // Carried-in section is balance_sheet, but this unit's OWN header must win.
    const result = parseRefinedMarkdown(md, "rc3-own-header-wins", [7], "balance_sheet");
    expect(result.rows[0]?.statement_section).toBe("income_statement");
    expect(result.finalSection).toBe("income_statement");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 4 — full B02a/TCTDHN-shaped 2-unit fixture, end-to-end through the
// domain aggregator (isBankFormFromRows + aggregateScalars). Pinned to the
// task's DoD numbers: total_assets=2,924,176,928, total_liabilities=
// 2,735,484,770, equity_total=188,692,158 (identity holds EXACTLY).
// ═══════════════════════════════════════════════════════════════════════════

/** unit-0002 — TÀI SẢN (assets) side, pages [4,5]. NO |---| separator
 *  (RC-2 shape) + a blank-Ma 3-cell row (RC-1 shape) + a bold "**A**"
 *  section-divider row + Roman-numeral hierarchy (I..V). */
const CTG_UNIT_0002_MD = [
  "BẢNG CÂN ĐỐI KẾ TOÁN",
  "",
  "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
  "| **A** | **TÀI SẢN** |  |  |",
  "| I | Tiền mặt, vàng bạc, đá quý | 12.930.996 | 11.500.000 |",
  "| II | Tiền gửi tại Ngân hàng Nhà nước | 21.355.164 | 35.225.543 |",
  "|  | Tiền, vàng gửi tại các TCTD khác | 450.320.112 | 398.112.000 |",
  "| III | Chứng khoán kinh doanh | 60.500.000 | 55.000.000 |",
  "|  | Cho vay khách hàng | 1.900.000.000 |",
  "| IV | Chứng khoán đầu tư | 470.000.000 | 420.000.000 |",
  "| V | Tài sản cố định | 9.070.436 | 8.500.000 |",
  "|  | TỔNG TÀI SẢN CÓ | 2.924.176.928 |",
].join("\n");

/** unit-0003 — NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU (liabilities+equity) side,
 *  page [6]. Continuation of the SAME statement — deliberately carries NO
 *  section-header line of its own (RC-3 shape). Has a real |---| separator
 *  (isolates RC-3 from RC-2) + blank-Ma rows (RC-1 shape). */
const CTG_UNIT_0003_MD = [
  "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
  "|---|---|---|---|",
  "| **B** | **NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU** |  |  |",
  "| I | Các khoản nợ Chính phủ và NHNN | 120.000.000 | 100.000.000 |",
  "|  | Tiền gửi của khách hàng | 2.400.000.000 | 2.100.000.000 |",
  "|  | TỔNG NỢ PHẢI TRẢ | 2.735.484.770 |",
  "| VIII | Vốn của TCTD |  |  |",
  "|  | Quỹ của TCTD | 18.000.000 | 15.000.000 |",
  "|  | Lợi nhuận chưa phân phối | 20.692.158 | 12.000.000 |",
  "|  | TỔNG VỐN CHỦ SỞ HỮU | 188.692.158 |",
  "|  | TỔNG CỘNG NGUỒN VỐN | 2.924.176.928 |",
].join("\n");

describe("Full B02a/TCTDHN 2-unit fixture (unit-0002 TÀI SẢN + unit-0003 NGUỒN VỐN, carried)", () => {
  it("unit-0002 is NOT dropped: all 8 rows survive, all tagged balance_sheet (VCB same-form baseline: non-zero)", () => {
    const result = parseRefinedMarkdown(CTG_UNIT_0002_MD, "ctg-96e36139", [4, 5]);
    expect(result.errors).toEqual([]);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows).toHaveLength(8);
    expect(result.rows.every((r) => r.statement_section === "balance_sheet")).toBe(true);
    const total = result.rows.find((r) => r.label.includes("TỔNG TÀI SẢN"));
    expect(total?.value_current).toBe(2924176928);
  });

  it("unit-0003 (carried section, no header of its own) is NOT mistagged general: all rows survive as balance_sheet", () => {
    const unit2 = parseRefinedMarkdown(CTG_UNIT_0002_MD, "ctg-96e36139", [4, 5]);
    const unit3 = parseRefinedMarkdown(CTG_UNIT_0003_MD, "ctg-96e36139", [6], unit2.finalSection);
    expect(unit3.errors).toEqual([]);
    expect(unit3.rows.length).toBeGreaterThan(0);
    expect(unit3.rows.every((r) => r.statement_section === "balance_sheet")).toBe(true);
    expect(unit3.rows.some((r) => r.statement_section === "general")).toBe(false);

    const liab = unit3.rows.find((r) => r.label === "TỔNG NỢ PHẢI TRẢ");
    const equity = unit3.rows.find((r) => r.label === "TỔNG VỐN CHỦ SỞ HỮU");
    expect(liab?.value_current).toBe(2735484770);
    expect(equity?.value_current).toBe(188692158);
  });

  it("combined rows resolve correctly through the domain aggregator: total_assets/liabilities/equity match DoD, identity holds, no violation", () => {
    const unit2 = parseRefinedMarkdown(CTG_UNIT_0002_MD, "ctg-96e36139", [4, 5]);
    const unit3 = parseRefinedMarkdown(CTG_UNIT_0003_MD, "ctg-96e36139", [6], unit2.finalSection);
    const allRows: AggregatorRow[] = [...unit2.rows, ...unit3.rows];

    // Structural bank discriminator — no per-ticker input.
    expect(isBankFormFromRows(allRows)).toBe(true);

    const result = aggregateScalars(allRows);
    const agg = result.scalars;

    expect(agg.total_assets).toBe(2924176928);
    expect(agg.total_liabilities).toBe(2735484770);
    expect(agg.equity_total).toBe(188692158);
    // Identity holds EXACTLY (task's own DoD numbers): 2,735,484,770 + 188,692,158 = 2,924,176,928
    expect(agg.total_liabilities! + agg.equity_total!).toBe(agg.total_assets!);
    expect(result.balanceViolation).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 5 — end-to-end integration through finalize_bctc_refine (the actual
// materialization path named in the task), proving the fix holds through
// the REAL orchestration (DB write + scalar backfill + validation refresh),
// not just the pure parser/aggregator functions in isolation.
// ═══════════════════════════════════════════════════════════════════════════

function openFullDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

interface FrRow {
  total_assets: number | null;
  total_liabilities: number | null;
  equity_total: number | null;
  validation_status: string | null;
}

function readReport(db: Database, reportId: string): FrRow | null {
  return db
    .prepare<FrRow, [string]>(
      `SELECT total_assets, total_liabilities, equity_total, validation_status
       FROM financial_reports WHERE id = ?`,
    )
    .get(reportId);
}

function seedReport(db: Database, id: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        parsed_at, extraction_confidence,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
        total_assets, total_liabilities, equity_total,
        validation_status, validation_notes,
        refine_status, confirm_status)
     VALUES (?, 'CTG', 'CTG Bank', 'HOSE', 'other',
             2026, 1, 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
             datetime('now'), 0.5625,
             '{}', '{}', '{}', '{}',
             0, 24735484770, 244904306,
             'low_confidence',
             'Errors: Accounting identity violated: Assets (0) ≠ Liabilities (24.735.484.770) + Equity (244.904.306) — mismatch 100.0%',
             'PARTIAL', 'PENDING')`,
  ).run(id);
}

describe("End-to-end: finalize_bctc_refine materializes both units correctly and unfreezes the stale scalars", () => {
  let db: Database;

  beforeEach(() => { db = openFullDb(); });
  afterEach(() => { db.close(); });

  it("2 DONE units (unit-0002, unit-0003) -> bctc_table_rows has >0 balance_sheet rows and financial_reports scalars match DoD", async () => {
    const REPORT_ID = "ctg-96e36139-e2e-fixture";
    seedReport(db, REPORT_ID);

    db.prepare(
      `INSERT INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, 'unit-0002', '[4,5]', ?, 8, 0.85, 'DONE')`,
    ).run(REPORT_ID, CTG_UNIT_0002_MD);
    db.prepare(
      `INSERT INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, 'unit-0003', '[6]', ?, 9, 0.85, 'DONE')`,
    ).run(REPORT_ID, CTG_UNIT_0003_MD);

    const handler = buildFinalizeBctcRefineHandler(db);
    const raw = await handler({ report_id: REPORT_ID, report_status: "DONE" });
    const response = JSON.parse(raw.content[0]!.text) as { ok: boolean; rows_parsed: number };
    expect(response.ok).toBe(true);
    expect(response.rows_parsed).toBeGreaterThan(0);

    interface BsCountRow { statement_section: string; n: number }
    const sectionCounts = db
      .prepare<BsCountRow, [string]>(
        `SELECT statement_section, COUNT(*) as n FROM bctc_table_rows WHERE report_id = ? GROUP BY statement_section`,
      )
      .all(REPORT_ID);
    const bsCount = sectionCounts.find((s) => s.statement_section === "balance_sheet")?.n ?? 0;
    const generalCount = sectionCounts.find((s) => s.statement_section === "general")?.n ?? 0;

    // CORE ASSERTION: balance_sheet row count is NO LONGER 0 (pre-fix defect)
    // and NOTHING leaked into "general" (pre-fix unit-0003 mistagging).
    expect(bsCount).toBeGreaterThan(0);
    expect(generalCount).toBe(0);

    const row = readReport(db, REPORT_ID);
    expect(row).not.toBeNull();
    // Stale scalars (0 / 24,735,484,770 / 244,904,306) are UNFROZEN and
    // replaced with the DoD-correct values.
    expect(row!.total_assets).toBe(2924176928);
    expect(row!.total_liabilities).toBe(2735484770);
    expect(row!.equity_total).toBe(188692158);
    // Was 'low_confidence' — now a truthful status, no longer masking a
    // resolved identity as a soft parse-time label.
    expect(row!.validation_status).not.toBe("low_confidence");
    expect(row!.validation_status).toMatch(/^passed/);
  });
});
