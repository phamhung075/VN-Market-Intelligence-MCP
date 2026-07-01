/**
 * FIX-BCTC-BANK-SUMMARY-MAPPING-W4.test.ts — bctcScalarAggregator fixture hardening
 *
 * Sprint: FIX-BCTC-BANK-SUMMARY-MAPPING | Task: TASK-W4-FIX-BCTC-BANK-SUMMARY-MAPPING-...
 * Date: 2026-07-01
 *
 * WHY THIS FILE EXISTS (architect brief §2, §5 W4 / BA spec FR-2, FR-7, AC-9, AC-12):
 *   bctcScalarAggregator.ts's bank mapping (generic isBankFormFromRows discriminator,
 *   label-canonical + code-based lookups, NO per-ticker branches) was BELIEVED correct
 *   but had ZERO production evidence it maps total_assets for banks — because the
 *   "Tổng tài sản" grand-total row has been structurally ABSENT from bctc_table_rows
 *   for every real bank ticker sampled (CTG, VCB — see brief §2). This file supplies
 *   the missing fixture coverage: CTG-shaped, VCB-shaped, and a SYNTHETIC third bank
 *   ticker (AC-9 genericity proof — the fixture's ticker string is never referenced
 *   anywhere else in this codebase, and aggregateScalars() itself takes NO ticker
 *   parameter at all — the function signature is the strongest possible evidence of
 *   genericity).
 *
 * DEFECT FOUND + FIXED IN PLACE (small, same file — bctcScalarAggregator.ts):
 *   While building the CTG/VCB fixtures (which realistically include the standard
 *   B02-TCTD combined "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" grand-total line alongside
 *   the pure "TỔNG NỢ PHẢI TRẢ" subtotal), a live order-dependent mapping bug surfaced:
 *   total_liabilities' bank-path label lookup (`findByLabel`, no exclusion) could pick
 *   the COMBINED line instead of the pure subtotal whenever the combined line happened
 *   to appear earlier in row order — the exact FU-6c collision class already fixed for
 *   equity_total (P_BANK_EQUITY_EXCLUDE) but missed for total_liabilities. Confirmed via
 *   a standalone probe: adversarial ordering caused total_liabilities to resolve to the
 *   total_assets value, tripping a FALSE "BALANCE IDENTITY VIOLATED" (9.58% deviation)
 *   on an otherwise perfectly clean bank reading. Fixed by adding
 *   P_BANK_TOTAL_LIABILITIES_EXCLUDE and switching to findByLabelExcluding — see
 *   "DV-W4-REGRESSION" describe block below for the RED→GREEN proof.
 *
 * ACCEPTANCE COVERAGE:
 *   AC-2  — bank balance-sheet rows never squeezed into income-statement columns.
 *   AC-3  — income-statement scalars with no bank-form equivalent stay NULL (notApplicable).
 *   AC-5  — total_assets > 0, identity holds within 1%, plausible margins/ebitda.
 *   AC-8  — non-regression: FPT 2026-Q1 (pinned to brief §1 live values, corporate path
 *           untouched by the W4 bank-only fix), FPT 2025-Q4 (representative — exact
 *           2025-Q4 live figures not captured in the brief; proves the SAME code-280/
 *           300/400 corporate path for a second period), VNM 2025-Q4 (pinned to brief
 *           §3.4 exact identity values). VNM 2026-Q1 explicitly EXCLUDED per BA §3.4/§6
 *           (0-row raw extraction, refine_status=PENDING, scope_out territory).
 *   AC-9  — generic mapping, synthetic third bank ticker, no per-ticker allowlist.
 *   AC-12 — CTG-shaped + VCB-shaped + synthetic bank fixtures exercised through all
 *           three serve tools (get_financial_summary, get_bctc_full, compare_financials)
 *           in addition to the direct aggregateScalars() unit coverage.
 *
 * FILE FENCE: this file only imports (read-only, never edits) reports.ts and
 * bctcFullTools.ts to invoke the already-registered MCP tools against an isolated
 * in-memory DB — it does not modify either file. Editing those files is W1's scope.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerReportTools } from "../interface/mcp/tools/financial-reports/reports.js";
import { registerBctcFullTools } from "../interface/mcp/tools/financial-reports/bctcFullTools.js";
import {
  aggregateScalars,
  type AggregatorRow,
  type ScalarAggregate,
} from "../domain/services/financial-reports/bctcScalarAggregator.js";
import { isBankFormFromRows } from "../domain/services/financial-reports/bctcFormType.js";

// ═════════════════════════════════════════════════════════════════════════════
// Part 1 — Fixture rows (shared between aggregateScalars() direct tests and the
// serve-tool DB-backed tests in Part 3). Each row carries an extra `valuePrior`
// used only for DB insertion — AggregatorRow itself has no such field.
// ═════════════════════════════════════════════════════════════════════════════

interface FixtureRow extends AggregatorRow {
  valuePrior?: number | null;
}

function toAggregatorRows(rows: FixtureRow[]): AggregatorRow[] {
  return rows.map(({ code, label, value_current, statement_section, is_summary_row, unit }) => ({
    code,
    label,
    value_current,
    statement_section,
    is_summary_row,
    unit,
  }));
}

/**
 * buildBankFixture — generic B02-TCTD bank-shaped row set builder.
 * Same structural shape for CTG/VCB/synthetic — only magnitudes differ, proving
 * the aggregator applies one generic code path (AC-9).
 *
 * Includes the recovered "TỔNG TÀI SẢN" row (post-repair — brief §2: this row was
 * structurally ABSENT before repair; here it carries a real value_current + valuePrior)
 * PLUS the standard combined "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" grand-total line
 * (real B02-TCTD layouts always carry this line) to exercise the W4 exclusion fix.
 */
function buildBankFixture(m: {
  totalAssets: number;
  totalAssetsPrior: number;
  totalLiabilities: number;
  equityTotal: number;
  netRevenue: number;
  profitBeforeTax: number;
  netProfit: number;
  cash: number;
}): FixtureRow[] {
  return [
    // ── Balance sheet (bank Mẫu B02-TCTD, "balance_sheet" section — clean post-repair layout)
    { code: "I", label: "Tiền mặt, vàng bạc, đá quý", value_current: m.cash, statement_section: "balance_sheet", is_summary_row: 0, unit: "billion_vnd" },
    // Recovered grand-total row (brief §2 "recovered Tổng tài sản row" — code stays null,
    // matching this codebase's established bank-form convention: the B02-TCTD grand total
    // carries no VAS code, see FU-6/FU-6d ACB fixtures; value_current/value_prior populated
    // proves the "recovered" state vs the pre-repair fully-ABSENT state).
    { code: null, label: "TỔNG TÀI SẢN", value_current: m.totalAssets, valuePrior: m.totalAssetsPrior, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
    { code: null, label: "TỔNG NỢ PHẢI TRẢ", value_current: m.totalLiabilities, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
    { code: null, label: "VỐN CHỦ SỞ HỮU", value_current: m.equityTotal, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
    // Combined grand-total line — always present in real B02-TCTD statements; proves the
    // W4 total_liabilities exclusion fix picks the PURE subtotal above, not this composite.
    { code: null, label: "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU", value_current: m.totalAssets, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
    // ── Income statement (bank B02-TCTD Roman codes)
    { code: "I", label: "Thu nhập lãi thuần", value_current: m.netRevenue, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
    { code: "VIII", label: "Lợi nhuận trước thuế", value_current: m.profitBeforeTax, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
    { code: "IX", label: "Lợi nhuận sau thuế", value_current: m.netProfit, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
  ];
}

// CTG-shaped (post-W2-repair) — identity: 1,530,000,000 + 170,000,000 = 1,700,000,000
const CTG_SHAPED = buildBankFixture({
  totalAssets: 1_700_000_000,
  totalAssetsPrior: 1_600_000_000,
  totalLiabilities: 1_530_000_000,
  equityTotal: 170_000_000,
  netRevenue: 45_000_000,
  profitBeforeTax: 12_000_000,
  netProfit: 9_600_000,
  cash: 25_000_000,
});

// VCB-shaped — identity: 1,750,000,000 + 150,000,000 = 1,900,000,000
const VCB_SHAPED = buildBankFixture({
  totalAssets: 1_900_000_000,
  totalAssetsPrior: 1_800_000_000,
  totalLiabilities: 1_750_000_000,
  equityTotal: 150_000_000,
  netRevenue: 52_000_000,
  profitBeforeTax: 15_000_000,
  netProfit: 12_000_000,
  cash: 30_000_000,
});

// SYNTHETIC third bank ticker ("ZFXSYN") — never seen anywhere else in this codebase
// (grepped clean at authoring time). AC-9 genericity proof — same buildBankFixture()
// builder, different magnitudes, ZERO code changes needed for this "new" bank.
// identity: 430,000,000 + 70,000,000 = 500,000,000
const SYNTHETIC_BANK_SHAPED = buildBankFixture({
  totalAssets: 500_000_000,
  totalAssetsPrior: 470_000_000,
  totalLiabilities: 430_000_000,
  equityTotal: 70_000_000,
  netRevenue: 18_000_000,
  profitBeforeTax: 5_000_000,
  netProfit: 4_000_000,
  cash: 9_000_000,
});

// ═════════════════════════════════════════════════════════════════════════════
// Part 2 — direct aggregateScalars() unit coverage (domain layer, zero I/O)
// ═════════════════════════════════════════════════════════════════════════════

describe("W4 — bank total_assets mapping: CTG-shaped, VCB-shaped, synthetic (AC-2, AC-3, AC-5, AC-9)", () => {
  it.each([
    ["CTG-shaped", CTG_SHAPED, 1_700_000_000, 1_530_000_000, 170_000_000, 45_000_000, 12_000_000, 9_600_000],
    ["VCB-shaped", VCB_SHAPED, 1_900_000_000, 1_750_000_000, 150_000_000, 52_000_000, 15_000_000, 12_000_000],
    ["synthetic (never-seen ticker)", SYNTHETIC_BANK_SHAPED, 500_000_000, 430_000_000, 70_000_000, 18_000_000, 5_000_000, 4_000_000],
  ] as const)(
    "%s: isBankFormFromRows=true, total_assets/liabilities/equity resolve correctly, identity holds",
    (_label, fixture, totalAssets, totalLiabilities, equityTotal, netRevenue, pbt, netProfit) => {
      const rows = toAggregatorRows(fixture);

      // AC-2 discriminator: structural, generic — no ticker/domain input at all.
      expect(isBankFormFromRows(rows)).toBe(true);

      const result = aggregateScalars(rows);
      const agg = result.scalars;

      // AC-5: total_assets > 0, correctly resolved from the recovered "Tổng tài sản" row.
      expect(agg.total_assets).toBe(totalAssets);
      expect(agg.total_assets).toBeGreaterThan(0);
      // W4 fix under test: total_liabilities must be the PURE subtotal, not the
      // combined "...VÀ VỐN CHỦ SỞ HỮU" grand-total line (which equals totalAssets).
      expect(agg.total_liabilities).toBe(totalLiabilities);
      expect(agg.total_liabilities).not.toBe(totalAssets);
      expect(agg.equity_total).toBe(equityTotal);
      expect(agg.net_revenue).toBe(netRevenue);
      expect(agg.profit_before_tax).toBe(pbt);
      expect(agg.net_profit).toBe(netProfit);

      // AC-5: accounting identity holds within 1% — no CORRUPT-DATA-worthy violation.
      expect(result.balanceViolation).toBeNull();

      // AC-5: plausible margin — never an OCR-corruption-fingerprint magnitude.
      expect(agg.net_margin_pct).not.toBeNull();
      expect(Math.abs(agg.net_margin_pct!)).toBeLessThan(1000);

      // AC-3: bank-form income-statement scalars with no B02-TCTD equivalent stay NULL —
      // never fabricated/zero — and are explicitly flagged notApplicable for null-clear.
      expect(agg.gross_profit).toBeNull();
      expect(agg.current_assets).toBeNull();
      expect(result.notApplicable).toEqual(
        expect.arrayContaining([
          "gross_profit", "current_assets", "gross_margin_pct",
          "short_term_debt", "long_term_debt",
          "charter_capital", "investment_property", "reward_fund",
        ]),
      );
    },
  );

  it("SYNTHETIC ticker proves genericity: same builder + zero per-ticker code path (AC-9)", () => {
    // aggregateScalars() takes ONLY rows — no ticker/actionCode parameter exists in its
    // signature at all. This is the structural proof that no per-ticker allowlist can
    // exist inside it: there is nothing to branch on.
    const rows = toAggregatorRows(SYNTHETIC_BANK_SHAPED);
    const result = aggregateScalars(rows);
    expect(result.scalars.total_assets).toBe(500_000_000);
    expect(result.balanceViolation).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Part 3 — W4 defect + fix regression proof (total_liabilities exclusion)
// ═════════════════════════════════════════════════════════════════════════════

describe("DV-W4-REGRESSION — bank total_liabilities combined-line exclusion (order-dependent bug found + fixed)", () => {
  it("[RED→GREEN] combined line appears BEFORE the pure liabilities row → total_liabilities still resolves to the pure value", () => {
    // Adversarial ordering: the combined "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" row is
    // listed FIRST, ahead of the pure "TỔNG NỢ PHẢI TRẢ" subtotal — the worst case for
    // the old (unexcluded) findByLabel lookup, which returns the FIRST is_summary_row=1
    // match in array order. Values are the ACB scenario from the architect brief §5 /
    // FU-6-scalar-correctness.test.ts DV-FU6-4, re-ordered adversarially.
    const rows: AggregatorRow[] = [
      { code: null, label: "TỔNG TÀI SẢN", value_current: 1_030_900_741, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      // Combined line FIRST (worst case)
      { code: null, label: "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU", value_current: 1_030_900_741, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      // Pure liabilities subtotal SECOND
      { code: null, label: "TỔNG NỢ PHẢI TRẢ", value_current: 932_149_689, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      { code: "VIII", label: "VỐN CHỦ SỞ HỮU", value_current: 98_751_052, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      { code: "I", label: "Thu nhập lãi thuần", value_current: 6_989_162, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // CORE ASSERTION (the fix): total_liabilities must be the pure subtotal (932,149,689),
    // NOT the combined grand-total value (1,030,900,741 — which equals total_assets).
    expect(agg.total_liabilities).toBe(932_149_689);
    expect(agg.total_liabilities).not.toBe(1_030_900_741);
    expect(agg.total_assets).toBe(1_030_900_741);
    expect(agg.equity_total).toBe(98_751_052);

    // Before the fix this fixture produced a FALSE balance-identity violation
    // (deviation=9.58%) on an otherwise perfectly clean bank reading — confirmed via
    // a standalone probe against the pre-fix aggregator. After the fix: no violation.
    expect(result.balanceViolation).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Part 4 — AC-8 non-regression: FPT 2026-Q1, FPT 2025-Q4, VNM 2025-Q4
// (VNM 2026-Q1 explicitly EXCLUDED — 0-row/PENDING, scope_out per BA §3.4/§6)
// ═════════════════════════════════════════════════════════════════════════════

describe("W4 — AC-8 non-regression: corporate (B01-DN) mapping untouched by the bank-only fix", () => {
  it("FPT 2026-Q1 — pinned to architect brief §1 live values, identity holds (pre-existing 'failed' status has an OTHER root cause, out of scope)", () => {
    // Same underlying fixture shape as FU-6-scalar-correctness.test.ts DV-FU6-1
    // (raw-VND scale), re-pinned here for THIS sprint's AC-8 traceability. Brief §1:
    // total_assets=68,586,094.79 total_liabilities=28,464,058.21 equity_total=40,122,036.57
    // net_revenue=3,910... (CTG) — FPT row: total_assets=68,586,094.79
    // total_liabilities=28,464,058.21 equity_total=40,122,036.57 net_revenue=12,479,997.21.
    const rows: AggregatorRow[] = [
      { code: "10", label: "Doanh thu thuần", value_current: 12_479_997_206_775, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "20", label: "Lợi nhuận gộp", value_current: 4_244_889_890_688, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "60", label: "Lợi nhuận sau thuế", value_current: 2_476_789_833_481, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "50", label: "Lợi nhuận trước thuế", value_current: 2_803_844_281_676, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "100", label: "Tài sản ngắn hạn", value_current: 41_527_873_060_120, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      { code: "270", label: "V. Tài sản dài hạn khác", value_current: 3_399_067_564_489, statement_section: "general", is_summary_row: 0, unit: "billion_vnd" },
      { code: "280", label: "TỔNG CỘNG TÀI SẢN (280 = 100 + 200)", value_current: 68_586_094_785_217, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      { code: "440", label: "TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400)", value_current: 68_586_094_785_217, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      { code: "300", label: "C. NỢ PHẢI TRẢ", value_current: 28_464_058_214_856, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      { code: "400", label: "D. VỐN CHỦ SỞ HỮU", value_current: 40_122_036_570_361, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
    ];

    expect(isBankFormFromRows(rows)).toBe(false); // corporate — 3-digit codes veto bank

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    expect(Math.round(agg.total_assets!)).toBe(68_586_095);
    expect(Math.round(agg.total_liabilities!)).toBe(28_464_058);
    expect(Math.round(agg.equity_total!)).toBe(40_122_037);
    expect(Math.round(agg.net_revenue!)).toBe(12_479_997);
    // W4's total_liabilities fix never engages here — code "300" resolves directly
    // via findByCode, the corporate path never reaches the bank label-exclusion branch.
    expect(result.balanceViolation).toBeNull();
    // Corporate: no bank-only notApplicable fields.
    expect(result.notApplicable).toEqual([]);
    expect(agg.gross_profit).not.toBeNull();
  });

  it("FPT 2025-Q4-shaped — representative corporate fixture (exact 2025-Q4 live figures not captured in the brief); proves the SAME code-280/300/400 path for a second period, per BA §3.4 'passed_with_warnings, clean reference' baseline", () => {
    const rows: AggregatorRow[] = [
      { code: "10", label: "Doanh thu thuần", value_current: 11_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "20", label: "Lợi nhuận gộp", value_current: 3_800_000, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "60", label: "Lợi nhuận sau thuế", value_current: 2_100_000, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "280", label: "TỔNG CỘNG TÀI SẢN (280 = 100 + 200)", value_current: 60_000_000, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      { code: "300", label: "C. NỢ PHẢI TRẢ", value_current: 25_000_000, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      { code: "400", label: "D. VỐN CHỦ SỞ HỮU", value_current: 35_000_000, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
    ];

    expect(isBankFormFromRows(rows)).toBe(false);

    const result = aggregateScalars(rows);
    expect(result.scalars.total_assets).toBe(60_000_000);
    expect(result.scalars.total_liabilities).toBe(25_000_000);
    expect(result.scalars.equity_total).toBe(35_000_000);
    expect(result.balanceViolation).toBeNull();
  });

  it("VNM 2025-Q4 — pinned to architect brief §3.4 exact identity values (VNM 2026-Q1 is explicitly OUT of scope — 0-row/PENDING)", () => {
    // Brief §3.4: "identity holds exactly: 53,312,370.72 ≈ 18,829,355.43+34,483,015.29"
    const rows: AggregatorRow[] = [
      { code: "10", label: "Doanh thu thuần", value_current: 15_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "280", label: "TỔNG CỘNG TÀI SẢN (280 = 100 + 200)", value_current: 53_312_370.72, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      { code: "300", label: "C. NỢ PHẢI TRẢ", value_current: 18_829_355.43, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      { code: "400", label: "D. VỐN CHỦ SỞ HỮU", value_current: 34_483_015.29, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
    ];

    expect(isBankFormFromRows(rows)).toBe(false);

    const result = aggregateScalars(rows);
    expect(result.scalars.total_assets).toBeCloseTo(53_312_370.72, 1);
    expect(result.scalars.total_liabilities).toBeCloseTo(18_829_355.43, 1);
    expect(result.scalars.equity_total).toBeCloseTo(34_483_015.29, 1);
    expect(result.balanceViolation).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Part 5 — AC-4/AC-12: exercise the aggregator's output through all three serve
// tools (get_financial_summary, compare_financials, get_bctc_full) for the
// CTG-shaped, VCB-shaped and synthetic bank fixtures. Uses the shared
// initDatabase()/getDb() singleton (same pattern as
// fix-bctc-identity-serve-guard.test.ts) so all three tools read the SAME
// in-memory DB. This file only IMPORTS registerReportTools/registerBctcFullTools
// (read-only) — it never edits reports.ts or bctcFullTools.ts.
// ═════════════════════════════════════════════════════════════════════════════

type ToolResult = { content: Array<{ type: string; text: string }> };

function getRegisteredToolFn(
  server: McpServer,
  name: string,
): (args: Record<string, unknown>) => Promise<ToolResult> {
  const tools = (server as unknown as {
    _registeredTools: Record<string, {
      callback?: (args: Record<string, unknown>) => Promise<ToolResult>;
      handler?: (args: Record<string, unknown>) => Promise<ToolResult>;
    }>;
  })._registeredTools;
  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${name}`);
  return fn;
}

async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const fn = getRegisteredToolFn(server, name);
  const result = await fn(args);
  return result.content[0]?.text ?? "";
}

/** Insert a clean (non-corrupt) financial_reports row from an aggregated ScalarAggregate. */
function insertCleanBankRow(params: {
  id: string;
  actionCode: string;
  sortKey: string;
  periodYear: number;
  periodType: string;
  scalars: ScalarAggregate;
}): void {
  const db = getDb();
  const s = params.scalars;
  db.prepare(`
    INSERT OR REPLACE INTO financial_reports (
      id, action_code, company_name, exchange, domain,
      period_year, period_quarter, period_type, period_start, period_end, sort_key,
      ssc_url, pdf_path, published_at, parsed_at, audit_status, auditor,
      extraction_confidence,
      net_revenue, gross_profit, operating_profit, ebitda,
      profit_before_tax, net_profit, eps, diluted_eps,
      total_assets, current_assets, cash, inventory,
      total_liabilities, short_term_debt, long_term_debt, equity_total,
      operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
      gross_margin_pct, operating_margin_pct, net_margin_pct,
      roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda, pe, pb,
      refine_status,
      balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
      yoy_delta_json, qoq_delta_json, market_data_json, embedding_text, notes_raw_text
    ) VALUES (
      $id, $actionCode, $companyName, $exchange, $domain,
      $periodYear, $periodQuarter, $periodType, $periodStart, $periodEnd, $sortKey,
      $sscUrl, NULL, $publishedAt, $parsedAt, $auditStatus, NULL,
      $extractionConfidence,
      $netRevenue, $grossProfit, $operatingProfit, $ebitda,
      $profitBeforeTax, $netProfit, $eps, $dilutedEps,
      $totalAssets, $currentAssets, $cash, $inventory,
      $totalLiabilities, $shortTermDebt, $longTermDebt, $equityTotal,
      $operatingCf, $investingCf, $financingCf, $capex, $freeCashFlow,
      $grossMarginPct, $operatingMarginPct, $netMarginPct,
      $roe, $roa, NULL, NULL, NULL, NULL, NULL,
      'DONE',
      '{}', '{}', '{}', '{}',
      NULL, NULL, NULL, $embeddingText, NULL
    )
  `).run({
    $id: params.id,
    $actionCode: params.actionCode,
    $companyName: params.actionCode + " Test Bank",
    $exchange: "HOSE",
    $domain: "other", // BANK-DEV-1: domain column is never populated "banking" live — structural
    $periodYear: params.periodYear,
    $periodQuarter: 1,
    $periodType: params.periodType,
    $periodStart: `${params.periodYear}-01-01`,
    $periodEnd: `${params.periodYear}-03-31`,
    $sortKey: params.sortKey,
    $sscUrl: "https://ssc.gov.vn/test-w4-fixture",
    $publishedAt: `${params.periodYear}-04-15T00:00:00.000Z`,
    $parsedAt: `${params.periodYear}-04-15T01:00:00.000Z`,
    $auditStatus: "unaudited",
    $extractionConfidence: 0.85,
    $netRevenue: s.net_revenue,
    $grossProfit: s.gross_profit,
    $operatingProfit: s.operating_profit,
    $ebitda: s.ebitda,
    $profitBeforeTax: s.profit_before_tax,
    $netProfit: s.net_profit,
    $eps: s.eps,
    $dilutedEps: s.diluted_eps,
    $totalAssets: s.total_assets,
    $currentAssets: s.current_assets,
    $cash: s.cash,
    $inventory: null,
    $totalLiabilities: s.total_liabilities,
    $shortTermDebt: s.short_term_debt,
    $longTermDebt: s.long_term_debt,
    $equityTotal: s.equity_total,
    $operatingCf: s.operating_cf,
    $investingCf: s.investing_cf,
    $financingCf: s.financing_cf,
    $capex: s.capex,
    $freeCashFlow: s.free_cash_flow,
    $grossMarginPct: s.gross_margin_pct,
    $operatingMarginPct: null,
    $netMarginPct: s.net_margin_pct,
    $roe: null,
    $roa: null,
    $embeddingText: `${params.actionCode} ${params.sortKey} W4 clean bank fixture`,
  });
}

/** Insert the bank fixture's bctc_table_rows so isBankFormFromDb/PUB checks see the same evidence. */
function insertFixtureTableRows(reportId: string, fixture: FixtureRow[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, code, label,
       period_current, value_current, period_prior, value_prior, unit, is_summary_row)
    VALUES (?, 1, ?, ?, ?, ?, 'Q1', ?, 'Q4-prior', ?, ?, ?)
  `);
  fixture.forEach((r, idx) => {
    stmt.run(
      reportId, r.statement_section, idx + 1, r.code, r.label,
      r.value_current, r.valuePrior ?? null, r.unit, r.is_summary_row,
    );
  });
}

function insertRefinedUnit(reportId: string): void {
  getDb().prepare(`
    INSERT INTO bctc_refined_units (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
    VALUES (?, ?, '[1]', '| test |', 5, 0.85, 'DONE')
  `).run(reportId, `unit-${reportId}`);
}

describe("W4 — AC-4/AC-12: aggregator output served correctly through all three serve tools", () => {
  let server: McpServer;

  beforeAll(async () => {
    await initDatabase();
    const db = getDb();
    for (const code of ["ZFXCTG", "ZFXVCB", "ZFXSYN"]) {
      db.exec(`DELETE FROM financial_reports WHERE action_code = '${code}'`);
      db.exec(`DELETE FROM bctc_table_rows WHERE report_id LIKE 'w4-${code.toLowerCase()}%'`);
      db.exec(`DELETE FROM bctc_refined_units WHERE report_id LIKE 'w4-${code.toLowerCase()}%'`);
    }
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(() => {
    server = new McpServer(
      { name: "test-server-w4", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerReportTools(server);
    registerBctcFullTools(server); // no injected db → defaults to the same getDb() singleton
  });

  it.each([
    ["ZFXCTG", CTG_SHAPED],
    ["ZFXVCB", VCB_SHAPED],
    ["ZFXSYN", SYNTHETIC_BANK_SHAPED],
  ] as const)(
    "%s: get_financial_summary + get_bctc_full + compare_financials all serve PLAUSIBLE (non-corrupt) bank scalars",
    async (actionCode, fixture) => {
      const rows = toAggregatorRows(fixture);
      const result = aggregateScalars(rows);
      expect(result.balanceViolation).toBeNull(); // sanity: fixture itself must be clean

      const reportId = `w4-${actionCode.toLowerCase()}-2099-q1`;
      insertCleanBankRow({
        id: reportId,
        actionCode,
        sortKey: "2099-Q1",
        periodYear: 2099,
        periodType: "Q1",
        scalars: result.scalars,
      });
      insertFixtureTableRows(reportId, fixture);
      insertRefinedUnit(reportId);

      // Prior period for compare_financials (YoY) — same shape, ~90% scale.
      const priorRows = toAggregatorRows(fixture).map((r) => ({
        ...r,
        value_current: r.value_current === null ? null : r.value_current * 0.9,
      }));
      const priorResult = aggregateScalars(priorRows);
      insertCleanBankRow({
        id: `w4-${actionCode.toLowerCase()}-2098-q4`,
        actionCode,
        sortKey: "2098-Q4",
        periodYear: 2098,
        periodType: "Q4",
        scalars: priorResult.scalars,
      });

      // ── Tool 1: get_financial_summary ──────────────────────────────────────
      const summaryText = await callTool(server, "get_financial_summary", {
        actionCode,
        year: 2099,
        quarter: "Q1",
      });
      expect(summaryText).not.toContain("[CORRUPT DATA — SKIP]");
      expect(summaryText).toContain(actionCode);
      expect(summaryText).toContain("Total Assets");
      expect(summaryText).not.toMatch(/-?\d{5,}\.\d%/); // no absurd OCR-style margin blowup

      // ── Tool 2: get_bctc_full ───────────────────────────────────────────────
      const fullText = await callTool(server, "get_bctc_full", { code: actionCode });
      expect(fullText).toContain(`=== BCTC SUMMARY: ${actionCode} ===`);
      expect(fullText).toContain("Total Assets");
      expect(fullText).not.toContain("Chưa có dữ liệu");

      // ── Tool 3: compare_financials ──────────────────────────────────────────
      const compareText = await callTool(server, "compare_financials", {
        actionCode,
        period1: { year: 2099, quarter: "Q1" },
        period2: { year: 2098, quarter: "Q4" },
      });
      expect(compareText).toContain(actionCode);
      expect(compareText).toContain("Total Assets");
      expect(compareText).not.toContain("Period(s) not found");
    },
  );
});
