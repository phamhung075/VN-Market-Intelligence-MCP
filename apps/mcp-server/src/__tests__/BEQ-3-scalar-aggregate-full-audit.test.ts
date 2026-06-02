/**
 * BEQ-3 DV — ScalarAggregate full column audit (10 previously unmapped fields)
 *
 * Sprint: BCTC-EXTRACT-QUALITY
 * Brief: docs/architecture-briefs/2026-06-02-bctc-extract-quality.md § FIX-2
 *
 * Anti-false-green:
 *   RED: without BEQ-3, aggregateScalars only populated 10 fields; the remaining
 *   fields (operating_profit, ebitda, cash, operating_cf, investing_cf, financing_cf,
 *   capex, free_cash_flow, eps, diluted_eps) were absent from ScalarAggregate and
 *   thus never written to financial_reports. Live DB shows FPT 2026-Q1 operating_profit=0.
 *
 *   GREEN: with BEQ-3, aggregateScalars now maps all 20 fields using section-filtered
 *   code lookups. The section filter is CRITICAL: codes 20/30/40 appear in BOTH
 *   income_statement and cash_flow sections — without it, cash_flow values would
 *   pollute income fields (or vice versa).
 *
 * Recurring-bug escalation: bctcScalarAggregator.ts had ≥5 fix commits prior to BEQ-3.
 * This test is a FULL COLUMN AUDIT — verifies all 20 fields in one pass.
 * Future fixes must not regress any of these.
 *
 * Verification: pure in-memory computation — no I/O, no HTTP echo.
 */

import { describe, it, expect } from "bun:test";
import {
  aggregateScalars,
} from "../domain/services/financial-reports/bctcScalarAggregator.js";
import type { AggregatorRow } from "../domain/services/financial-reports/bctcScalarAggregator.js";

// ── VAS-code mock data (mirrors FPT 2026-Q1 live bctc_table_rows) ──────────────

/**
 * Build a mock row array that mirrors the FPT 2026-Q1 table_rows corpus.
 * Values are in raw VND (matching what the DB stores from legacy pdf-parse ingest).
 * aggregateScalars auto-detects the scale (> 1e11 → divide by 1e6).
 */
function fptMockRows(): AggregatorRow[] {
  return [
    // ── income_statement section ──────────────────────────────────────────────
    { code: "10",  label: "Doanh thu thuần",                                  value_current: 12_479_997_206_775, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    { code: "20",  label: "Lợi nhuận gộp",                                   value_current:  4_244_889_890_688, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    { code: "30",  label: "Lợi nhuận thuần từ hoạt động kinh doanh",         value_current:  2_747_763_827_050, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    { code: "50",  label: "Tổng lợi nhuận kế toán trước thuế",               value_current:  2_803_844_281_676, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    { code: "60",  label: "Lợi nhuận sau thuế thu nhập doanh nghiệp",        value_current:  2_476_789_833_481, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
    // Code 20 in income_statement should map to gross_profit, NOT operating_cf
    // Code 30 in income_statement should map to operating_profit, NOT investing_cf
    // (Section filter is critical — the below cash_flow rows share these codes)

    // ── general/balance_sheet section ─────────────────────────────────────────
    { code: "100", label: "A. TÀI SẢN NGẮN HẠN",                            value_current: 41_527_873_060_120, statement_section: "general",           is_summary_row: 1, unit: "vnd" },
    { code: "110", label: "I. Tiền và các khoản tương đương tiền",           value_current:  7_993_577_611_642, statement_section: "general",           is_summary_row: 1, unit: "vnd" },
    { code: "280", label: "TỔNG CỘNG TÀI SẢN",                               value_current: 88_000_000_000_000, statement_section: "general",           is_summary_row: 1, unit: "vnd" },
    { code: "300", label: "C. NỢ PHẢI TRẢ",                                  value_current: 47_877_963_429_639, statement_section: "general",           is_summary_row: 1, unit: "vnd" },
    { code: "400", label: "D. VỐN CHỦ SỞ HỮU",                              value_current: 40_122_036_570_361, statement_section: "general",           is_summary_row: 1, unit: "vnd" },

    // ── cash_flow section ─────────────────────────────────────────────────────
    // These have THE SAME codes (20, 30, 40) as income_statement rows above!
    // Without section filter, there would be code collision.
    { code: "02",  label: "Khấu hao tài sản cố định và bất động sản đầu tư", value_current:    409_926_454_508, statement_section: "cash_flow",         is_summary_row: 0, unit: "vnd" },
    { code: "20",  label: "Lưu chuyển tiền thuần từ hoạt động kinh doanh",   value_current: -2_847_813_717_192, statement_section: "cash_flow",         is_summary_row: 1, unit: "vnd" },
    { code: "21",  label: "Tiền chi mua sắm tài sản cố định",                value_current:   -589_068_929_719, statement_section: "cash_flow",         is_summary_row: 0, unit: "vnd" },
    { code: "30",  label: "Lưu chuyển tiền thuần từ hoạt động đầu tư",      value_current: -2_254_895_190_348, statement_section: "cash_flow",         is_summary_row: 1, unit: "vnd" },
    { code: "40",  label: "Lưu chuyển tiền thuần từ hoạt động tài chính",    value_current:  2_586_191_593_366, statement_section: "cash_flow",         is_summary_row: 1, unit: "vnd" },
  ];
}

const MILLION = 1_000_000; // raw VND → million VND divisor

describe("BEQ-3 — aggregateScalars full column audit (20 fields)", () => {

  it("RED→GREEN: new fields populated from FPT-like mock rows (section-filtered)", () => {
    /**
     * RED scenario (before BEQ-3):
     *   aggregateScalars did not define/compute operating_profit, cash, operating_cf etc.
     *   Those fields were absent from ScalarAggregate entirely — always 0 in live DB.
     *
     * GREEN (after BEQ-3):
     *   All new fields are resolved from the correct section-filtered rows.
     *
     * Section-filter critical test:
     *   - gross_profit must come from income_statement code "20" (4,244,889,890,688)
     *     NOT from cash_flow code "20" (-2,847,813,717,192 = operating_cf)
     *   - operating_profit must come from income_statement code "30" (2,747,763,827,050)
     *     NOT from cash_flow code "30" (-2,254,895,190,348 = investing_cf)
     */
    const rows = fptMockRows();
    const result = aggregateScalars(rows);

    // No balance violation
    expect(result.balanceViolation).toBeNull();

    const agg = result.scalars;
    const scale = (v: number) => Math.round(v * MILLION); // round to integer for comparison

    // ── Original 10 fields — regression guard ──────────────────────────────────
    expect(agg.net_revenue).not.toBeNull();
    expect(Math.round(agg.net_revenue!)).toBeCloseTo(12_479_997, -2); // ~12.48M million VND

    // gross_profit must come from income_statement "20" (NOT cash_flow "20")
    // income_statement "20" = ~4.24M million VND (positive)
    // cash_flow "20" = ~-2.85M million VND (negative) — section filter prevents collision
    expect(agg.gross_profit).not.toBeNull();
    expect(agg.gross_profit!).toBeGreaterThan(4_000_000); // ~4.24M million VND (income stmt)
    expect(agg.gross_profit!).toBeGreaterThan(0); // must be positive — proves CF "20" not picked

    expect(agg.net_profit).not.toBeNull();
    expect(agg.net_profit!).toBeGreaterThan(2_000_000); // ~2.47M million VND

    expect(agg.total_assets).not.toBeNull();
    expect(agg.equity_total).not.toBeNull();
    expect(agg.total_liabilities).not.toBeNull();

    // ── NEW fields (BEQ-3) ────────────────────────────────────────────────────

    // operating_profit must come from income_statement code "30" (NOT cash_flow code "30")
    expect(agg.operating_profit).not.toBeNull();
    expect(agg.operating_profit!).toBeGreaterThan(0); // ~2.74M million VND
    // If cash_flow "30" (-2.25T) was picked by mistake, this would be negative
    expect(agg.operating_profit!).toBeGreaterThan(1_000_000);

    // cash from balance_sheet code "110"
    expect(agg.cash).not.toBeNull();
    expect(agg.cash!).toBeGreaterThan(0); // ~7,993M million VND

    // Cash flow scalars (from cash_flow section — section-filtered)
    // operating_cf from cash_flow code "20" (must be the CF value, not income gross_profit)
    expect(agg.operating_cf).not.toBeNull();
    expect(agg.operating_cf!).toBeLessThan(0); // FPT operating CF is negative this quarter

    // investing_cf from cash_flow code "30" (must be CF value, not income operating_profit)
    expect(agg.investing_cf).not.toBeNull();
    expect(agg.investing_cf!).toBeLessThan(0); // investing outflow (negative)

    // financing_cf from cash_flow code "40"
    expect(agg.financing_cf).not.toBeNull();
    expect(agg.financing_cf!).toBeGreaterThan(0); // financing inflow (positive)

    // capex from cash_flow code "21" (negative = outflow)
    expect(agg.capex).not.toBeNull();
    expect(agg.capex!).toBeLessThan(0); // cash outflow

    // EBITDA = operating_profit + depreciation (code "02" in cash_flow)
    expect(agg.ebitda).not.toBeNull();
    expect(agg.ebitda!).toBeGreaterThan(agg.operating_profit!); // EBITDA > EBIT

    // free_cash_flow = operating_cf + capex (both negative → very negative sum)
    expect(agg.free_cash_flow).not.toBeNull();
    expect(agg.free_cash_flow!).toBeLessThan(0); // both components are negative for FPT Q1-2026

    // EPS / diluted_eps: not in standard VAS corpus — must be null
    expect(agg.eps).toBeNull();
    expect(agg.diluted_eps).toBeNull();
  });

  it("section isolation: gross_profit uses income_statement code 20, NOT cash_flow code 20", () => {
    const rows = fptMockRows();
    const result = aggregateScalars(rows);

    // gross_profit must be the income_statement value (~4.24M million VND)
    // NOT the cash_flow value (~-2.85M million VND)
    expect(result.scalars.gross_profit).not.toBeNull();
    expect(result.scalars.gross_profit!).toBeGreaterThan(0);

    // operating_cf must be the cash_flow value (~-2.85M million VND)
    // NOT the income_statement gross_profit value
    expect(result.scalars.operating_cf).not.toBeNull();
    expect(result.scalars.operating_cf!).toBeLessThan(0);

    // The two values must be different (proves section filter worked)
    expect(result.scalars.gross_profit).not.toBeCloseTo(result.scalars.operating_cf ?? 0, 0);
  });

  it("section isolation: operating_profit uses income_statement code 30, NOT cash_flow code 30", () => {
    const rows = fptMockRows();
    const result = aggregateScalars(rows);

    // operating_profit (income_statement code 30) must be positive (~2.74M million VND)
    expect(result.scalars.operating_profit).not.toBeNull();
    expect(result.scalars.operating_profit!).toBeGreaterThan(0);

    // investing_cf (cash_flow code 30) must be negative (~-2.25M million VND)
    expect(result.scalars.investing_cf).not.toBeNull();
    expect(result.scalars.investing_cf!).toBeLessThan(0);
  });

  it("regression: original 10 fields still correct after BEQ-3 changes", () => {
    const rows = fptMockRows();
    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // These were working before BEQ-3 — must not regress
    expect(agg.net_revenue).not.toBeNull();
    expect(agg.gross_profit).not.toBeNull();
    expect(agg.profit_before_tax).not.toBeNull();
    expect(agg.net_profit).not.toBeNull();
    expect(agg.total_assets).not.toBeNull();
    expect(agg.current_assets).not.toBeNull();
    expect(agg.total_liabilities).not.toBeNull();
    expect(agg.equity_total).not.toBeNull();
    expect(agg.gross_margin_pct).not.toBeNull();
    expect(agg.net_margin_pct).not.toBeNull();
  });

  it("income-statement-only corpus: cash flow fields are null (not forced-zero)", () => {
    /**
     * When no cash_flow section rows exist, operating_cf/investing_cf/financing_cf
     * must be null — NOT 0 (null semantics preserved per bctcScalarAggregator doctrine).
     */
    const rows: AggregatorRow[] = [
      { code: "10", label: "Doanh thu thuần",     value_current: 1_000_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "60", label: "Lợi nhuận sau thuế",  value_current:   100_000_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "vnd" },
      { code: "280", label: "TỔNG CỘNG TÀI SẢN", value_current: 5_000_000_000_000, statement_section: "general",           is_summary_row: 1, unit: "vnd" },
      { code: "300", label: "Nợ phải trả",        value_current: 3_000_000_000_000, statement_section: "general",           is_summary_row: 1, unit: "vnd" },
      { code: "400", label: "Vốn chủ sở hữu",     value_current: 2_000_000_000_000, statement_section: "general",           is_summary_row: 1, unit: "vnd" },
    ];
    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // Cash flow fields should be null (not present in corpus)
    expect(agg.operating_cf).toBeNull();
    expect(agg.investing_cf).toBeNull();
    expect(agg.financing_cf).toBeNull();
    expect(agg.capex).toBeNull();
    expect(agg.free_cash_flow).toBeNull();
    expect(agg.ebitda).toBeNull(); // needs operating_profit + depreciation, both absent
    expect(agg.operating_profit).toBeNull(); // no income code "30"
  });
});
