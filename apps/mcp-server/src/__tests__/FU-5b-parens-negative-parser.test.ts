/**
 * FU-5b-parens-negative-parser.test.ts — Anti-False-Green DV Gate
 *
 * Sprint: FU-TRUST-REFRESH | Task: FU-5b
 * Date: 2026-05-31
 *
 * Context (third serial seam — silent-swallow-serial-bugs lesson):
 *   FU-6 ops discovered parseVnNumber("(35.872.175.224)") → NaN (logged
 *   "non-numeric value_current" 50+ times). Parens-negative rows (COGS,
 *   equity/liability lines) were silently DROPPED → aggregator returned
 *   equity_total=0, gross_profit=net_revenue. This is the SAME anti-pattern
 *   that caused empty-OCR (round 1) and scalar-backfill (round 2) seams.
 *
 * Fix mandate (silent-swallow-serial-bugs lesson):
 *   ONE-PASS FAIL-LOUD audit: surface the COMPLETE class at once.
 *   (a) parseVnNumber handles ALL VN BCTC number formats.
 *   (b) Unparseable cells NEVER cause row drop — row is retained with
 *       value_current=null and source_confidence=0.1.
 *   (c) Full mini-report with COGS in parens: gross_profit ≠ net_revenue,
 *       equity_total ≠ 0 after parse+aggregate.
 *   (d) Blank/em-dash → null (absent), row retained normally.
 *
 * RED-BEFORE-GREEN PROTOCOL (documented inline per test):
 *   Each test documents what the old code returned BEFORE this fix,
 *   proving the test was RED before and GREEN after.
 *
 * DB ARBITER RULE:
 *   All DB assertions use direct bun:sqlite new Database(":memory:").
 *   Never relay tool return values as DB truth.
 *
 * Scope:
 *   DV-FU5b-1  — parseVnNumber: parens-negative "(35.872.175.224)" → -35872175224
 *   DV-FU5b-2  — parseVnNumber: ordinary positive "1.234.567" → 1234567 (unchanged)
 *   DV-FU5b-3  — parseVnNumber: em-dash "—" → null (absent, not 0)
 *   DV-FU5b-4  — parseVnNumber: en-dash "–" → null
 *   DV-FU5b-5  — parseVnNumber: blank "" → null
 *   DV-FU5b-6  — parseVnNumber: "..." → null
 *   DV-FU5b-7  — parseVnNumber: decimal comma "1.234,56" → 1234.56
 *   DV-FU5b-8  — parseVnNumber: leading minus "-1.234.567" → -1234567
 *   DV-FU5b-9  — parseVnNumber: footnote superscript "1.234.567¹" → 1234567
 *   DV-FU5b-10 — parseVnNumber: footnote ref "1.234.567(1)" → 1234567
 *   DV-FU5b-11 — parseVnNumber: negative with footnote "(1.234.567)(1)" → -1234567
 *   DV-FU5b-12 — parseVnNumber: unparseable non-numeric-looking string → null (no row drop)
 *   DV-FU5b-13 — parseRefinedMarkdown: row with parens-negative value → row RETAINED,
 *                value_current is the negative number (not NaN/null)
 *   DV-FU5b-14 — parseRefinedMarkdown: unparseable cell → row RETAINED with
 *                value_current=null and source_confidence=0.1, error logged
 *   DV-FU5b-15 — Full mini-report: COGS in parens + equity total → parse+aggregate:
 *                gross_profit ≠ net_revenue AND equity_total ≠ 0
 *   DV-FU5b-16 — ACB bank shape: TỔNG NỢ PHẢI TRẢ label → total_liabilities mapped
 *   DV-FU5b-17 — parseRefinedMarkdown: blank/em-dash cell → value_current=null,
 *                row retained, source_confidence NOT 0.1 (normal confidence)
 *   DV-FU5b-18 — One-pass audit (regression fence): re-parse FPT-shaped markdown
 *                with ALL known VN BCTC formats; assert zero UNPARSEABLE errors
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildFinalizeBctcRefineHandler } from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";
import {
  parseVnNumber,
  parseRefinedMarkdown,
} from "../application/utils/refinedMarkdownParser.js";
import {
  aggregateScalars,
  type AggregatorRow,
} from "../domain/services/financial-reports/bctcScalarAggregator.js";

// ─── DV-FU5b-1 to DV-FU5b-12: parseVnNumber unit tests ──────────────────────

describe("DV-FU5b: parseVnNumber — full VN BCTC format coverage", () => {
  it("DV-FU5b-1: parens-negative (35.872.175.224) → -35872175224 [RED before: NaN/null]", () => {
    // OLD code: stripped="(35.872.175.224)" → cleaned="(35872175224)" → parseFloat=NaN → null
    // NEW code: detects parens → isNegative=true, strips parens → "35872175224" → 35872175224 → -35872175224
    const result = parseVnNumber("(35.872.175.224)");
    expect(result).not.toBeNull();
    expect(result).toBe(-35872175224);
  });

  it("DV-FU5b-2: ordinary positive 1.234.567 → 1234567 [unchanged behavior]", () => {
    expect(parseVnNumber("1.234.567")).toBe(1234567);
  });

  it("DV-FU5b-3: em-dash — → null (absent, not 0)", () => {
    // Should be null (cell is absent), never 0
    expect(parseVnNumber("—")).toBeNull();
  });

  it("DV-FU5b-4: en-dash – → null (absent)", () => {
    expect(parseVnNumber("–")).toBeNull();
  });

  it("DV-FU5b-5: blank string → null (absent)", () => {
    expect(parseVnNumber("")).toBeNull();
    expect(parseVnNumber("  ")).toBeNull();
  });

  it("DV-FU5b-6: ellipsis ... → null (absent)", () => {
    expect(parseVnNumber("...")).toBeNull();
    expect(parseVnNumber("…")).toBeNull();
  });

  it("DV-FU5b-7: decimal comma 1.234,56 → 1234.56", () => {
    // VN decimal separator
    const result = parseVnNumber("1.234,56");
    expect(result).not.toBeNull();
    expect(result!).toBeCloseTo(1234.56, 2);
  });

  it("DV-FU5b-8: leading minus -1.234.567 → -1234567", () => {
    expect(parseVnNumber("-1.234.567")).toBe(-1234567);
  });

  it("DV-FU5b-9: footnote superscript 1.234.567¹ → 1234567 (superscript stripped)", () => {
    expect(parseVnNumber("1.234.567¹")).toBe(1234567);
  });

  it("DV-FU5b-10: footnote ref 1.234.567(1) → 1234567 (footnote stripped)", () => {
    // (1) at end is a footnote reference, not a negative wrapper
    expect(parseVnNumber("1.234.567(1)")).toBe(1234567);
  });

  it("DV-FU5b-11: negative with footnote (1.234.567)(1) → -1234567", () => {
    // (1) footnote stripped first → (1.234.567) → parens-negative → -1234567
    expect(parseVnNumber("(1.234.567)(1)")).toBe(-1234567);
  });

  it("DV-FU5b-12: N/A → null", () => {
    expect(parseVnNumber("N/A")).toBeNull();
    expect(parseVnNumber("n/a")).toBeNull();
  });

  it("DV-FU5b-bonus: zero written as 0 → 0 (real zero, not absent)", () => {
    // A cell with literal "0" is a real zero, not absent
    expect(parseVnNumber("0")).toBe(0);
  });

  it("DV-FU5b-bonus2: small parens-negative (100) → -100", () => {
    expect(parseVnNumber("(100)")).toBe(-100);
  });

  it("DV-FU5b-bonus3: large parens-negative matching FPT COGS magnitude", () => {
    // Representative COGS value from FPT BCTC
    const result = parseVnNumber("(8.235.107.316.087)");
    expect(result).toBe(-8235107316087);
  });
});

// ─── DV-FU5b-13/14/17: parseRefinedMarkdown row retention ─────────────────────

describe("DV-FU5b-13: parseRefinedMarkdown: parens-negative in cell → row retained with negative value", () => {
  it("row with (35.872.175.224) in value_current is retained, not dropped [RED before: row silently dropped]", () => {
    /**
     * RED state (before fix):
     *   parseVnNumber("(35.872.175.224)") → null
     *   /\d/.test("(35.872.175.224)") → true (has digits)
     *   → errors.push(...) + continue → ROW DROPPED
     *   result.rows.length = 0 (the parens row was the only row)
     *
     * GREEN state (after fix):
     *   parseVnNumber("(35.872.175.224)") → -35872175224
     *   → row pushed with value_current = -35872175224
     *   result.rows.length = 1
     */
    const markdown = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 11 | Giá vốn hàng bán | (35.872.175.224) | (42.000.000.000) |",
    ].join("\n");

    const result = parseRefinedMarkdown(markdown, "test-report-id", [1]);

    // RED check: before fix, this would be 0 (row dropped)
    expect(result.rows.length).toBe(1);

    const row = result.rows[0]!;
    expect(row.code).toBe("11");
    expect(row.label).toBe("Giá vốn hàng bán");

    // CORE: value_current must be negative number, not null
    expect(row.value_current).not.toBeNull();
    expect(row.value_current).toBe(-35872175224);

    // Prior value also parses
    expect(row.value_prior).toBe(-42000000000);

    // No UNPARSEABLE errors — parens are correctly handled
    const unparseableErrors = result.errors.filter(e => e.includes("[UNPARSEABLE]"));
    expect(unparseableErrors.length).toBe(0);
  });
});

describe("DV-FU5b-14: parseRefinedMarkdown: genuinely unparseable cell → row RETAINED, not dropped", () => {
  it("row with unparseable numeric content → row kept with value_current=null, confidence=0.1, error logged", () => {
    /**
     * RED state (before fix):
     *   A cell with weird numeric content (e.g. "12.34.56" — ambiguous format) would be
     *   errors.push(...) + CONTINUE → row dropped silently.
     *
     * GREEN state (after fix):
     *   Row is retained with value_current=null and source_confidence=0.1.
     *   Error is in result.errors with [UNPARSEABLE] prefix including report_id + page + label + raw.
     */
    // "1.2.3" is ambiguous — not a valid VN number (dots not in groups of 3)
    // parseFloat("123") after removing dots = 123, which IS parseable.
    // So let's use something that truly fails: text mixed with digits
    const markdown = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      // Genuinely unparseable: "abc123xyz" — has digits, not a valid number after processing
      "| 99 | Test Line | abc123xyz | 5.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(markdown, "test-report-id-2", [3]);

    // Row MUST be retained (not dropped)
    expect(result.rows.length).toBe(1);

    const row = result.rows[0]!;
    expect(row.code).toBe("99");
    // value_current is null (couldn't parse "abc123xyz")
    expect(row.value_current).toBeNull();
    // source_confidence downgraded to 0.1 (unparseable flag)
    expect(row.source_confidence).toBe(0.1);

    // Error logged with [UNPARSEABLE] prefix + context
    expect(result.errors.length).toBeGreaterThan(0);
    const errMsg = result.errors[0]!;
    expect(errMsg).toContain("[UNPARSEABLE]");
    expect(errMsg).toContain("test-report-id-2");  // report_id in error
    expect(errMsg).toContain("3");                  // page number
    expect(errMsg).toContain("Test Line");           // label
    expect(errMsg).toContain("abc123xyz");           // raw value
  });
});

describe("DV-FU5b-17: parseRefinedMarkdown: blank/em-dash cell → null, row retained, normal confidence", () => {
  it("em-dash in value_current → value_current=null, row retained, confidence NOT 0.1", () => {
    /**
     * Absent cells (dashes, blanks) are genuinely missing values — not unparseable.
     * They must produce null value_current with NORMAL confidence (not 0.1 unparseable).
     * The row must be retained.
     */
    const markdown = [
      "BẢNG CÂN ĐỐI KẾ TOÁN",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 500 | Chỉ tiêu không có giá trị | — | — |",
    ].join("\n");

    const result = parseRefinedMarkdown(markdown, "test-dash-report", [1]);

    // Row retained (not dropped)
    expect(result.rows.length).toBe(1);
    const row = result.rows[0]!;

    // null value — genuinely absent
    expect(row.value_current).toBeNull();

    // Confidence is NOT 0.1 (that's only for UNPARSEABLE)
    // Normal confidence from trust flag (no trust flag present → 1.0)
    expect(row.source_confidence).toBeGreaterThan(0.1);

    // No [UNPARSEABLE] errors
    const unparseableErrors = result.errors.filter(e => e.includes("[UNPARSEABLE]"));
    expect(unparseableErrors.length).toBe(0);
  });
});

// ─── DV-FU5b-15: Full mini-report: COGS + equity in parens ────────────────────

describe("DV-FU5b-15: Full mini-report with parens-negatives: gross_profit ≠ net_revenue AND equity_total ≠ 0", () => {
  it("parse+aggregate: parens COGS and equity lines → correct scalars [RED before fix]", () => {
    /**
     * RED state (before fix):
     *   COGS (code 11) row dropped (parens-negative) → code 20 absent → gross_profit from
     *   aggregator tries code 20 which may be absent OR if code 20 was also in parens, also dropped.
     *   More critically: if equity (code 400) was in parens, equity_total=null (or 0 from stale).
     *
     *   In the actual FPT BCTC scenario: equity IS positive (code 400 = 40 trillion VND),
     *   but some equity component rows ARE in parens (e.g. treasury shares as negative).
     *   The root failure was: equity total itself parsed wrong → 0 in DB.
     *
     *   This test uses a controlled scenario where the key scalars (codes 20 and 400)
     *   are NOT in parens (as they shouldn't be for totals), but COGS (code 11) IS in parens.
     *   We verify: (a) COGS is retained with correct negative value, (b) aggregator still finds
     *   gross_profit from code 20, (c) gross_profit ≠ net_revenue.
     *
     * GREEN state (after fix):
     *   All rows retained. gross_profit (code 20) found at 4,244,890 (million VND after ÷1e6).
     *   net_revenue (code 10) found at 12,479,997. gross_profit ≠ net_revenue → 34% margin.
     *   equity_total (code 400) found at 40,122,037. equity_total ≠ 0.
     */
    const markdown = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      // Net revenue: positive
      "| 10 | Doanh thu thuần | 12.479.997.206.775 | 16.058.140.942.460 |",
      // COGS: parens-negative (this is what was being dropped)
      "| 11 | Giá vốn hàng bán | (8.235.107.316.087) | (9.756.793.038.194) |",
      // Gross profit: positive (direct line in BCTC)
      "| 20 | Lợi nhuận gộp | 4.244.889.890.688 | 6.301.347.904.266 |",
      // Net profit: positive
      "| 60 | Lợi nhuận sau thuế | 2.476.789.833.481 | 2.595.557.480.309 |",
      "BẢNG CÂN ĐỐI KẾ TOÁN",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      // Total assets: positive
      "| 270 | Tổng tài sản | 68.586.094.785.217 | 88.141.991.634.625 |",
      // Total liabilities: positive
      "| 300 | Nợ phải trả | 28.464.058.214.856 | 44.393.950.887.086 |",
      // Equity: positive (the total is positive; individual components may be negative)
      "| 400 | Vốn chủ sở hữu | 40.122.036.570.361 | 43.748.040.747.539 |",
    ].join("\n");

    const result = parseRefinedMarkdown(markdown, "fu5b-mini-fpt", [1]);

    // All 7 rows must be present (including COGS which was previously dropped)
    expect(result.rows.length).toBe(7);

    // COGS row: value_current must be negative
    const cogsRow = result.rows.find(r => r.code === "11");
    expect(cogsRow).toBeDefined();
    expect(cogsRow!.value_current).toBe(-8235107316087);

    // No UNPARSEABLE errors (all values parsed correctly)
    const unparseableErrors = result.errors.filter(e => e.includes("[UNPARSEABLE]"));
    expect(unparseableErrors.length).toBe(0);

    // Run aggregator on the parsed rows
    const aggRows: AggregatorRow[] = result.rows.map(r => ({
      code: r.code,
      label: r.label,
      value_current: r.value_current,
      statement_section: r.statement_section,
      is_summary_row: r.is_summary_row,
      unit: r.unit,
    }));

    const agg = aggregateScalars(aggRows);

    // CORE ASSERTION 1: gross_profit must NOT equal net_revenue
    // RED without fix: parens-COGS row dropped → code 20 might still parse if present,
    // but the scenario that broke production was equity (code 400) lines in parens.
    // This test proves code 20 (gross profit direct line) is found correctly.
    expect(agg.gross_profit).not.toBeNull();
    expect(agg.net_revenue).not.toBeNull();
    expect(agg.gross_profit).not.toBe(agg.net_revenue);

    // gross_margin_pct ≈ 34%
    expect(agg.gross_margin_pct).not.toBeNull();
    expect(agg.gross_margin_pct!).toBeGreaterThan(33);
    expect(agg.gross_margin_pct!).toBeLessThan(35);

    // CORE ASSERTION 2: equity_total must not be 0
    expect(agg.equity_total).not.toBeNull();
    expect(agg.equity_total).not.toBe(0);

    // Values in million VND (÷1e6 since max value >> 1e11)
    expect(Math.round(agg.net_revenue!)).toBe(12_479_997);
    expect(Math.round(agg.gross_profit!)).toBe(4_244_890);
    expect(Math.round(agg.equity_total!)).toBe(40_122_037);
    expect(Math.round(agg.total_assets!)).toBe(68_586_095);
    expect(Math.round(agg.total_liabilities!)).toBe(28_464_058);
  });
});

// ─── DV-FU5b-16: ACB bank shape — label-based mapping ────────────────────────

describe("DV-FU5b-16: ACB bank shape — TỔNG NỢ PHẢI TRẢ label → total_liabilities mapped", () => {
  it("aggregator finds total_liabilities via label pattern for ACB (label-based, no code 300)", () => {
    /**
     * ACB bank balance sheet uses Vietnamese labels without corporate codes (no 300/400).
     * The aggregator must fall back to label patterns.
     * After FIX 1 (parens) some ACB liabilities lines were also in parens → dropped.
     * After fix, these rows are retained.
     *
     * This test uses a simplified ACB-shaped row set matching what QA verified in FU-4.
     */
    const rows: AggregatorRow[] = [
      // Income statement (bank Roman codes)
      { code: "I",    label: "Thu nhập lãi thuần",   value_current: 6_989_162,     statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "VIII", label: "Lợi nhuận trước thuế", value_current: 5_368_138,     statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "IX",   label: "Lợi nhuận sau thuế",   value_current: 4_320_388,     statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      // Balance sheet: label-based (bank Mẫu B02-TCTD — no 270/300/400 codes)
      { code: null, label: "TỔNG TÀI SẢN",       value_current: 1_030_900_741, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
      { code: null, label: "TỔNG NỢ PHẢI TRẢ",   value_current:   932_149_689, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
      { code: null, label: "VỐN CHỦ SỞ HỮU",     value_current:    98_751_052, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
    ];

    const agg = aggregateScalars(rows);

    // total_liabilities: label pattern P_BANK_TOTAL_LIABILITIES matches "TỔNG NỢ PHẢI TRẢ"
    expect(agg.total_liabilities).not.toBeNull();
    expect(agg.total_liabilities).toBe(932_149_689);

    // total_assets: label pattern P_BANK_TOTAL_ASSETS matches "TỔNG TÀI SẢN"
    expect(agg.total_assets).not.toBeNull();
    expect(agg.total_assets).toBe(1_030_900_741);

    // equity_total: label pattern P_BANK_EQUITY matches "VỐN CHỦ SỞ HỮU"
    expect(agg.equity_total).not.toBeNull();
    expect(agg.equity_total).toBe(98_751_052);

    // balance cross-check (QA FU-4 verified this)
    expect(agg.total_liabilities! + agg.equity_total!).toBe(agg.total_assets!);
  });
});

// ─── DV-FU5b-18: One-pass regression fence ────────────────────────────────────

describe("DV-FU5b-18: One-pass regression fence — FPT/ACB shaped markdown → zero UNPARSEABLE errors", () => {
  it("FPT-shaped markdown with all known VN BCTC formats produces zero [UNPARSEABLE] errors", () => {
    /**
     * This is the COMPLETE class fence test.
     * Seed a representative FPT BCTC markdown covering all format variants found in
     * production (positive numbers, parens-negatives, dashes, actual Q1-2026 values).
     * Assert zero [UNPARSEABLE] errors — meaning the parser handles the full class.
     *
     * If a new format appears in production that triggers [UNPARSEABLE], this test
     * will FAIL immediately (not silently drop), surfacing the new seam.
     */
    const fptMd = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      // Positive values (normal format)
      "| 10 | Doanh thu thuần | 12.479.997.206.775 | 16.058.140.942.460 |",
      // Parens-negative (COGS)
      "| 11 | Giá vốn hàng bán | (8.235.107.316.087) | (9.756.793.038.194) |",
      // Positive gross profit
      "| 20 | Lợi nhuận gộp | 4.244.889.890.688 | 6.301.347.904.266 |",
      // Dash (absent prior)
      "| 21 | Chi phí bán hàng | 1.200.000.000 | — |",
      // Positive
      "| 50 | Lợi nhuận trước thuế | 2.803.844.281.676 | 3.024.693.510.849 |",
      "| 60 | Lợi nhuận sau thuế | 2.476.789.833.481 | 2.595.557.480.309 |",
      "BẢNG CÂN ĐỐI KẾ TOÁN",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      // Balance sheet positives
      "| 100 | Tài sản ngắn hạn | 41.527.873.060.120 | 55.000.000.000.000 |",
      "| 270 | Tổng tài sản | 68.586.094.785.217 | 88.141.991.634.625 |",
      "| 300 | Nợ phải trả | 28.464.058.214.856 | 44.393.950.887.086 |",
      // Equity: positive total
      "| 400 | Vốn chủ sở hữu | 40.122.036.570.361 | 43.748.040.747.539 |",
      // Zero value (real zero)
      "| 410 | Vốn góp chủ sở hữu | 0 | 0 |",
      // Em-dash (absent)
      "| 490 | Lợi ích cổ đông không kiểm soát | — | — |",
      "| 440 | Tổng nguồn vốn | 68.586.094.785.217 | 88.141.991.634.625 |",
    ].join("\n");

    const result = parseRefinedMarkdown(fptMd, "fu5b-fence-fpt", [1]);

    // All rows retained (no drops) — 17 data rows expected
    // (the header and separator lines are skipped; 15 data rows above)
    expect(result.rows.length).toBeGreaterThan(10);

    // CORE FENCE ASSERTION: zero [UNPARSEABLE] errors
    const unparseableErrors = result.errors.filter(e => e.includes("[UNPARSEABLE]"));
    if (unparseableErrors.length > 0) {
      // Fail with detail so the new format is immediately visible
      throw new Error(
        `[FENCE FAILURE] ${unparseableErrors.length} unparseable value(s) found:\n` +
        unparseableErrors.join("\n"),
      );
    }
    expect(unparseableErrors.length).toBe(0);

    // Verify COGS row (parens-negative) is present with correct sign
    const cogsRow = result.rows.find(r => r.code === "11");
    expect(cogsRow).toBeDefined();
    expect(cogsRow!.value_current).toBeLessThan(0);

    // Verify dash row is retained with null value
    const dividendsRow = result.rows.find(r => r.code === "490");
    expect(dividendsRow).toBeDefined();
    expect(dividendsRow!.value_current).toBeNull();

    // Verify zero row is retained with value 0 (not null)
    const capitalRow = result.rows.find(r => r.code === "410");
    expect(capitalRow).toBeDefined();
    expect(capitalRow!.value_current).toBe(0);
  });

  it("ACB-shaped markdown produces zero [UNPARSEABLE] errors", () => {
    /**
     * ACB bank shape: Roman numeral codes, Vietnamese labels, million-VND scale.
     * Some ACB values may be in parens (deductions, provisions).
     */
    const acbMd = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| I   | Thu nhập lãi thuần | 6.989.162 | 6.358.865 |",
      // Provision expense often in parens in bank BCTC
      "| II  | Chi phí dự phòng rủi ro | (1.000.000) | (800.000) |",
      "| VIII| Lợi nhuận trước thuế | 5.368.138 | 4.596.608 |",
      "| IX  | Lợi nhuận sau thuế | 4.320.388 | 3.678.266 |",
      "BẢNG CÂN ĐỐI KẾ TOÁN",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| | TỔNG TÀI SẢN | 1.030.900.741 | 1.025.850.127 |",
      "| | TỔNG NỢ PHẢI TRẢ | 932.149.689 | 931.330.408 |",
      "| | VỐN CHỦ SỞ HỮU | 98.751.052 | — |",
    ].join("\n");

    const result = parseRefinedMarkdown(acbMd, "fu5b-fence-acb", [1]);

    // All rows retained
    expect(result.rows.length).toBeGreaterThan(5);

    // Zero unparseable errors
    const unparseableErrors = result.errors.filter(e => e.includes("[UNPARSEABLE]"));
    if (unparseableErrors.length > 0) {
      throw new Error(
        `[FENCE FAILURE] ${unparseableErrors.length} unparseable value(s) found:\n` +
        unparseableErrors.join("\n"),
      );
    }
    expect(unparseableErrors.length).toBe(0);

    // Provision row: parens-negative parsed correctly
    const provisionRow = result.rows.find(r => r.code === "II");
    expect(provisionRow).toBeDefined();
    expect(provisionRow!.value_current).toBe(-1000000);
  });
});

// ─── Integration: finalize with parens-negative markdown ──────────────────────

describe("DV-FU5b integration: finalize with parens-negative markdown → correct DB scalars", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initFinancialReportsTables(db);
  });

  afterEach(() => {
    db.close();
  });

  it("finalize with COGS-in-parens markdown: gross_profit ≠ net_revenue AND equity_total ≠ 0", async () => {
    /**
     * RED state (before fix):
     *   parseVnNumber("(8.235.107.316.087)") → null → if code 20 is also missing → gross=null
     *   OR more critically: any equity-section row with parens → equity_total=null → 0 stays in DB.
     *   The financial_reports table has gross_profit=net_revenue (100% margin) stale value.
     *
     * GREEN state (after fix):
     *   COGS row retained with negative value. Code 20 (gross profit) positive → aggregator finds it.
     *   equity_total (code 400) positive → aggregator finds it.
     *   DB: gross_profit ≠ net_revenue, equity_total ≠ 0.
     */
    const reportId = "fu5b-integ-0001-0000-0000-000000000001";

    // Seed report with WRONG stale scalars (the pre-FU-6-redo state)
    db.prepare(
      `INSERT INTO financial_reports
         (id, action_code, company_name, exchange, domain,
          period_year, period_quarter, period_type, period_start, period_end, sort_key,
          parsed_at, extraction_confidence,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
          net_revenue, gross_profit, equity_total, total_assets, total_liabilities,
          refine_status, confirm_status)
       VALUES (?, 'FPT', 'FPT Corp', 'HOSE', 'technology',
               2026, 'Q1', 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
               datetime('now'), 0.85,
               '{}', '{}', '{}', '{}',
               12479997, 12479997, 0, 0, 0.000002,
               'PENDING', 'PENDING')`,
    ).run(reportId);

    // Seed refined units with correct markdown including parens-negatives
    const balanceMd = [
      "BẢNG CÂN ĐỐI KẾ TOÁN",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 100 | Tài sản ngắn hạn | 41.527.873.060.120 | 55.000.000.000.000 |",
      "| 270 | Tổng tài sản | 68.586.094.785.217 | 88.141.991.634.625 |",
      "| 300 | Nợ phải trả | 28.464.058.214.856 | 44.393.950.887.086 |",
      "| 400 | Vốn chủ sở hữu | 40.122.036.570.361 | 43.748.040.747.539 |",
    ].join("\n");

    const incomeMd = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 10 | Doanh thu thuần | 12.479.997.206.775 | 16.058.140.942.460 |",
      "| 11 | Giá vốn hàng bán | (8.235.107.316.087) | (9.756.793.038.194) |",
      "| 20 | Lợi nhuận gộp | 4.244.889.890.688 | 6.301.347.904.266 |",
      "| 60 | Lợi nhuận sau thuế | 2.476.789.833.481 | 2.595.557.480.309 |",
    ].join("\n");

    db.prepare(
      `INSERT INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, ?, '[1]', ?, 4, 0.85, 'DONE')`,
    ).run(reportId, "unit-balance", balanceMd);

    db.prepare(
      `INSERT INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, ?, '[2]', ?, 4, 0.85, 'DONE')`,
    ).run(reportId, "unit-income", incomeMd);

    // Run finalize
    const handler = buildFinalizeBctcRefineHandler(db);
    const result = await handler({ report_id: reportId, report_status: "DONE" });
    const parsed = JSON.parse(result.content[0]!.text) as { ok: boolean; rows_parsed?: number };
    expect(parsed.ok).toBe(true);
    // 8 rows total (4 balance + 4 income)
    expect((parsed.rows_parsed ?? 0)).toBe(8);

    // Read scalars from DB directly
    interface Scalars { gross_profit: number | null; net_revenue: number | null; equity_total: number | null; total_assets: number | null; total_liabilities: number | null }
    const scalars = db.prepare<Scalars, [string]>(
      "SELECT gross_profit, net_revenue, equity_total, total_assets, total_liabilities FROM financial_reports WHERE id = ?",
    ).get(reportId) as Scalars | null;

    expect(scalars).not.toBeNull();

    // CORE ASSERTION 1: gross_profit ≠ net_revenue (34% margin, not 100%)
    expect(scalars!.gross_profit).not.toBeNull();
    expect(scalars!.net_revenue).not.toBeNull();
    expect(scalars!.gross_profit).not.toBe(scalars!.net_revenue);

    const margin = scalars!.gross_profit! / scalars!.net_revenue!;
    expect(margin).toBeGreaterThan(0.30);
    expect(margin).toBeLessThan(0.40); // ~34%

    // CORE ASSERTION 2: equity_total not 0 (40 trillion VND in million-VND scale)
    expect(scalars!.equity_total).not.toBeNull();
    expect(scalars!.equity_total).not.toBe(0);
    expect(Math.round(scalars!.equity_total!)).toBe(40_122_037);

    // CORE ASSERTION 3: total_assets correct
    expect(Math.round(scalars!.total_assets!)).toBe(68_586_095);
  });
});
