/**
 * FIX-BCTC-REFINE-HVN-Q1-UNITS-FLEET-DRAIN — TDD test suite
 *
 * Root cause: refinedMarkdownParser SECTION_HEADERS had Vietnamese-only patterns.
 * The refine subagent writes English H1 titles for bilingual PDFs:
 *   "# Income Statement Q1 2026"          → fell through to "general" (bug)
 *   "# Cash Flow Statement Q1 2026 ..."   → fell through to "general" (bug)
 *   "# Balance Sheet - Liabilities ..."   → fell through to "general" (bug)
 *   "# Cash and Cash Equivalents Position" → fell through to "general" (bug)
 *
 * Fix: add English patterns to SECTION_HEADERS (bilingual PDF support).
 *
 * AC:
 *   (a) English "Income Statement" heading → rows classified as income_statement
 *   (b) English "Cash Flow Statement" heading → rows classified as cash_flow
 *   (c) English "Cash and Cash Equivalents Position" heading → rows classified as cash_flow
 *   (d) English "Balance Sheet" heading → rows classified as balance_sheet
 *   (e) Vietnamese patterns still work (regression guard)
 *   (f) Mixed VN + EN sections in one markdown → correct per-section classification
 *   (g) Unrecognised heading → falls through to "general" (unchanged default)
 */

import { describe, it, expect } from "bun:test";
import { parseRefinedMarkdown } from "../application/utils/refinedMarkdownParser.js";

const REPORT_ID = "hvn-q1-2026-test-fixture-en-section";

// ─────────────────────────────────────────────────────────────────────────────
// (a) English "Income Statement" heading → income_statement
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REFINE English section detection — (a) Income Statement", () => {
  it("(a1) '# Income Statement Q1 2026' → rows classified as income_statement", () => {
    const md = [
      "# Income Statement Q1 2026",
      "| Item | Q1 2026 | Q1 2025 |",
      "|---|---|---|",
      "| Revenue | 24.633.573.763.517 | 29.083.518.660.338 |",
      "| Net Profit | 3.043.523.194.118 | 3.948.257.153.570 |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, REPORT_ID, [6]);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every(r => r.statement_section === "income_statement")).toBe(true);
  });

  it("(a2) uppercase 'INCOME STATEMENT' → income_statement (case-insensitive)", () => {
    const md = [
      "# INCOME STATEMENT",
      "| Item | Q1 2026 | Q1 2025 |",
      "|---|---|---|",
      "| Revenue | 1.000 | 2.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, REPORT_ID, [1]);
    expect(result.rows.every(r => r.statement_section === "income_statement")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (b) English "Cash Flow Statement" heading → cash_flow
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REFINE English section detection — (b) Cash Flow Statement", () => {
  it("(b1) '# Cash Flow Statement Q1 2026 (Indirect Method)' → rows classified as cash_flow", () => {
    const md = [
      "# Cash Flow Statement Q1 2026 (Indirect Method)",
      "| Item | Q1 2026 | Q1 2025 |",
      "|---|---|---|",
      "| Profit before tax | 3.043.523.194.118 | 3.948.257.153.570 |",
      "| Depreciation | 500.000.000.000 | 450.000.000.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, REPORT_ID, [7]);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every(r => r.statement_section === "cash_flow")).toBe(true);
  });

  it("(b2) 'Statement of Cash Flows' → cash_flow", () => {
    const md = [
      "# Statement of Cash Flows",
      "| Item | Current | Prior |",
      "|---|---|---|",
      "| Operating CF | 1.000.000 | 900.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, REPORT_ID, [1]);
    expect(result.rows.every(r => r.statement_section === "cash_flow")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (c) English "Cash and Cash Equivalents Position" heading → cash_flow
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REFINE English section detection — (c) Cash and Cash Equivalents Position", () => {
  it("(c1) '# Cash and Cash Equivalents Position' → rows classified as cash_flow", () => {
    const md = [
      "# Cash and Cash Equivalents Position",
      "| Item | Q1 2026 | Q1 2025 |",
      "|---|---|---|",
      "| Beginning cash balance | 7.496.552.598.951 | 2.126.719.657.522 |",
      "| Net increase | 1.200.000.000.000 | 500.000.000.000 |",
      "| Ending cash balance | 8.696.552.598.951 | 2.626.719.657.522 |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, REPORT_ID, [8]);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every(r => r.statement_section === "cash_flow")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (d) English "Balance Sheet" heading → balance_sheet
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REFINE English section detection — (d) Balance Sheet", () => {
  it("(d1) '# Balance Sheet - Liabilities and Equity Q1 2026' → balance_sheet", () => {
    const md = [
      "# Balance Sheet - Liabilities and Equity Q1 2026",
      "| Code | Item | End Period | Begin Period |",
      "|---|---|---|---|",
      "| 300 | Total Liabilities | 9.939.070.524.531 | 10.500.000.000.000 |",
      "| 400 | Equity | 1.160.067.165.196 | 1.100.000.000.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, REPORT_ID, [5]);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every(r => r.statement_section === "balance_sheet")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (e) Vietnamese patterns still work (regression guard)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REFINE Vietnamese section patterns — (e) regression guard", () => {
  it("(e1) Vietnamese BẢNG CÂN ĐỐI KẾ TOÁN → balance_sheet", () => {
    const md = [
      "# Bảng Cân Đối Kế Toán (Phía Tài Sản) - Quý 1 2026",
      "| Mã Số | Chỉ Tiêu | Số Cuối Kỳ | Số Đầu Kỳ |",
      "|---|---|---|---|",
      "| 100 | A. TÀI SẢN NGẮN HẠN | 5.000.000 | 4.500.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, REPORT_ID, [4]);
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.every(r => r.statement_section === "balance_sheet")).toBe(true);
  });

  it("(e2) Vietnamese BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH → income_statement", () => {
    const md = [
      "# Báo Cáo Kết Quả Hoạt Động Kinh Doanh Quý 1",
      "| Chỉ Tiêu | Q1 2026 | Q1 2025 |",
      "|---|---|---|",
      "| Doanh thu | 24.000.000 | 20.000.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, REPORT_ID, [1]);
    expect(result.rows.every(r => r.statement_section === "income_statement")).toBe(true);
  });

  it("(e3) Vietnamese BÁO CÁO LƯU CHUYỂN TIỀN TỆ → cash_flow", () => {
    const md = [
      "# Báo Cáo Lưu Chuyển Tiền Tệ",
      "| Chỉ Tiêu | Q1 2026 | Q1 2025 |",
      "|---|---|---|",
      "| Lợi nhuận trước thuế | 3.000.000 | 2.800.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, REPORT_ID, [1]);
    expect(result.rows.every(r => r.statement_section === "cash_flow")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (f) Mixed VN + EN sections in one markdown → correct per-section classification
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REFINE mixed VN/EN sections — (f) per-section classification", () => {
  it("(f1) balance_sheet rows then income_statement rows in same unit", () => {
    const md = [
      "# Balance Sheet",
      "| Code | Item | End Period | Begin Period |",
      "|---|---|---|---|",
      "| 100 | Total Assets | 10.000.000 | 9.500.000 |",
      "",
      "# Income Statement",
      "| Item | Q1 2026 | Q1 2025 |",
      "|---|---|---|",
      "| Revenue | 5.000.000 | 4.000.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, REPORT_ID, [1]);
    const bsRows = result.rows.filter(r => r.statement_section === "balance_sheet");
    const isRows = result.rows.filter(r => r.statement_section === "income_statement");
    expect(bsRows.length).toBeGreaterThan(0);
    expect(isRows.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// (g) Unknown heading → "general" default (unchanged behaviour)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-REFINE unknown headings — (g) default to general", () => {
  it("(g1) unrecognised H1 heading → rows classified as general", () => {
    const md = [
      "# Notes to Financial Statements",
      "| Detail | Amount |",
      "|---|---|",
      "| Investment | 1.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, REPORT_ID, [1]);
    // "Notes to Financial Statements" does NOT match any of the English patterns
    // (no "Balance Sheet", "Income Statement", or "Cash Flow Statement")
    expect(result.rows.every(r => r.statement_section === "general")).toBe(true);
  });

  it("(g2) document-level notes heading → general", () => {
    const md = [
      "# Company Overview - Notes",
      "| Subject | Detail |",
      "|---|---|",
      "| Entity | Vietnam Airlines |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, REPORT_ID, [1]);
    expect(result.rows.every(r => r.statement_section === "general")).toBe(true);
  });
});
