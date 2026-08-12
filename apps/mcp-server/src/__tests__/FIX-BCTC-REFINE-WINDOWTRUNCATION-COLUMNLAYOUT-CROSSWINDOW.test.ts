/**
 * FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW.test.ts
 *
 * Regression fixture for the maxWindowPages truncation → headless-tail-window →
 * code/label-swap defect (docs/spikes/SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION.md).
 *
 * No existing test exercises the actual >maxWindowPages split-across-two-windows path
 * end to end (partition → refine markdown → finalize) with a label-first (bank-form)
 * continuation table — AR-refined-units-idempotency.test.ts:346,369 and
 * FIX-REFINE-WINDOW-DB-PAGELIST.test.ts:128 both use maxWindowPages:3 with inputs that
 * never exceed the cap, or test a different bug (DB-driven page-list construction).
 *
 * SYNTHETIC per the task's own acceptance criteria (unlike FIX-BCTC-BANK-BS-COLUMN-ORDER's
 * mandatory-real-data provenance gate — this defect was NOT independently reproduced from a
 * live corrupted row within the spike's timebox, so a hand-authored, structurally faithful
 * bank Mẫu B02a/TCTDHN-shaped fixture is the explicitly sanctioned approach).
 *
 * Part 1: windowPartitioner — a 6-page synthetic continuation run with maxWindowPages:3
 *         truncates into exactly 2 windows; the tail window is correctly flagged
 *         truncated_continuation:true.
 * Part 2: parseRefinedMarkdown — label-first (bank) head window WITH header, tail window
 *         WITHOUT header, threaded via initialColumnLayout/finalColumnLayout: tail-window
 *         rows resolve code/label in the CORRECT order.
 * Part 3: Negative control — code-first (corporate) equivalent is 0-diff (inheritedLayout
 *         and the pre-existing hardcoded default are both "code-first" for this shape, so
 *         behavior is byte-identical with or without the fix).
 * Part 4: Full integration via the real finalize_bctc_refine handler (DB writes), proving
 *         the cross-window thread survives parseDoneUnitsToRows, not just the pure parser.
 *
 * @module __tests__/FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { partitionIntoWindows } from "../application/utils/windowPartitioner.js";
import { parseRefinedMarkdown } from "../application/utils/refinedMarkdownParser.js";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildFinalizeBctcRefineHandler } from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";

// ═══════════════════════════════════════════════════════════════════════════
// Part 1 — windowPartitioner: cap-hit produces exactly 2 windows, tail flagged
// ═══════════════════════════════════════════════════════════════════════════

describe("windowPartitioner: maxWindowPages truncation produces a flagged tail window", () => {
  it("6-page continuation run, maxWindowPages:3 → 2 windows [1,2,3]+[4,5,6], only the tail flagged truncated_continuation", () => {
    const pageTexts = [
      { page: 1, text: "BÁO CÁO TÌNH HÌNH TÀI CHÍNH | Mục | Mã | table data" },
      { page: 2, text: "(tiếp theo) | more table data" },
      { page: 3, text: "(tiếp theo) | more table data" },
      { page: 4, text: "(tiếp theo) | more table data" },
      { page: 5, text: "(tiếp theo) | more table data" },
      { page: 6, text: "(tiếp theo) | more table data" },
    ];

    const windows = partitionIntoWindows(pageTexts, { maxWindowPages: 3 });

    expect(windows).toHaveLength(2);
    expect(windows[0]!.page_numbers).toEqual([1, 2, 3]);
    expect(windows[0]!.truncated_continuation).toBe(false);
    expect(windows[1]!.page_numbers).toEqual([4, 5, 6]);
    expect(windows[1]!.truncated_continuation).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 2 — label-first (bank) cross-window column-layout threading
// ═══════════════════════════════════════════════════════════════════════════

// Head window (window A) — pages [1,2,3], WITH its own label-first header.
const BANK_HEAD_MD =
  "# NGÂN HÀNG TMCP ABC — BÁO CÁO TÌNH HÌNH TÀI CHÍNH HỢP NHẤT\n\nMẫu số: B02a/TCTDHN\n\n## TÀI SẢN\n\n| Mục (Item) | Mã (Code) | Năm 2026 | Năm 2025 |\n|---|---|---:|---:|\n| I. Tiền mặt, vàng bạc, đá quý | | 1,000,000 | 900,000 |\n| II. Tiền gửi tại NHNN | 2 | 2,000,000 | 1,800,000 |\n";

// Tail window (window B) — pages [4,5,6], truncation-tail: NO header line,
// NO separator line — pure continuation data (the expected shape per
// SPIKE-BCTC-REFINE-MAXWINDOW-TRUNCATION Finding 2).
const BANK_TAIL_MD =
  "| III. Tiền gửi và cho vay các TCTD khác | 3 | 5,000,000 | 4,500,000 |\n| IV. Chứng khoán kinh doanh | | 3,000,000 | 2,800,000 |\n| **TỔNG TÀI SẢN CÓ** | | **11,000,000** | **10,000,000** |\n";

describe("FIX-BCTC-REFINE-WINDOWTRUNCATION-COLUMNLAYOUT-CROSSWINDOW: label-first bank tail window", () => {
  it("head window resolves label-first from its own captured header", () => {
    const head = parseRefinedMarkdown(BANK_HEAD_MD, "bank-synth", [1, 2, 3]);
    expect(head.errors).toEqual([]);
    expect(head.finalColumnLayout).toBe("label-first");
  });

  it("tail window (no header of its own) INHERITS label-first from the head window — code/label NOT swapped", () => {
    const head = parseRefinedMarkdown(BANK_HEAD_MD, "bank-synth", [1, 2, 3]);
    const tail = parseRefinedMarkdown(
      BANK_TAIL_MD,
      "bank-synth",
      [4, 5, 6],
      head.finalSection,
      head.finalColumnLayout,
    );
    expect(tail.errors).toEqual([]);
    expect(tail.rows).toHaveLength(3);

    const populatedCodeRow = tail.rows.find((r) => r.label === "III. Tiền gửi và cho vay các TCTD khác");
    expect(populatedCodeRow).toBeDefined();
    // CORE ASSERTION — before the fix, code held the label text and label held "3" (swapped).
    expect(populatedCodeRow!.code).toBe("3");
    expect(populatedCodeRow!.value_current).toBe(5000000);
    expect(populatedCodeRow!.value_prior).toBe(4500000);

    const blankCodeRow = tail.rows.find((r) => r.label === "IV. Chứng khoán kinh doanh");
    expect(blankCodeRow).toBeDefined();
    expect(blankCodeRow!.code).toBeNull();
    expect(blankCodeRow!.value_current).toBe(3000000);

    const total = tail.rows.find((r) => r.label === "**TỔNG TÀI SẢN CÓ**");
    expect(total).toBeDefined();
    expect(total!.code).toBeNull();
    expect(total!.value_current).toBe(11000000);
    expect(total!.value_prior).toBe(10000000);
  });

  it("tail window parsed WITHOUT the inherited layout (old call shape, pre-fix simulation) DOES swap — proves the fixture is decisive, not a false positive", () => {
    // Simulates the pre-fix call site: no 5th argument at all.
    const tail = parseRefinedMarkdown(BANK_TAIL_MD, "bank-synth", [4, 5, 6]);
    const row = tail.rows.find((r) => r.value_current === 5000000);
    expect(row).toBeDefined();
    // Defaulted to code-first with no inherited layout: label text ends up in `code`,
    // "3" ends up in `label` — the exact corruption the spike describes.
    expect(row!.code).toBe("III. Tiền gửi và cho vay các TCTD khác");
    expect(row!.label).toBe("3");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 3 — negative control: code-first (corporate) continuation is 0-diff
// ═══════════════════════════════════════════════════════════════════════════

const CORP_HEAD_MD =
  "# CÔNG TY CỔ PHẦN ABC — BẢNG CÂN ĐỐI KẾ TOÁN\n\n| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |\n|---|---|---:|---:|\n| 100 | Tài sản ngắn hạn | 15,000,000 | 14,000,000 |\n";

const CORP_TAIL_MD =
  "| 220 | Tài sản dài hạn | 28,000,000 | 26,500,000 |\n| | **TỔNG CỘNG TÀI SẢN** | **43,000,000** | **40,500,000** |\n";

describe("Negative control: code-first (corporate) continuation table is unaffected (0-diff)", () => {
  it("head window resolves code-first (unchanged default)", () => {
    const head = parseRefinedMarkdown(CORP_HEAD_MD, "corp-synth", [1, 2, 3]);
    expect(head.finalColumnLayout).toBe("code-first");
  });

  it("tail window (no header) — inherited code-first === pre-existing hardcoded default: byte-identical result with or without the fix", () => {
    const head = parseRefinedMarkdown(CORP_HEAD_MD, "corp-synth", [1, 2, 3]);
    // Both calls pass the SAME initialSection (head.finalSection) so the
    // comparison isolates ONLY the columnLayout parameter under test — the
    // pre-existing, already-proven statement_section threading is not what
    // this negative control is about.
    const tailWithInheritance = parseRefinedMarkdown(
      CORP_TAIL_MD, "corp-synth", [4, 5, 6], head.finalSection, head.finalColumnLayout,
    );
    const tailWithoutInheritance = parseRefinedMarkdown(
      CORP_TAIL_MD, "corp-synth", [4, 5, 6], head.finalSection, // 5th arg omitted (defaults null)
    );

    expect(tailWithInheritance.rows).toEqual(tailWithoutInheritance.rows);

    const row = tailWithInheritance.rows.find((r) => r.code === "220");
    expect(row).toBeDefined();
    expect(row!.label).toBe("Tài sản dài hạn");
    expect(row!.value_current).toBe(28000000);

    const total = tailWithInheritance.rows.find((r) => r.label === "**TỔNG CỘNG TÀI SẢN**");
    expect(total).toBeDefined();
    expect(total!.code).toBeNull();
    expect(total!.value_current).toBe(43000000);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Part 4 — full integration through the real finalize_bctc_refine handler
// ═══════════════════════════════════════════════════════════════════════════

function openFullDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
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
     VALUES (?, 'ABC', 'Bank ABC', 'HOSE', 'other',
             2026, 1, 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
             datetime('now'), 0.75,
             '{}', '{}', '{}', '{}',
             0, 0, 0,
             'pending', NULL,
             'PARTIAL', 'PENDING')`,
  ).run(id);
}

describe("Full pipeline: finalize_bctc_refine over a truncated (head+tail) bank-form window pair", () => {
  let db: Database;
  beforeEach(() => { db = openFullDb(); });
  afterEach(() => { db.close(); });

  it("tail-window rows land in bctc_table_rows with code/label in the CORRECT order — not just non-empty", async () => {
    const REPORT_ID = "bank-synth-e2e";
    seedReport(db, REPORT_ID);

    const units: Array<[string, string, number[]]> = [
      ["unit-0000", BANK_HEAD_MD, [1, 2, 3]],
      ["unit-0001", BANK_TAIL_MD, [4, 5, 6]],
    ];
    for (const [unitId, md, pages] of units) {
      db.prepare(
        `INSERT INTO bctc_refined_units
           (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
         VALUES (?, ?, ?, ?, 0, 0.8, 'DONE')`,
      ).run(REPORT_ID, unitId, JSON.stringify(pages), md);
    }

    const handler = buildFinalizeBctcRefineHandler(db);
    const raw = await handler({ report_id: REPORT_ID, report_status: "DONE" });
    const response = JSON.parse(raw.content[0]!.text) as { ok: boolean; rows_parsed: number };
    expect(response.ok).toBe(true);
    expect(response.rows_parsed).toBe(5); // 2 head rows + 3 tail rows

    interface RowShape { code: string | null; label: string; value_current: number | null; page_number: number }
    const rows = db
      .prepare<RowShape, [string]>(
        `SELECT code, label, value_current, page_number FROM bctc_table_rows WHERE report_id = ? ORDER BY row_order ASC`,
      )
      .all(REPORT_ID);

    const tailRow = rows.find((r) => r.value_current === 5000000);
    expect(tailRow).toBeDefined();
    expect(tailRow!.code).toBe("3");
    expect(tailRow!.label).toBe("III. Tiền gửi và cho vay các TCTD khác");
    expect(tailRow!.page_number).toBe(4); // stamped from the tail window's own page_numbers[0]
  });
});
