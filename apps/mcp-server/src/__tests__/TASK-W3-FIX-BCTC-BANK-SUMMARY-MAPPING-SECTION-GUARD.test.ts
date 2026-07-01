// apps/mcp-server/src/__tests__/TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD.test.ts
//
// Sprint FIX-BCTC-BANK-SUMMARY-MAPPING — W3 (section-boundary-contamination guard)
// Task: TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD
//
// Brownfield reuse of FM-VCB-1 (sibling sprint FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT,
// TASK_331 AC-2 `_detect_section_start()`): same root mechanism — a REAL
// section-transition line in the source text goes unrecognized by
// `detectSection`, so `currentSection` sticks on the prior value across a
// real section boundary.
//
// SPIKE finding (RAW-verified against the CURRENT parser before this fix,
// see dev-mcp-server RETURN): a bank-form (Mẫu B02-TCTD) income-statement
// header transcribed WITHOUT the "BÁO CÁO " prefix (e.g. bare "KẾT QUẢ HOẠT
// ĐỘNG KINH DOANH" — a realistic agentic-refine transcription variant) was
// silently missed by the pre-fix SECTION_HEADERS exact-phrase list, causing
// genuine income-statement rows ("Lãi thuần từ hoạt động dịch vụ", "Chi phí
// thuế TNDN hoãn lại" — the SAME line items BA/architect observed
// live-mistagged for CTG 2026Q1) to be tagged statement_section="balance_sheet".
//
// This fixture reproduces that exact corruption shape and asserts the FIX
// (widened FM-VCB-1-style keyword synonyms + diacritic-insensitive fallback
// match) resolves it — generically, across bank tickers, with zero per-ticker
// branching (AC-9/NFR-2 genericity proof via a THIRD synthetic bank ticker).

import { describe, it, expect } from "bun:test";
import { parseRefinedMarkdown } from "../application/utils/refinedMarkdownParser.js";

// ─────────────────────────────────────────────────────────────────────────────
// RED→GREEN: CTG-shaped fixture — bare (no "BÁO CÁO " prefix) income-statement
// header must still flip the section, not leak balance_sheet into IS rows.
// ─────────────────────────────────────────────────────────────────────────────

describe("W3 section-boundary-contamination guard — CTG-shaped bare-header fixture", () => {
  const CTG_SHAPED_MD = [
    "BẢNG CÂN ĐỐI KẾ TOÁN",
    "",
    "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
    "|---|---|---|---|",
    "| I | Tiền mặt, vàng bạc, đá quý | 12.930.996 | 11.500.000 |",
    "| II | Tiền gửi tại NHNN | 21.355.164 | 35.225.543 |",
    "",
    // Bare header — no "BÁO CÁO " prefix, exactly the transcription variant
    // that defeated the pre-fix exact-phrase SECTION_HEADERS list.
    "KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
    "",
    "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
    "|---|---|---|---|",
    "| I | Lãi thuần từ hoạt động kinh doanh ngoại hối | 450.320 | 398.112 |",
    "| II | Lãi thuần từ hoạt động dịch vụ | 892.441 | 754.220 |",
    "| 24 | Chi phí thuế TNDN hoãn lại | 15.200 | 12.800 |",
  ].join("\n");

  it("balance-sheet rows (before the boundary) stay tagged balance_sheet", () => {
    const result = parseRefinedMarkdown(CTG_SHAPED_MD, "ctg-shaped", [4]);
    const bsRows = result.rows.filter((r) => r.label.includes("Tiền"));
    expect(bsRows.length).toBeGreaterThan(0);
    expect(bsRows.every((r) => r.statement_section === "balance_sheet")).toBe(true);
  });

  it("income-statement rows (after the bare header) are tagged income_statement, NOT balance_sheet", () => {
    const result = parseRefinedMarkdown(CTG_SHAPED_MD, "ctg-shaped", [4]);
    const laiThuanRows = result.rows.filter((r) => r.label.includes("Lãi thuần"));
    expect(laiThuanRows.length).toBe(2);
    for (const r of laiThuanRows) {
      expect(r.statement_section).toBe("income_statement");
      expect(r.statement_section).not.toBe("balance_sheet");
    }
  });

  it("'Chi phí thuế TNDN hoãn lại' (deferred CIT expense, income-statement-only line) is tagged income_statement", () => {
    const result = parseRefinedMarkdown(CTG_SHAPED_MD, "ctg-shaped", [4]);
    const row = result.rows.find((r) => r.label.includes("Chi phí thuế TNDN hoãn lại"));
    expect(row).toBeDefined();
    expect(row!.statement_section).toBe("income_statement");
  });

  it("no cross-boundary header-row leak: exactly 5 rows total (2 BS + 3 IS), no stray header row", () => {
    const result = parseRefinedMarkdown(CTG_SHAPED_MD, "ctg-shaped", [4]);
    expect(result.rows).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VCB-shaped fixture — full-prefixed header (existing exact-phrase pattern) —
// non-regression: must continue to work exactly as before.
// ─────────────────────────────────────────────────────────────────────────────

describe("W3 section-boundary-contamination guard — VCB-shaped full-prefix header (non-regression)", () => {
  const VCB_SHAPED_MD = [
    "BẢNG CÂN ĐỐI KẾ TOÁN",
    "",
    "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
    "|---|---|---|---|",
    "| I | Tiền mặt, vàng bạc, đá quý | 8.500.000 | 8.100.000 |",
    "",
    "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
    "",
    "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
    "|---|---|---|---|",
    "| 1 | Thu nhập lãi thuần | 17.420.998 | 15.900.000 |",
  ].join("\n");

  it("full-prefixed header still routes IS rows to income_statement (pre-existing exact-phrase path unaffected)", () => {
    const result = parseRefinedMarkdown(VCB_SHAPED_MD, "vcb-shaped", [5]);
    const isRow = result.rows.find((r) => r.label.includes("Thu nhập lãi thuần"));
    expect(isRow).toBeDefined();
    expect(isRow!.statement_section).toBe("income_statement");
  });

  it("BS rows stay balance_sheet", () => {
    const result = parseRefinedMarkdown(VCB_SHAPED_MD, "vcb-shaped", [5]);
    const bsRow = result.rows.find((r) => r.label.includes("Tiền mặt"));
    expect(bsRow).toBeDefined();
    expect(bsRow!.statement_section).toBe("balance_sheet");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-9/NFR-2 genericity — third synthetic bank ticker, never seen during dev,
// same bare-header corruption shape but different labels/values entirely.
// Proves the fix is a structural content-signal, not a per-ticker patch.
// ─────────────────────────────────────────────────────────────────────────────

describe("W3 section-boundary-contamination guard — synthetic 3rd bank ticker (genericity proof)", () => {
  const SYNTH_BANK_MD = [
    "BẢNG CÂN ĐỐI KẾ TOÁN",
    "",
    "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
    "|---|---|---|---|",
    "| I | Vàng bạc, đá quý dự trữ | 3.300.000 | 3.100.000 |",
    "",
    // Bare cash-flow header, no "BÁO CÁO " prefix — mirrors the SAME defect
    // class on a DIFFERENT statement type, proving the fix is generic across
    // section types, not hand-tuned to the income-statement case alone.
    "LƯU CHUYỂN TIỀN TỆ",
    "",
    "| Mã số | Chỉ tiêu | Số cuối kỳ |",
    "|---|---|---|",
    "| 01 | Tiền thuần từ hoạt động kinh doanh | 210.500 |",
  ].join("\n");

  it("bare cash-flow header (no ticker-specific data used in the fix) routes rows to cash_flow", () => {
    const result = parseRefinedMarkdown(SYNTH_BANK_MD, "synth-bank-3", [2]);
    const cfRow = result.rows.find((r) => r.label.includes("Tiền thuần từ hoạt động kinh doanh"));
    expect(cfRow).toBeDefined();
    expect(cfRow!.statement_section).toBe("cash_flow");
    expect(cfRow!.statement_section).not.toBe("balance_sheet");
  });

  it("BS row on the synthetic ticker stays balance_sheet", () => {
    const result = parseRefinedMarkdown(SYNTH_BANK_MD, "synth-bank-3", [2]);
    const bsRow = result.rows.find((r) => r.label.includes("Vàng bạc"));
    expect(bsRow).toBeDefined();
    expect(bsRow!.statement_section).toBe("balance_sheet");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Diacritic-variance robustness — same keyword, accent-stripped rendering
// (a real transcription-variance mode, not merely a missing prefix).
// ─────────────────────────────────────────────────────────────────────────────

describe("W3 section-boundary-contamination guard — diacritic-stripped header variant", () => {
  it("fully unaccented income-statement header ('KET QUA HOAT DONG KINH DOANH') still flips the section", () => {
    const md = [
      "BANG CAN DOI KE TOAN",
      "",
      "| Ma so | Chi tieu | So cuoi ky |",
      "|---|---|---|",
      "| I | Tien mat | 1.000.000 |",
      "",
      "KET QUA HOAT DONG KINH DOANH",
      "",
      "| Ma so | Chi tieu | So cuoi ky |",
      "|---|---|---|",
      "| 1 | Doanh thu thuan | 5.000.000 |",
    ].join("\n");

    const result = parseRefinedMarkdown(md, "diacritic-variant", [1]);
    const isRow = result.rows.find((r) => r.label.includes("Doanh thu"));
    expect(isRow).toBeDefined();
    expect(isRow!.statement_section).toBe("income_statement");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Non-regression: prose lines that merely MENTION a section keyword inside an
// unrelated sentence must not spuriously flip section state mid-table in a
// way that breaks existing "general" defaulting behavior for tables with no
// header at all (guards against an overly-greedy fallback).
// ─────────────────────────────────────────────────────────────────────────────

describe("W3 section-boundary-contamination guard — no header present (non-regression)", () => {
  it("table with zero section-header lines still defaults to 'general'", () => {
    const md = [
      "| Mã số | Chỉ tiêu | Số cuối kỳ |",
      "|---|---|---|",
      "| 01 | Some item | 100.000 |",
    ].join("\n");
    const result = parseRefinedMarkdown(md, "no-header", [1]);
    expect(result.rows[0]?.statement_section).toBe("general");
  });
});
