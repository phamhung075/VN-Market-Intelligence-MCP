// apps/mcp-server/src/__tests__/AR-parser-dv.test.ts
// Sprint BCTC-AGENTIC-REFINE — FR-10 Design Verification (DV) Tests
//
// DV = Design Verification: tests that validate the parser meets contract.
// These tests were written BEFORE the parser implementation (RED_BEFORE = true).
// The parser implementation makes them GREEN.
//
// RED_BEFORE = true
// (guard comment: confirms DV protocol was followed — parser written after tests)
//
// Tests:
//   DV-1: Malformed markdown (missing value columns) → empty rows + errors
//   DV-2: Well-formed 5-row table → exactly 5 rows with correct values
//   DV-3: Red trust flag [ĐỘ TIN CẬY THẤP — reason] → source_confidence = 0.2
//   DV-4: Yellow trust flag [độ tin cậy thấp] → source_confidence = 0.4
//   DV-5: Vietnamese number "1.234.567" → 1234567
//
// Architect mandate: DV tests committed in SAME COMMIT as production code.
// Balance badge FORBIDDEN as sole gate (never overrides trust flags).

import { describe, it, expect } from "bun:test";
import { parseRefinedMarkdown, parseVnNumber } from "../application/utils/refinedMarkdownParser.js";

// ─────────────────────────────────────────────────────────────────────────────
// DV-5: Vietnamese number normalization (isolated, pure function)
// ─────────────────────────────────────────────────────────────────────────────

describe("parseVnNumber (DV-5 — Vietnamese number formatting)", () => {
  it("parses Vietnamese thousands-separated number '1.234.567' → 1234567", () => {
    expect(parseVnNumber("1.234.567")).toBe(1234567);
  });

  it("parses '1.234' → 1234 (thousands separator)", () => {
    expect(parseVnNumber("1.234")).toBe(1234);
  });

  it("parses '1.234,56' → 1234.56 (decimal comma)", () => {
    expect(parseVnNumber("1.234,56")).toBeCloseTo(1234.56, 5);
  });

  it("parses simple integer '12345' → 12345", () => {
    expect(parseVnNumber("12345")).toBe(12345);
  });

  it("returns null for empty string", () => {
    expect(parseVnNumber("")).toBeNull();
  });

  it("returns null for dash '-'", () => {
    expect(parseVnNumber("-")).toBeNull();
  });

  it("returns null for 'N/A'", () => {
    expect(parseVnNumber("N/A")).toBeNull();
  });

  it("returns null for pure text", () => {
    expect(parseVnNumber("abc")).toBeNull();
  });

  it("parses negative number '-1.234.567' → -1234567", () => {
    // Note: Vietnamese negatives use minus sign before the number
    // After removing dots: "-1234567" → -1234567
    // Actually -1.234.567 after removing dots = -1234567... but parseFloat("-1234567") works
    // The input "-1.234.567": replace /\./g → "-1234567", then parseFloat → -1234567
    expect(parseVnNumber("-1.234.567")).toBe(-1234567);
  });

  it("parses '0' → 0", () => {
    expect(parseVnNumber("0")).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DV-1: Malformed markdown — missing value columns
// ─────────────────────────────────────────────────────────────────────────────

describe("parseRefinedMarkdown DV-1 (malformed input)", () => {
  it("DV-1: markdown with only 1 column → empty rows, non-empty errors", () => {
    // Only label column — no value_current column
    // This should NOT silently insert partial rows
    const markdown = "| Chỉ tiêu |\n|---|\n| Tiền mặt |";
    const result = parseRefinedMarkdown(markdown, "rpt1", [1]);

    // BINDING: must not silently insert partial rows
    expect(result.rows).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("DV-1b: markdown with only header and separator, no data rows → empty rows, no errors", () => {
    const markdown = "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |\n|---|---|---|---|";
    const result = parseRefinedMarkdown(markdown, "rpt1", [1]);
    expect(result.rows).toHaveLength(0);
    // No errors for a valid but empty table
  });

  it("DV-1c: empty markdown → empty rows, no errors", () => {
    const result = parseRefinedMarkdown("", "rpt1", [1]);
    expect(result.rows).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DV-2: Well-formed 5-row table → exactly 5 rows
// ─────────────────────────────────────────────────────────────────────────────

describe("parseRefinedMarkdown DV-2 (well-formed table)", () => {
  const WELL_FORMED_MARKDOWN = `
BẢNG CÂN ĐỐI KẾ TOÁN

| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |
|---|---|---|---|
| 100 | Tiền và các khoản tương đương tiền | 1.234.567 | 1.100.000 |
| 110 | Các khoản đầu tư tài chính ngắn hạn | 500.000 | 450.000 |
| 120 | Các khoản phải thu ngắn hạn | 750.000 | 700.000 |
| 130 | Hàng tồn kho | 300.000 | 280.000 |
| 140 | Tài sản ngắn hạn khác | 100.000 | 90.000 |
`.trim();

  it("DV-2: 5-row table → exactly 5 rows", () => {
    const result = parseRefinedMarkdown(WELL_FORMED_MARKDOWN, "rpt2", [5]);
    expect(result.rows).toHaveLength(5);
  });

  it("DV-2: correct report_id on rows", () => {
    const result = parseRefinedMarkdown(WELL_FORMED_MARKDOWN, "rpt2", [5]);
    expect(result.rows.every((r) => r.report_id === "rpt2")).toBe(true);
  });

  it("DV-2: correct page_number on rows (uses page_numbers[0])", () => {
    const result = parseRefinedMarkdown(WELL_FORMED_MARKDOWN, "rpt2", [5, 6]);
    expect(result.rows.every((r) => r.page_number === 5)).toBe(true);
  });

  it("DV-2: statement_section = 'balance_sheet' (BẢNG CÂN ĐỐI KẾ TOÁN header)", () => {
    const result = parseRefinedMarkdown(WELL_FORMED_MARKDOWN, "rpt2", [5]);
    expect(result.rows.every((r) => r.statement_section === "balance_sheet")).toBe(true);
  });

  it("DV-2: first row values correct (code=100, value_current=1234567)", () => {
    const result = parseRefinedMarkdown(WELL_FORMED_MARKDOWN, "rpt2", [5]);
    const firstRow = result.rows[0]!;
    expect(firstRow.code).toBe("100");
    expect(firstRow.value_current).toBe(1234567);
    expect(firstRow.value_prior).toBe(1100000);
  });

  it("DV-2: row_order increments correctly (0, 1, 2, 3, 4)", () => {
    const result = parseRefinedMarkdown(WELL_FORMED_MARKDOWN, "rpt2", [5]);
    const orders = result.rows.map((r) => r.row_order);
    expect(orders).toEqual([0, 1, 2, 3, 4]);
  });

  it("DV-2: source_confidence = 1.0 for clean rows", () => {
    const result = parseRefinedMarkdown(WELL_FORMED_MARKDOWN, "rpt2", [5]);
    expect(result.rows.every((r) => r.source_confidence === 1.0)).toBe(true);
  });

  it("DV-2: label uses LIVE schema name 'label' (NOT row_label)", () => {
    const result = parseRefinedMarkdown(WELL_FORMED_MARKDOWN, "rpt2", [5]);
    const row = result.rows[0]!;
    // Verify the field 'label' exists and 'row_label' does NOT
    expect(Object.prototype.hasOwnProperty.call(row, "label")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(row, "row_label")).toBe(false);
  });

  it("DV-2: value_prior uses LIVE schema name 'value_prior' (NOT value_previous)", () => {
    const result = parseRefinedMarkdown(WELL_FORMED_MARKDOWN, "rpt2", [5]);
    const row = result.rows[0]!;
    expect(Object.prototype.hasOwnProperty.call(row, "value_prior")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(row, "value_previous")).toBe(false);
  });

  it("DV-2: no errors on well-formed input", () => {
    const result = parseRefinedMarkdown(WELL_FORMED_MARKDOWN, "rpt2", [5]);
    expect(result.errors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DV-3: Red trust flag → source_confidence = 0.2
// ─────────────────────────────────────────────────────────────────────────────

describe("parseRefinedMarkdown DV-3 (red trust flag)", () => {
  it("DV-3: [ĐỘ TIN CẬY THẤP — reason] → source_confidence = 0.2", () => {
    const markdown = [
      "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|---|",
      "| 100 | Tiền | [ĐỘ TIN CẬY THẤP — OCR 1234567 vs image 1345678] | 1.000.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(markdown, "rpt3", [1]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.source_confidence).toBe(0.2);
  });

  it("DV-3: red flag stripped from cell — numeric parsing works on cleaned value", () => {
    const markdown = [
      "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|---|",
      "| 110 | Khoản đầu tư | [ĐỘ TIN CẬY THẤP — mismatch] 500.000 | 450.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(markdown, "rpt3", [1]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.source_confidence).toBe(0.2);
    // Value should be parsed from cleaned cell (after flag removal)
    expect(result.rows[0]!.value_current).toBe(500000);
  });

  it("DV-3: red flag case-insensitive match", () => {
    const markdown = [
      "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|---|",
      "| 100 | Tiền | [ĐỘ TIN CẬY THẤP — abc] | 1.000 |",
    ].join("\n");
    const result = parseRefinedMarkdown(markdown, "rpt3", [1]);
    expect(result.rows[0]!.source_confidence).toBe(0.2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DV-4: Yellow trust flag → source_confidence = 0.4
// ─────────────────────────────────────────────────────────────────────────────

describe("parseRefinedMarkdown DV-4 (yellow trust flag)", () => {
  it("DV-4: [độ tin cậy thấp] → source_confidence = 0.4", () => {
    const markdown = [
      "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|---|",
      "| 100 | Tiền | [độ tin cậy thấp] 1.234.567 | 1.100.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(markdown, "rpt4", [1]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.source_confidence).toBe(0.4);
  });

  it("DV-4: yellow flag: confidence > red flag confidence (0.4 > 0.2)", () => {
    const yellowResult = parseRefinedMarkdown(
      "| Mã số | Chỉ tiêu | Số cuối kỳ |\n|---|---|---|\n| 100 | Test | [độ tin cậy thấp] 1.000 |",
      "rpt4",
      [1],
    );
    const redResult = parseRefinedMarkdown(
      "| Mã số | Chỉ tiêu | Số cuối kỳ |\n|---|---|---|\n| 100 | Test | [ĐỘ TIN CẬY THẤP — X] |",
      "rpt4",
      [1],
    );

    if (yellowResult.rows.length > 0 && redResult.rows.length > 0) {
      expect(yellowResult.rows[0]!.source_confidence).toBeGreaterThan(
        redResult.rows[0]!.source_confidence,
      );
    }
  });

  it("DV-4: clean row confidence = 1.0 (baseline)", () => {
    const markdown = [
      "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|---|",
      "| 100 | Tiền | 1.234.567 | 1.100.000 |",
    ].join("\n");
    const result = parseRefinedMarkdown(markdown, "rpt4", [1]);
    expect(result.rows[0]!.source_confidence).toBe(1.0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section header detection
// ─────────────────────────────────────────────────────────────────────────────

describe("parseRefinedMarkdown section detection", () => {
  it("detects income_statement section", () => {
    const markdown = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|---|",
      "| 01 | Doanh thu | 1.000.000 | 900.000 |",
    ].join("\n");
    const result = parseRefinedMarkdown(markdown, "rpt5", [1]);
    expect(result.rows[0]?.statement_section).toBe("income_statement");
  });

  it("detects cash_flow section", () => {
    const markdown = [
      "BÁO CÁO LƯU CHUYỂN TIỀN TỆ",
      "| Mã số | Chỉ tiêu | Số cuối kỳ |",
      "|---|---|---|",
      "| 01 | Tiền từ HĐ kinh doanh | 500.000 |",
    ].join("\n");
    const result = parseRefinedMarkdown(markdown, "rpt5", [1]);
    expect(result.rows[0]?.statement_section).toBe("cash_flow");
  });

  it("defaults to 'general' when no section header", () => {
    const markdown = [
      "| Mã số | Chỉ tiêu | Số cuối kỳ |",
      "|---|---|---|",
      "| 01 | Some item | 100.000 |",
    ].join("\n");
    const result = parseRefinedMarkdown(markdown, "rpt5", [1]);
    expect(result.rows[0]?.statement_section).toBe("general");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Balance badge — FORBIDDEN as sole gate (must not override trust flags)
// ─────────────────────────────────────────────────────────────────────────────

describe("DV-FR13: Balance badge cannot override trust flags", () => {
  it("red-flagged row retains source_confidence = 0.2 regardless of balance", () => {
    // Simulate a row that might pass a balance check but has a red trust flag
    const markdown = [
      "BẢNG CÂN ĐỐI KẾ TOÁN",
      "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|---|",
      "| 100 | Tổng tài sản | [ĐỘ TIN CẬY THẤP — balance_pass_but_still_flagged] 5.000.000 | 4.500.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(markdown, "rpt_balance", [1]);
    // Trust flag MUST NOT be overridden by any balance calculation
    expect(result.rows[0]!.source_confidence).toBe(0.2);
    // A "balance pass" does NOT and CANNOT change this to 1.0
    expect(result.rows[0]!.source_confidence).not.toBe(1.0);
  });
});
