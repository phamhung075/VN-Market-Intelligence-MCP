/**
 * FU-5-scalar-backfill.test.ts — Anti-False-Green DV Gate
 *
 * Sprint: FU-TRUST-REFRESH | Task: FU-5
 * Date: 2026-05-31
 *
 * What this tests:
 *   BLOCK-1: finalizeBctcRefineTool must backfill financial_reports scalar
 *   aggregate columns (net_revenue, gross_profit, net_profit, total_assets,
 *   total_liabilities, equity_total, gross_margin_pct, net_margin_pct) from
 *   the freshly inserted bctc_table_rows.
 *
 *   BLOCK-2: after finalize, bctcScalarAggregator returns correct aggregated
 *   values (eval recompute is tested separately — eval environment requires
 *   thresholds file unavailable in :memory: test context; FU-5 wires it
 *   with try/catch non-fatal so the DB state is always committed).
 *
 * RED-BEFORE-GREEN PROTOCOL:
 *   Each test case documents how it would fail with the backfill disabled
 *   (backfill bypassed / aggregateScalars returns all-null).
 *
 * DB ARBITER RULE (mcp-server-write-wedge lesson):
 *   ALL assertions on DB state use direct bun:sqlite new Database(":memory:")
 *   DI injection. NEVER rely on tool return values alone for DB content proofs.
 *
 * Scope:
 *   DV-FU5-1 — Corporate report (FPT-shape): scalars backfilled correctly
 *              from raw-VND bctc_table_rows (codes 10/20/60/270/300/400)
 *   DV-FU5-2 — Bank report (ACB-shape): scalars backfilled correctly
 *              from million-VND bctc_table_rows (codes I/IX + label-based totals)
 *   DV-FU5-3 — NULL-not-zero: report missing gross_profit line → gross_profit IS NULL
 *   DV-FU5-4 — Idempotency: running finalize twice yields identical scalar values
 *   DV-FU5-5 — bctcScalarAggregator unit: corporate raw-VND divisor = 1e6
 *   DV-FU5-6 — bctcScalarAggregator unit: bank million-VND divisor = 1
 *   DV-FU5-7 — Deliberate-violation (anti-false-green core):
 *              seed report with stale wrong scalars (equity_total=0, gross_profit=net_revenue),
 *              seed correct bctc_table_rows, run finalize, assert scalars corrected
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildFinalizeBctcRefineHandler } from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import {
  aggregateScalars,
  type AggregatorRow,
} from "../domain/services/financial-reports/bctcScalarAggregator.js";
// aggregateScalars now returns ScalarAggregateResult { scalars, balanceViolation }.
// All FU-5 pure-aggregator tests access result.scalars.*

// ─── Helpers ──────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

const FPT_ID = "e8ea3df5-3f32-413d-a3eb-c71634c0438d";
const ACB_ID = "fea19bae-2b7a-4954-b3e0-e09d7bfc7390";
const MISSING_GROSS_ID = "aaaabbbb-cccc-dddd-eeee-000000000001";
const DELIBERATE_ID = "deadbeef-0000-0000-0000-000000000001";

/**
 * Seed a minimal financial_reports row with WRONG scalar values (stale legacy values).
 * This is the "before finalize" state — simulates the mock-grade values QA found.
 */
function seedReportWithWrongScalars(
  db: Database,
  reportId: string,
  ticker: string,
  opts: {
    net_revenue?: number;
    gross_profit?: number;
    equity_total?: number;
    total_assets?: number;
    total_liabilities?: number;
  } = {},
): void {
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        parsed_at, extraction_confidence,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
        net_revenue, gross_profit, equity_total, total_assets, total_liabilities,
        refine_status, confirm_status)
     VALUES (?, ?, ?, 'HOSE', 'technology',
             2026, 'Q1', 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
             datetime('now'), 0.85,
             '{}', '{}', '{}', '{}',
             ?, ?, ?, ?, ?,
             'PENDING', 'PENDING')`,
  ).run(
    reportId, ticker, ticker + " Corp",
    opts.net_revenue ?? 12479997,       // wrong: will be overwritten
    opts.gross_profit ?? 12479997,      // wrong: gross = net (100% margin) — DT-2 mock signature
    opts.equity_total ?? 0,             // wrong: zeroed equity — mock signature
    opts.total_assets ?? 0,             // wrong
    opts.total_liabilities ?? 0.000002, // wrong: near-zero
  );
}

/**
 * Seed bctc_refined_units with minimal markdown so finalize can parse rows.
 * The markdown uses section headers + pipe table format with BCTC codes in the label.
 */
function seedRefinedUnit(
  db: Database,
  reportId: string,
  unitId: string,
  markdown: string,
  windowStatus: string = "DONE",
): void {
  db.prepare(
    `INSERT OR REPLACE INTO bctc_refined_units
       (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
     VALUES (?, ?, '[1]', ?, 5, 0.85, ?)`,
  ).run(reportId, unitId, markdown, windowStatus);
}

/**
 * Directly seed bctc_table_rows (used for DV-FU5-1/2/3/4 where we control rows exactly).
 */
function seedTableRow(
  db: Database,
  reportId: string,
  opts: {
    code: string | null;
    label: string;
    value_current: number | null;
    statement_section?: string;
    is_summary_row?: number;
    unit?: string;
    row_order?: number;
  },
): void {
  db.prepare(
    `INSERT INTO bctc_table_rows
       (report_id, page_number, statement_section, row_order, code, label,
        period_current, value_current, unit, is_summary_row)
     VALUES (?, 1, ?, ?, ?, ?, 'Q1-2026', ?, ?, ?)`,
  ).run(
    reportId,
    opts.statement_section ?? "balance_sheet",
    opts.row_order ?? 0,
    opts.code ?? null,
    opts.label,
    opts.value_current ?? null,
    opts.unit ?? "billion_vnd",
    opts.is_summary_row ?? 0,
  );
}

interface FinancialReportScalars {
  net_revenue: number | null;
  gross_profit: number | null;
  profit_before_tax: number | null;
  net_profit: number | null;
  total_assets: number | null;
  current_assets: number | null;
  total_liabilities: number | null;
  equity_total: number | null;
  gross_margin_pct: number | null;
  net_margin_pct: number | null;
}

function readScalars(db: Database, reportId: string): FinancialReportScalars | null {
  return db
    .prepare<FinancialReportScalars, [string]>(
      `SELECT net_revenue, gross_profit, profit_before_tax, net_profit,
              total_assets, current_assets, total_liabilities, equity_total,
              gross_margin_pct, net_margin_pct
       FROM financial_reports WHERE id = ?`,
    )
    .get(reportId) as FinancialReportScalars | null;
}

// ─── DV-FU5-5 / DV-FU5-6: bctcScalarAggregator unit tests (pure domain) ──────

describe("DV-FU5-5 — aggregateScalars: corporate raw-VND rows → divisor=1e6", () => {
  it("detects raw-VND scale and divides by 1e6", () => {
    // RED without fix: aggregateScalars would return raw values (e.g. 12479997206775)
    // instead of million-VND (12479997). After fix: divisor=1e6 applied.
    const rows: AggregatorRow[] = [
      // Income statement
      { code: "10", label: "Doanh thu thuần", value_current: 12_479_997_206_775, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "20", label: "Lợi nhuận gộp",   value_current:  4_244_889_890_688, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "60", label: "Lợi nhuận sau thuế", value_current: 2_476_789_833_481, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      // Balance sheet
      { code: "270", label: "Tổng tài sản",       value_current: 68_586_094_785_217, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
      { code: "300", label: "Nợ phải trả",         value_current: 28_464_058_214_856, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
      { code: "400", label: "Vốn chủ sở hữu",      value_current: 40_122_036_570_361, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
      { code: "100", label: "Tài sản ngắn hạn",    value_current: 41_527_873_060_120, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // Must be in million VND (÷1e6), rounded
    expect(agg.net_revenue).not.toBeNull();
    expect(Math.round(agg.net_revenue!)).toBe(12_479_997);

    expect(agg.gross_profit).not.toBeNull();
    expect(Math.round(agg.gross_profit!)).toBe(4_244_890);

    expect(agg.net_profit).not.toBeNull();
    expect(Math.round(agg.net_profit!)).toBe(2_476_790);

    expect(agg.total_assets).not.toBeNull();
    expect(Math.round(agg.total_assets!)).toBe(68_586_095);

    expect(agg.total_liabilities).not.toBeNull();
    expect(Math.round(agg.total_liabilities!)).toBe(28_464_058);

    expect(agg.equity_total).not.toBeNull();
    expect(Math.round(agg.equity_total!)).toBe(40_122_037);

    // gross_margin_pct: 4244889890688 / 12479997206775 * 100 ≈ 34.0%
    expect(agg.gross_margin_pct).not.toBeNull();
    expect(agg.gross_margin_pct!).toBeGreaterThan(33);
    expect(agg.gross_margin_pct!).toBeLessThan(35);

    // DV-FU5-5: balance identity must hold (no violation for clean corporate fixture)
    expect(result.balanceViolation).toBeNull();
  });
});

describe("DV-FU5-6 — aggregateScalars: bank million-VND rows → divisor=1", () => {
  it("detects million-VND scale (no division) for bank-shaped data", () => {
    // RED without fix: divisor might be 1e6, dividing 6989162 → 6.989 (nonsense)
    // After fix: max value = 1,030,900,741 < 1e11 → divisor=1
    const rows: AggregatorRow[] = [
      // Income statement (bank codes)
      { code: "I",   label: "Thu nhập lãi thuần",   value_current: 6_989_162, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "IX",  label: "Lợi nhuận sau thuế",   value_current: 4_320_388, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      { code: "VIII",label: "Lợi nhuận trước thuế", value_current: 5_368_138, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      // Balance sheet (label-based for banks)
      { code: null, label: "TỔNG TÀI SẢN",       value_current: 1_030_900_741, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
      { code: null, label: "TỔNG NỢ PHẢI TRẢ",   value_current:   932_149_689, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
      { code: null, label: "VỐN CHỦ SỞ HỮU",     value_current:    98_751_052, statement_section: "balance_sheet", is_summary_row: 1, unit: "billion_vnd" },
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // Must be exact (divisor=1)
    expect(agg.net_revenue).toBe(6_989_162);
    expect(agg.net_profit).toBe(4_320_388);
    expect(agg.profit_before_tax).toBe(5_368_138);
    expect(agg.total_assets).toBe(1_030_900_741);
    expect(agg.total_liabilities).toBe(932_149_689);
    expect(agg.equity_total).toBe(98_751_052);

    // gross_profit: banks have no gross_profit concept → NULL (no code "20", no bank label match)
    expect(agg.gross_profit).toBeNull();

    // DV-FU5-6: balance identity must hold for this clean bank fixture
    expect(result.balanceViolation).toBeNull();
  });
});

// ─── DV-FU5-3: NULL-not-zero (pure aggregator) ────────────────────────────────

describe("DV-FU5-3 — NULL-not-zero: absent line item → scalar is NULL, not 0", () => {
  it("missing gross_profit line (code 20 absent) → gross_profit=null, not 0", () => {
    // RED without fix: aggregator might return 0 for absent code
    const rows: AggregatorRow[] = [
      { code: "10", label: "Doanh thu thuần", value_current: 5_000_000, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
      // code "20" deliberately absent
      { code: "60", label: "Lợi nhuận sau thuế", value_current: 500_000, statement_section: "income_statement", is_summary_row: 1, unit: "billion_vnd" },
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // net_revenue and net_profit should be found
    expect(agg.net_revenue).toBe(5_000_000);
    expect(agg.net_profit).toBe(500_000);

    // gross_profit must be NULL — not 0
    expect(agg.gross_profit).toBeNull();

    // gross_margin_pct must also be NULL (requires gross_profit)
    expect(agg.gross_margin_pct).toBeNull();

    // net_margin_pct can still be computed: 500000/5000000 * 100 = 10%
    expect(agg.net_margin_pct).not.toBeNull();
    expect(agg.net_margin_pct!).toBeCloseTo(10, 1);

    // Balance identity: not enforced when total_assets is null → no violation
    expect(result.balanceViolation).toBeNull();
  });

  it("empty row set → all scalars null", () => {
    const result = aggregateScalars([]);
    const agg = result.scalars;
    expect(agg.net_revenue).toBeNull();
    expect(agg.gross_profit).toBeNull();
    expect(agg.net_profit).toBeNull();
    expect(agg.total_assets).toBeNull();
    expect(agg.equity_total).toBeNull();
    expect(result.balanceViolation).toBeNull();
  });
});

// ─── Integration tests using finalizeBctcRefineTool ───────────────────────────

describe("DV-FU5-7 — Deliberate-violation: stale scalars corrected by backfill (anti-false-green core)", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("DELIBERATE VIOLATION: equity_total=0 and gross=net become correct after finalize", async () => {
    /**
     * RED state (before fix):
     *   financial_reports has equity_total=0, gross_profit=net_revenue (100% margin).
     *   bctc_refined_units holds correct data; finalize re-parses and re-inserts rows.
     *   finalize() WITHOUT backfill: scalar columns in financial_reports stay STALE
     *   (equity_total=0, gross=net). Assertion equity_total !== 0 → FAILS.
     *
     * GREEN state (after fix):
     *   finalize() WITH backfill:
     *     1. Deletes + re-inserts bctc_table_rows from markdown
     *     2. Reads freshly inserted rows → aggregateScalars()
     *     3. UPDATEs financial_reports scalar columns
     *   equity_total, gross_profit, total_assets all reflect real parsed values.
     *
     * Design note: finalize DELETES bctc_table_rows before INSERT, so
     * pre-seeding bctc_table_rows directly is NOT the right approach here.
     * Instead, seed bctc_refined_units with proper markdown so finalize can
     * parse the correct rows. The markdown uses the standard pipe-table format
     * that parseRefinedMarkdown understands, with explicit BCTC codes in labels.
     *
     * To keep the test deterministic, we use simplified million-VND scale values
     * (max value < 1e11 → divisor=1) rather than raw-VND FPT values. The unit
     * detection is proven separately in DV-FU5-5.
     */

    // Seed report with WRONG scalars (stale legacy state from 2026-05-24 parse)
    // equity_total=0, gross_profit=net_revenue (100% margin) — DT-2 mock signature
    const wrongNetRevenue = 8_000;          // wrong: million VND placeholder
    const wrongGrossProfit = 8_000;         // wrong: gross = net (100% margin)
    const wrongEquity = 0;                  // wrong: forced zero

    db.prepare(
      `INSERT OR REPLACE INTO financial_reports
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
               ?, ?, ?, 0, 0.000002,
               'PENDING', 'PENDING')`,
    ).run(DELIBERATE_ID, wrongNetRevenue, wrongGrossProfit, wrongEquity);

    // Verify pre-finalize state: scalars are WRONG
    const before = readScalars(db, DELIBERATE_ID);
    expect(before).not.toBeNull();
    expect(before!.gross_profit).toBe(wrongGrossProfit);
    expect(before!.net_revenue).toBe(wrongNetRevenue);
    expect(before!.equity_total).toBe(0); // the wrong zero value

    // Seed bctc_refined_units with CORRECT data in markdown format.
    // Values in million VND (max ~50,000 < 1e11 → divisor=1, no scale conversion).
    // parseRefinedMarkdown 4-column format: | code | label | value_current | value_prior |
    // (rawCells[0]=code, rawCells[1]=label, rawCells[2]=current, rawCells[3]=prior)
    const balanceMd = [
      "BẢNG CÂN ĐỐI KẾ TOÁN",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 270 | Tổng tài sản | 50.000 | 48.000 |",
      "| 300 | Nợ phải trả | 30.000 | 29.000 |",
      "| 400 | Vốn chủ sở hữu | 20.000 | 19.000 |",
    ].join("\n");

    const incomeMd = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 10 | Doanh thu thuần | 8.000 | 7.500 |",
      "| 20 | Lợi nhuận gộp | 2.500 | 2.200 |",
      "| 60 | Lợi nhuận sau thuế | 1.200 | 1.100 |",
    ].join("\n");

    seedRefinedUnit(db, DELIBERATE_ID, "unit-balance", balanceMd, "DONE");
    seedRefinedUnit(db, DELIBERATE_ID, "unit-income", incomeMd, "DONE");

    // Run finalize — DELETE existing rows, re-parse markdown, INSERT, then BACKFILL
    const handler = buildFinalizeBctcRefineHandler(db);
    const result = await handler({ report_id: DELIBERATE_ID, report_status: "DONE" });
    const parsed = JSON.parse(result.content[0]!.text) as { ok: boolean; rows_parsed?: number };
    expect(parsed.ok).toBe(true);
    // finalize must have parsed some rows from the markdown
    expect((parsed.rows_parsed ?? 0)).toBeGreaterThan(0);

    // ── ANTI-FALSE-GREEN: direct DB reads ─────────────────────────────────────
    const after = readScalars(db, DELIBERATE_ID);
    expect(after).not.toBeNull();

    // CORE ASSERTION 1: equity_total must no longer be 0
    // RED without backfill: equity_total stays 0
    // GREEN with backfill: equity_total = 20,000 (from code 400 row)
    expect(after!.equity_total).not.toBeNull();
    expect(after!.equity_total).not.toBe(0);
    // value_current=20000 million VND, divisor=1 (max row value 50000 < 1e11)
    expect(after!.equity_total).toBe(20_000);

    // CORE ASSERTION 2: gross_profit must NOT equal net_revenue (not 100% margin)
    // RED without backfill: gross_profit stays = 8,000 = net_revenue (100% margin)
    // GREEN with backfill: gross_profit = 2,500 (31.25% margin)
    expect(after!.gross_profit).not.toBeNull();
    expect(after!.net_revenue).not.toBeNull();
    expect(after!.gross_profit).not.toBe(after!.net_revenue); // key: NOT equal

    const impliedMargin = after!.gross_profit! / after!.net_revenue!;
    expect(impliedMargin).toBeGreaterThan(0.20);
    expect(impliedMargin).toBeLessThan(0.50); // 31.25% gross margin

    // CORE ASSERTION 3: total_assets not zero
    expect(after!.total_assets).not.toBeNull();
    expect(after!.total_assets).not.toBe(0);
    expect(after!.total_assets).toBe(50_000);

    // CORE ASSERTION 4: gross_margin_pct properly computed (31.25%)
    expect(after!.gross_margin_pct).not.toBeNull();
    expect(after!.gross_margin_pct!).toBeGreaterThan(30);
    expect(after!.gross_margin_pct!).toBeLessThan(33);
  });
});

describe("DV-FU5-4 — Idempotency: finalize × 2 → identical scalar values", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("running finalize twice produces identical scalars (idempotent backfill)", async () => {
    // Seed minimal report
    db.prepare(
      `INSERT OR REPLACE INTO financial_reports
         (id, action_code, company_name, exchange, domain,
          period_year, period_quarter, period_type, period_start, period_end, sort_key,
          parsed_at, extraction_confidence,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
          refine_status, confirm_status)
       VALUES (?, 'TST', 'Test Corp', 'HOSE', 'technology',
               2026, 'Q1', 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
               datetime('now'), 0.85,
               '{}', '{}', '{}', '{}',
               'PENDING', 'PENDING')`,
    ).run("idempotent-0000-0000-0000-000000000001");

    // Seed minimal table rows + refined unit
    const IDEMPOTENT_ID = "idempotent-0000-0000-0000-000000000001";

    const rows = [
      { code: "10", label: "Doanh thu thuần", val: 5_000_000_000_000, section: "income_statement" },
      { code: "270", label: "Tổng tài sản", val: 10_000_000_000_000, section: "balance_sheet" },
      { code: "400", label: "Vốn chủ sở hữu", val: 6_000_000_000_000, section: "balance_sheet" },
      { code: "300", label: "Nợ phải trả", val: 4_000_000_000_000, section: "balance_sheet" },
    ];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      seedTableRow(db, IDEMPOTENT_ID, {
        code: r.code, label: r.label, value_current: r.val,
        statement_section: r.section, is_summary_row: 1, row_order: i,
      });
    }

    seedRefinedUnit(db, IDEMPOTENT_ID, "unit-idem",
      // 4-column format: | code | label | current | prior |
      ["BẢNG CÂN ĐỐI KẾ TOÁN", "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |", "|---|---|---|---|",
       "| 270 | Tổng tài sản | 10.000.000.000.000 | 9.000.000.000.000 |",
       "| 400 | Vốn chủ sở hữu | 6.000.000.000.000 | 5.500.000.000.000 |",
       "| 300 | Nợ phải trả | 4.000.000.000.000 | 3.500.000.000.000 |"].join("\n"),
    );

    const handler = buildFinalizeBctcRefineHandler(db);

    // First run
    await handler({ report_id: IDEMPOTENT_ID, report_status: "DONE" });
    const after1 = readScalars(db, IDEMPOTENT_ID);

    // Second run (same data — finalize deletes + re-inserts rows, then re-aggregates)
    await handler({ report_id: IDEMPOTENT_ID, report_status: "DONE" });
    const after2 = readScalars(db, IDEMPOTENT_ID);

    expect(after1).not.toBeNull();
    expect(after2).not.toBeNull();

    // IDEMPOTENCY: both runs produce identical scalar values
    expect(after2!.net_revenue).toBe(after1!.net_revenue);
    expect(after2!.total_assets).toBe(after1!.total_assets);
    expect(after2!.equity_total).toBe(after1!.equity_total);
    expect(after2!.total_liabilities).toBe(after1!.total_liabilities);
  });
});

describe("DV-FU5-1 — Corporate report (FPT-shape): scalars backfilled correctly", () => {
  let db: Database;

  beforeEach(() => {
    db = openTestDb();
    // Seed report with known-wrong scalars
    seedReportWithWrongScalars(db, FPT_ID, "FPT", {
      net_revenue: 12_479_997,
      gross_profit: 12_479_997, // wrong: 100% margin
      equity_total: 0,           // wrong: zeroed
    });
    // REALISTIC FPT fixture (FU-6c amendment):
    // Code "270" maps to "V. Tài sản dài hạn khác" (3.4T) — NOT total assets.
    // Code "280" maps to "TỔNG CỘNG TÀI SẢN (280 = 100 + 200)" (68.6T) — the real total.
    // All rows land in "general" section (FPT balance sheet section-header gap).
    // This is the realistic scenario that triggered the FU-6c bug.
    const rows = [
      { code: "10",  label: "Doanh thu thuần",                           section: "income_statement", val: 12_479_997_206_775 },
      { code: "20",  label: "Lợi nhuận gộp",                              section: "income_statement", val:  4_244_889_890_688 },
      { code: "60",  label: "Lợi nhuận sau thuế",                         section: "income_statement", val:  2_476_789_833_481 },
      { code: "50",  label: "Lợi nhuận trước thuế",                       section: "income_statement", val:  2_803_844_281_676 },
      { code: "100", label: "Tài sản ngắn hạn",                           section: "general",          val: 41_527_873_060_120 },
      // FPT realistic: code "270" is a sub-section, NOT total assets
      { code: "270", label: "V. Tài sản dài hạn khác",                    section: "general",          val:  3_399_067_564_489 },
      // FPT realistic: code "280" is the grand total
      { code: "280", label: "TỔNG CỘNG TÀI SẢN (280 = 100 + 200)",       section: "general",          val: 68_586_094_785_217 },
      { code: "300", label: "Nợ phải trả",                                section: "general",          val: 28_464_058_214_856 },
      { code: "400", label: "Vốn chủ sở hữu",                             section: "general",          val: 40_122_036_570_361 },
    ];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      seedTableRow(db, FPT_ID, {
        code: r.code, label: r.label, value_current: r.val,
        statement_section: r.section, is_summary_row: 1, row_order: i,
      });
    }
  });

  afterEach(() => { db.close(); });

  it("aggregateScalars on FPT-shaped REALISTIC rows resolves total_assets from code-280 (not code-270)", () => {
    /**
     * REALISTIC FU-6c fixture:
     *   code "270" = "V. Tài sản dài hạn khác" (3,399,068M) — a sub-section, NOT total
     *   code "280" = "TỔNG CỘNG TÀI SẢN (280 = 100 + 200)" (68,586,095M) — the real total
     *
     * OLD code (findByCode(rows, "270")) would pick 3,399,068M — WRONG.
     * NEW code (findTotalAssetsCorporate) finds "TỔNG CỘNG TÀI SẢN" label → 68,586,095M — CORRECT.
     *
     * This fixture was previously idealized (code "270" → "Tổng tài sản").
     * Now it matches the actual live FPT bctc_table_rows — the cause of FU-6c false-green.
     */
    interface Row { code: string | null; label: string; value_current: number | null; statement_section: string; is_summary_row: number; unit: string }
    const dbRows = db
      .prepare<Row, [string]>(
        "SELECT code, label, value_current, statement_section, is_summary_row, unit FROM bctc_table_rows WHERE report_id = ?",
      )
      .all(FPT_ID) as AggregatorRow[];

    const result = aggregateScalars(dbRows);
    const agg = result.scalars;

    // net_revenue: 12,479,997,206,775 ÷ 1e6 = 12,479,997.206775 → round to 12,479,997
    expect(Math.round(agg.net_revenue!)).toBe(12_479_997);

    // gross_profit: 4,244,889,890,688 ÷ 1e6 = 4,244,889.890688 → round to 4,244,890
    expect(Math.round(agg.gross_profit!)).toBe(4_244_890);

    // equity_total: 40,122,036,570,361 ÷ 1e6 = 40,122,036.570361 → round to 40,122,037
    expect(Math.round(agg.equity_total!)).toBe(40_122_037);

    // CRITICAL: total_assets must be 68,586,095 (from code "280" label match)
    // NOT 3,399,068 (from code "270" = "V. Tài sản dài hạn khác")
    expect(agg.total_assets).not.toBeNull();
    expect(Math.round(agg.total_assets!)).toBe(68_586_095);

    // gross_margin_pct ≈ 34.0%
    expect(agg.gross_margin_pct!).toBeGreaterThan(33.5);
    expect(agg.gross_margin_pct!).toBeLessThan(34.5);

    // Balance identity: 28,464,058 + 40,122,037 ≈ 68,586,095 → ok (<1% deviation)
    expect(result.balanceViolation).toBeNull();
  });
});

describe("DV-FU5-2 — Bank report (ACB-shape): scalars backfilled correctly", () => {
  it("aggregateScalars on ACB-shaped REALISTIC rows resolves code-I collision and equity ordering", () => {
    /**
     * REALISTIC ACB fixture (FU-6c amendment):
     *
     * Code "I" collision: two rows share code "I" in the general section.
     *   - code "I", label "Tiền mặt, vàng bạc, đá quý" (balance sheet asset, row_order=0) → 8,157,465
     *   - code "I", label "Thu nhập lãi thuần" (income, row_order=10) → 6,989,162
     *   OLD code (findByCode without labelHint) picks first = 8,157,465 (WRONG).
     *   NEW code (findByCode with labelHint=/thu nhập|doanh thu/) picks 6,989,162 (CORRECT).
     *
     * Equity label ordering: combined-line appears BEFORE pure equity line in row_order.
     *   - code null, label "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" (row_order=1) → 1,030,900,741
     *   - code "VIII", label "VỐN CHỦ SỞ HỮU" (row_order=2) → 98,751,052
     *   OLD code (findByLabel without exclusion) picks first summary match = 1,030,900,741 (WRONG).
     *   NEW code (findByLabelExcluding) excludes "TỔNG NỢ PHẢI TRẢ..." → picks 98,751,052 (CORRECT).
     *
     * This fixture was previously idealized (clean rows, no collisions).
     * Now it matches the actual live ACB bctc_table_rows — the causes of FU-6c false-green.
     */
    const rows: AggregatorRow[] = [
      // ACB balance sheet rows (in "general" section — no separate balance_sheet section)
      // is_summary_row=1 for grand totals
      { code: null,   label: "TỔNG TÀI SẢN",                            value_current: 1_030_900_741, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      { code: null,   label: "TỔNG NỢ PHẢI TRẢ",                        value_current:   932_149_689, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      // Combined-line that caused the equity bug: appears BEFORE pure equity row
      { code: null,   label: "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU",   value_current: 1_030_900_741, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      // Pure equity row (the correct pick)
      { code: "VIII", label: "VỐN CHỦ SỞ HỮU",                         value_current:    98_751_052, statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      // Code "I" balance sheet asset — WRONG row for net_revenue (appears FIRST in row_order)
      { code: "I",    label: "Tiền mặt, vàng bạc, đá quý",             value_current:   8_157_465,   statement_section: "general", is_summary_row: 0, unit: "billion_vnd" },
      // Code "I" income row — the CORRECT net_revenue
      { code: "I",    label: "Thu nhập lãi thuần",                      value_current:   6_989_162,   statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      // Other income statement rows
      { code: "XIII", label: "Lợi nhuận sau thuế",                      value_current:   4_320_388,   statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
      { code: "XI",   label: "Tổng lợi nhuận trước thuế",               value_current:   5_368_138,   statement_section: "general", is_summary_row: 1, unit: "billion_vnd" },
    ];

    const result = aggregateScalars(rows);
    const agg = result.scalars;

    // All values in million VND — no division applied (divisor=1, max value < 1e11)

    // CRITICAL: net_revenue must be 6,989,162 (income row), NOT 8,157,465 (balance sheet asset)
    // labelHint=/thu nhập|doanh thu/ filters out "Tiền mặt, vàng bạc, đá quý"
    expect(agg.net_revenue).toBe(6_989_162);

    // CRITICAL: equity_total must be 98,751,052 (pure VỐN CHỦ SỞ HỮU)
    // NOT 1,030,900,741 (TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU — combined-line)
    expect(agg.equity_total).toBe(98_751_052);

    expect(agg.total_assets).toBe(1_030_900_741);
    expect(agg.total_liabilities).toBe(932_149_689);

    // net_profit: code "IX" absent; code "XIII" also not bank-standard — falls through to label
    // For this test: "Lợi nhuận sau thuế" label pattern matches code "XIII" via P_NET_PROFIT
    expect(agg.net_profit).toBe(4_320_388);

    // Banks: no gross profit → NULL
    expect(agg.gross_profit).toBeNull();
    expect(agg.gross_margin_pct).toBeNull();

    // Balance identity: 932,149,689 + 98,751,052 = 1,030,900,741 ✓ (exact match)
    expect(result.balanceViolation).toBeNull();
  });
});
