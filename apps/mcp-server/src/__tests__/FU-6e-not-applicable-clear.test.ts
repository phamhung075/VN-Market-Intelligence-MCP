/**
 * FU-6e-not-applicable-clear.test.ts — Anti-False-Green DV Gate
 *
 * Sprint: FU-TRUST-REFRESH | Task: FU-6e (not-applicable null-clear)
 * Date: 2026-05-31
 *
 * ROOT CAUSE ADDRESSED:
 *   Banks have no gross_profit concept (no code "20" in bctc_table_rows).
 *   aggregateScalars correctly returns gross_profit=null for ACB.
 *   finalizeBctcRefineTool (pre-FU-6e) had a single-case null-skip:
 *     `if (agg.gross_profit !== null) updates.push(...)` — null-skip fires.
 *   This meant any stale legacy pdf-parse value (ACB: 6,989,162 from original ingest)
 *   was NEVER cleared. get_bctc_full served "Gross Profit 6,989,162 (100%)" — wrong.
 *
 * FU-6e FIX: 3-case scalar update logic in finalizeBctcRefineTool:
 *   Case 1 NOT-APPLICABLE (bank gross_profit, current_assets, gross_margin_pct):
 *     aggregator signals via notApplicable[]; finalize SET NULL explicitly → clears stale.
 *   Case 2 EXPECTED-BUT-NULL (corporate gross_profit that failed to parse transiently):
 *     not in notApplicable; finalize SKIPS → preserves prior value (FU-5 intent).
 *   Case 3 RESOLVED non-null:
 *     finalize SET value (existing behavior, unchanged).
 *
 * DRY signal: isBankPath = (code "10" absent from row set) — same branch the
 *   aggregator already uses to fall through to bank code "I" path. No second detector.
 *
 * NOT-APPLICABLE enumeration (FU-6e, generalized):
 *   BANK: gross_profit, current_assets, gross_margin_pct.
 *   CORPORATE: [] (symmetric audit: nothing corporate-only that banks structurally have).
 *
 * TEST STRUCTURE:
 *   DV-FU6E-1 — [RED→GREEN] Bank report with STALE gross_profit:
 *     Pre-finalize: gross_profit=6,989,162, gross_margin_pct=100.0 (stale legacy values).
 *     Post-finalize: gross_profit=NULL, gross_margin_pct=NULL (Case 1 not-applicable clear).
 *     RED: pre-FU-6e finalize leaves stale values (null-skip prevents clear).
 *     GREEN: post-FU-6e finalize explicitly SETs NULL for not-applicable columns.
 *
 *   DV-FU6E-2 — [GREEN guard] Corporate report: gross_profit RESOLVES, must NOT be nulled:
 *     FPT-shape: code "20" present → gross_profit=4,244,890 after finalize.
 *     notApplicable=[] for corporate → no null clear fires.
 *     Guards against over-nulling: fixes must not destroy valid corporate values.
 *
 *   DV-FU6E-3 — [GREEN guard] Corporate gross_profit transiently null (FU-5 preserve):
 *     Corporate report where code "20" is absent from rows (parse miss, not bank).
 *     Pre-finalize: gross_profit=3,000 (prior real value seeded).
 *     Post-finalize: gross_profit stays 3,000 (Case 2 SKIP — not in notApplicable).
 *     Proves FU-5 "preserve prior on transient miss" behavior is intact.
 *
 *   DV-FU6E-4 — [Unit] aggregateScalars.notApplicable populated correctly per report type:
 *     Bank rows → notApplicable contains gross_profit, current_assets, gross_margin_pct.
 *     Corporate rows → notApplicable is empty.
 *     Pure aggregator assertion — no DB required.
 *
 * DB ARBITER RULE: ALL DB state assertions use direct bun:sqlite Database injection
 *   (new Database(":memory:")), NOT tool return values alone.
 *
 * CROSS-REFERENCE: DV-FU5-*, DV-FU5b-*, DV-FU6-{1..5}, DV-FU6D-{1..4} must stay GREEN.
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
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

/**
 * Seed financial_reports with explicit scalar values (the "stale legacy" state).
 * gross_profit=staleGrossProfit simulates ACB's legacy pdf-parse value (6,989,162)
 * that equalled net_revenue — a 100% margin nonsense value for a bank.
 */
function seedReportWithStaleScalars(
  db: Database,
  reportId: string,
  ticker: string,
  domain: string,
  opts: {
    net_revenue: number;
    gross_profit?: number;
    gross_margin_pct?: number;
    profit_before_tax?: number;
    net_profit?: number;
    total_assets?: number;
    total_liabilities?: number;
    equity_total?: number;
  },
): void {
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        parsed_at, extraction_confidence,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
        net_revenue, gross_profit, gross_margin_pct,
        profit_before_tax, net_profit,
        total_assets, total_liabilities, equity_total,
        refine_status, confirm_status)
     VALUES (?, ?, ?, 'HOSE', ?,
             2026, 'Q1', 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
             datetime('now'), 0.85,
             '{}', '{}', '{}', '{}',
             ?, ?, ?,
             ?, ?,
             ?, ?, ?,
             'PENDING', 'PENDING')`,
  ).run(
    reportId, ticker, ticker + " Co", domain,
    opts.net_revenue,
    opts.gross_profit ?? null,
    opts.gross_margin_pct ?? null,
    opts.profit_before_tax ?? null,
    opts.net_profit ?? null,
    opts.total_assets ?? null,
    opts.total_liabilities ?? null,
    opts.equity_total ?? null,
  );
}

function seedRefinedUnit(
  db: Database,
  reportId: string,
  unitId: string,
  markdown: string,
  windowStatus = "DONE",
): void {
  db.prepare(
    `INSERT OR REPLACE INTO bctc_refined_units
       (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
     VALUES (?, ?, '[1]', ?, 5, 0.85, ?)`,
  ).run(reportId, unitId, markdown, windowStatus);
}

// ── Report IDs ────────────────────────────────────────────────────────────────

const ACB_BANK_ID    = "fu6e-acb0-0000-0000-000000000001";
const FPT_CORP_ID    = "fu6e-fpt0-0000-0000-000000000002";
const TRANSIENT_ID   = "fu6e-tran-0000-0000-000000000003";

// ── DV-FU6E-1: Bank report with STALE gross_profit → cleared to NULL ─────────

describe("DV-FU6E-1 — [RED→GREEN] Bank report: stale gross_profit cleared to NULL after finalize", () => {
  /**
   * PRE-FU-6e RED behavior (documented — not executed here since fix is in place):
   *   finalize null-skip fires for gross_profit=null → UPDATE omits gross_profit →
   *   financial_reports.gross_profit stays 6,989,162 → get_bctc_full serves 100% margin.
   *
   * POST-FU-6e GREEN behavior (this test verifies):
   *   aggregator returns notApplicable=["gross_profit","current_assets","gross_margin_pct"]
   *   for bank (no code "10" in rows).
   *   finalize Case 1: SET gross_profit=NULL, SET gross_margin_pct=NULL explicitly.
   *   After finalize: financial_reports.gross_profit IS NULL, gross_margin_pct IS NULL.
   */

  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });
  afterEach(() => {
    db.close();
  });

  it("[RED→GREEN] bank ACB: gross_profit cleared from 6,989,162 to NULL (not-applicable Case 1)", async () => {
    // STALE LEGACY STATE: gross_profit = net_revenue = 6,989,162 (100% margin — wrong for bank)
    // This mirrors ACB fea19bae-2b7a-4954-b3e0-e09d7bfc7390 as confirmed by QA TASK_REPORT.
    seedReportWithStaleScalars(db, ACB_BANK_ID, "ACB", "banking", {
      net_revenue:       6_989_162,
      gross_profit:      6_989_162,   // ← stale legacy value from original pdf-parse
      gross_margin_pct:  100.0,       // ← derived wrong value (gross = net)
      profit_before_tax: 5_368_138,
      net_profit:        4_320_388,
      total_assets:      1_030_900_741,
      total_liabilities:   932_149_689,
      equity_total:         98_751_052,
    });

    // Verify PRE-FINALIZE state: stale gross_profit is 6,989,162
    const before = readScalars(db, ACB_BANK_ID);
    expect(before).not.toBeNull();
    expect(before!.gross_profit).toBe(6_989_162);        // stale value present
    expect(before!.gross_margin_pct).toBe(100.0);         // stale 100% margin present

    // ACB bank markdown — NO code "20" (gross profit) present, bank Roman codes only
    // The absence of code "10" triggers isBankPath=true in aggregateScalars.
    const bankMd = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH (NGÂN HÀNG)",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| I | Thu nhập lãi và các khoản thu nhập tương tự | 6.989.162 | 6.500.000 |",
      "| VIII | Lợi nhuận trước thuế | 5.368.138 | 5.000.000 |",
      "| IX | Lợi nhuận sau thuế thu nhập doanh nghiệp | 4.320.388 | 4.000.000 |",
    ].join("\n");

    const bankBsMd = [
      "BẢNG CÂN ĐỐI KẾ TOÁN (NGÂN HÀNG)",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| A | TỔNG TÀI SẢN | 1.030.900.741 | 950.000.000 |",
      "| B | TỔNG NỢ PHẢI TRẢ | 932.149.689 | 860.000.000 |",
      "| C | VỐN CHỦ SỞ HỮU | 98.751.052 | 90.000.000 |",
    ].join("\n");

    seedRefinedUnit(db, ACB_BANK_ID, "unit-bank-income", bankMd, "DONE");
    seedRefinedUnit(db, ACB_BANK_ID, "unit-bank-bs",     bankBsMd, "DONE");

    const handler = buildFinalizeBctcRefineHandler(db);
    const result = await handler({ report_id: ACB_BANK_ID, report_status: "DONE" });
    const parsed = JSON.parse(result.content[0]!.text) as { ok: boolean };
    expect(parsed.ok).toBe(true);

    // ── ANTI-FALSE-GREEN: direct bun:sqlite DB reads ───────────────────────────
    const after = readScalars(db, ACB_BANK_ID);
    expect(after).not.toBeNull();

    // CORE ASSERTION 1: gross_profit MUST be NULL (not-applicable Case 1 cleared stale value)
    // PRE-FU-6e RED: would be 6,989,162 (null-skip preserved stale value)
    // POST-FU-6e GREEN: NULL (notApplicable SET NULL fired)
    expect(after!.gross_profit).toBeNull();

    // CORE ASSERTION 2: gross_margin_pct MUST be NULL (derived column, also not-applicable)
    // PRE-FU-6e RED: would be 100.0 (stale derived value persisted)
    // POST-FU-6e GREEN: NULL (gross_margin_pct in notApplicable for bank)
    expect(after!.gross_margin_pct).toBeNull();

    // CORE ASSERTION 3: all other ACB scalars must be correct / unchanged
    // (net_revenue, profit_before_tax, net_profit written from resolved aggregator values)
    expect(after!.net_revenue).not.toBeNull();
    expect(after!.net_revenue).toBe(6_989_162);

    expect(after!.profit_before_tax).not.toBeNull();
    expect(after!.profit_before_tax).toBe(5_368_138);

    expect(after!.net_profit).not.toBeNull();
    expect(after!.net_profit).toBe(4_320_388);

    // Balance sheet scalars intact
    expect(after!.total_assets).not.toBeNull();
    expect(after!.total_liabilities).not.toBeNull();
    expect(after!.equity_total).not.toBeNull();
  });
});

// ── DV-FU6E-2: Corporate FPT — gross_profit MUST NOT be nulled ───────────────

describe("DV-FU6E-2 — [GREEN guard] Corporate report: gross_profit resolves to value, must NOT be nulled", () => {
  /**
   * Guards against over-nulling: notApplicable=[] for corporate reports.
   * If the fix incorrectly treated all null-on-bank-path columns as not-applicable
   * for ALL reports, corporate gross_profit would be zeroed out — catastrophic regression.
   *
   * FPT: code "10" present → isBankPath=false → notApplicable=[] → no null clear.
   * gross_profit from code "20" = 4,244,890 must survive finalize unchanged.
   *
   * This is the FPT regression-confirm from QA: "gross MUST stay 4,244,890, NOT get nulled".
   */

  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });
  afterEach(() => {
    db.close();
  });

  it("[GREEN guard] FPT corporate: gross_profit=4,244,890 after finalize, NOT nulled", async () => {
    // Seed with wrong stale values (simulating pre-finalize state)
    seedReportWithStaleScalars(db, FPT_CORP_ID, "FPT", "technology", {
      net_revenue:  12_479_997,
      gross_profit: 12_479_997, // wrong: 100% margin — will be corrected by finalize
    });

    // FPT corporate markdown — code "10" present (triggers isBankPath=false, notApplicable=[])
    // Values in raw-VND so divisor=1e6 applies (max value > 1e11)
    const incomeMd = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 10 | Doanh thu thuần về bán hàng và cung cấp dịch vụ | 12.479.997.206.775 | 11.000.000.000.000 |",
      "| 20 | Lợi nhuận gộp về bán hàng và cung cấp dịch vụ | 4.244.889.890.688 | 3.800.000.000.000 |",
      "| 50 | Lợi nhuận kế toán trước thuế thu nhập doanh nghiệp | 2.803.844.281.676 | 2.500.000.000.000 |",
      "| 60 | Lợi nhuận sau thuế thu nhập doanh nghiệp | 2.476.789.833.481 | 2.200.000.000.000 |",
    ].join("\n");

    const bsMd = [
      "BẢNG CÂN ĐỐI KẾ TOÁN",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 280 | TỔNG CỘNG TÀI SẢN | 68.586.094.785.217 | 65.000.000.000.000 |",
      "| 300 | Nợ phải trả | 28.464.058.214.856 | 27.000.000.000.000 |",
      "| 400 | Vốn chủ sở hữu | 40.122.036.570.361 | 38.000.000.000.000 |",
    ].join("\n");

    seedRefinedUnit(db, FPT_CORP_ID, "unit-fpt-income", incomeMd, "DONE");
    seedRefinedUnit(db, FPT_CORP_ID, "unit-fpt-bs",     bsMd, "DONE");

    const handler = buildFinalizeBctcRefineHandler(db);
    const result = await handler({ report_id: FPT_CORP_ID, report_status: "DONE" });
    const parsed = JSON.parse(result.content[0]!.text) as { ok: boolean };
    expect(parsed.ok).toBe(true);

    // ── ANTI-FALSE-GREEN: direct bun:sqlite DB reads ───────────────────────────
    const after = readScalars(db, FPT_CORP_ID);
    expect(after).not.toBeNull();

    // CORE ASSERTION: gross_profit must be ~4,244,890 (from code "20", raw-VND ÷ 1e6)
    // NOT null (notApplicable=[] for corporate — no null clear fires)
    // NOT 12,479,997 (the stale 100%-margin value is overwritten by Case 3)
    expect(after!.gross_profit).not.toBeNull();
    expect(Math.round(after!.gross_profit!)).toBe(4_244_890);

    // gross_margin_pct must be ~34% (not null, not 100%)
    expect(after!.gross_margin_pct).not.toBeNull();
    expect(after!.gross_margin_pct!).toBeGreaterThan(33);
    expect(after!.gross_margin_pct!).toBeLessThan(35);

    // net_revenue also correct (~12,479,997)
    expect(after!.net_revenue).not.toBeNull();
    expect(Math.round(after!.net_revenue!)).toBe(12_479_997);

    // DT-2 guard: gross_profit must NOT equal net_revenue (not 100% margin)
    expect(after!.gross_profit).not.toBe(after!.net_revenue);
  });
});

// ── DV-FU6E-3: Corporate transient null gross_profit → SKIP (FU-5 preserved) ─

describe("DV-FU6E-3 — [GREEN guard] Corporate gross_profit transiently null → prior value preserved (FU-5 Case 2)", () => {
  /**
   * FU-5 preservation test: a corporate report where code "20" is absent from this
   * run's rows (parse miss — not a bank, just a transient extraction failure).
   *
   * Since it's corporate, notApplicable=[] (code "10" IS present → isBankPath=false).
   * gross_profit=null is Case 2 (expected-but-null, not in notApplicable) → SKIP.
   * Prior value (e.g. 3,000 from a prior run) MUST be preserved.
   *
   * This distinguishes "bank: gross concept does not exist" from
   * "corporate: gross concept exists but failed to parse this run".
   */

  let db: Database;

  beforeEach(() => {
    db = openTestDb();
  });
  afterEach(() => {
    db.close();
  });

  it("[GREEN guard] corporate gross_profit transiently null (code 20 absent) → prior 3,000 preserved", async () => {
    // Seed with a PRIOR correct gross_profit value (from a previous finalize run)
    const PRIOR_GROSS = 3_000; // million VND — a real previously computed value

    seedReportWithStaleScalars(db, TRANSIENT_ID, "VNM", "consumer_goods", {
      net_revenue:  10_000,
      gross_profit: PRIOR_GROSS,  // prior real value — must survive this run
      gross_margin_pct: 30.0,     // prior derived value — must survive this run
      total_assets: 50_000,
      total_liabilities: 30_000,
      equity_total: 20_000,
    });

    // Corporate markdown — code "10" present (isBankPath=false, notApplicable=[])
    // code "20" is ABSENT from this run (transient parse miss)
    // Values in million VND (< 1e11 → divisor=1)
    const incomeMdNoGross = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 10 | Doanh thu thuần | 10.000 | 9.500 |",
      // code "20" deliberately absent — simulates a transient parse miss
      "| 50 | Lợi nhuận trước thuế | 1.500 | 1.400 |",
      "| 60 | Lợi nhuận sau thuế | 1.200 | 1.100 |",
    ].join("\n");

    const bsMdTransient = [
      "BẢNG CÂN ĐỐI KẾ TOÁN",
      "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
      "|---|---|---|---|",
      "| 280 | TỔNG CỘNG TÀI SẢN | 50.000 | 48.000 |",
      "| 300 | Nợ phải trả | 30.000 | 29.000 |",
      "| 400 | Vốn chủ sở hữu | 20.000 | 19.000 |",
    ].join("\n");

    seedRefinedUnit(db, TRANSIENT_ID, "unit-vnm-income", incomeMdNoGross, "DONE");
    seedRefinedUnit(db, TRANSIENT_ID, "unit-vnm-bs",     bsMdTransient,    "DONE");

    const handler = buildFinalizeBctcRefineHandler(db);
    const result = await handler({ report_id: TRANSIENT_ID, report_status: "DONE" });
    const parsed = JSON.parse(result.content[0]!.text) as { ok: boolean };
    expect(parsed.ok).toBe(true);

    // ── ANTI-FALSE-GREEN: direct bun:sqlite DB reads ───────────────────────────
    const after = readScalars(db, TRANSIENT_ID);
    expect(after).not.toBeNull();

    // CORE ASSERTION (FU-5 Case 2 preservation):
    // gross_profit returned null from aggregator (code "20" absent this run).
    // notApplicable=[] for corporate → null is NOT not-applicable → SKIP.
    // Prior value MUST be preserved (not zeroed, not nulled).
    expect(after!.gross_profit).toBe(PRIOR_GROSS);   // prior value preserved
    expect(after!.gross_profit).not.toBeNull();
    expect(after!.gross_profit).not.toBe(0);

    // gross_margin_pct: also expected-but-null (not in notApplicable for corporate)
    // → SKIP → prior 30.0 is preserved
    expect(after!.gross_margin_pct).toBe(30.0);       // prior derived value preserved

    // Other scalars from this run must be correctly written (Case 3):
    expect(after!.net_revenue).toBe(10_000);
    expect(after!.total_assets).toBe(50_000);
  });
});

// ── DV-FU6E-4: Unit test — aggregateScalars.notApplicable populated correctly ─

describe("DV-FU6E-4 — [Unit] aggregateScalars.notApplicable populated per report type", () => {
  /**
   * Pure aggregator assertions — no DB, no finalize.
   * Verifies the notApplicable field is correctly populated based on isBankPath.
   */

  it("[Unit] bank rows (no code '10') → notApplicable contains gross_profit, current_assets, gross_margin_pct", () => {
    // Bank-shaped rows: code "I" for income (no code "10")
    const bankRows: AggregatorRow[] = [
      { code: "I",    label: "Thu nhập lãi và các khoản thu nhập tương tự", value_current: 6_989_162, is_summary_row: 1, statement_section: "general", unit: "billion_vnd" },
      { code: "VIII", label: "Lợi nhuận trước thuế",                         value_current: 5_368_138, is_summary_row: 1, statement_section: "general", unit: "billion_vnd" },
      { code: "IX",   label: "Lợi nhuận sau thuế thu nhập doanh nghiệp",     value_current: 4_320_388, is_summary_row: 1, statement_section: "general", unit: "billion_vnd" },
      { code: null,   label: "TỔNG TÀI SẢN",                                 value_current: 1_030_900_741, is_summary_row: 1, statement_section: "general", unit: "billion_vnd" },
      { code: null,   label: "TỔNG NỢ PHẢI TRẢ",                             value_current:   932_149_689, is_summary_row: 1, statement_section: "general", unit: "billion_vnd" },
      { code: "VIII", label: "VỐN CHỦ SỞ HỮU",                               value_current:    98_751_052, is_summary_row: 1, statement_section: "general", unit: "billion_vnd" },
    ];

    const result = aggregateScalars(bankRows);

    // Bank: notApplicable must contain all three not-applicable columns
    expect(result.notApplicable).toContain("gross_profit");
    expect(result.notApplicable).toContain("current_assets");
    expect(result.notApplicable).toContain("gross_margin_pct");

    // Also confirm bank aggregator still correct (smoke check)
    expect(result.scalars.gross_profit).toBeNull();
    expect(result.scalars.current_assets).toBeNull();
    expect(result.scalars.gross_margin_pct).toBeNull();
    expect(result.balanceViolation).toBeNull();
  });

  it("[Unit] corporate rows (code '10' present) → notApplicable is empty []", () => {
    // Corporate-shaped rows: code "10" present → isBankPath=false
    const corporateRows: AggregatorRow[] = [
      { code: "10",  label: "Doanh thu thuần",      value_current: 12_479_997_206_775, is_summary_row: 1, statement_section: "income_statement", unit: "billion_vnd" },
      { code: "20",  label: "Lợi nhuận gộp",         value_current:  4_244_889_890_688, is_summary_row: 1, statement_section: "income_statement", unit: "billion_vnd" },
      { code: "60",  label: "Lợi nhuận sau thuế",    value_current:  2_476_789_833_481, is_summary_row: 1, statement_section: "income_statement", unit: "billion_vnd" },
      { code: "280", label: "TỔNG CỘNG TÀI SẢN",    value_current: 68_586_094_785_217, is_summary_row: 1, statement_section: "general", unit: "billion_vnd" },
      { code: "300", label: "Nợ phải trả",           value_current: 28_464_058_214_856, is_summary_row: 1, statement_section: "general", unit: "billion_vnd" },
      { code: "400", label: "Vốn chủ sở hữu",       value_current: 40_122_036_570_361, is_summary_row: 1, statement_section: "general", unit: "billion_vnd" },
    ];

    const result = aggregateScalars(corporateRows);

    // Corporate: notApplicable must be empty (no structural absences for corporate)
    expect(result.notApplicable).toHaveLength(0);

    // Corporate gross_profit resolved correctly
    expect(result.scalars.gross_profit).not.toBeNull();
    expect(result.balanceViolation).toBeNull();
  });

  it("[Unit] empty row set → notApplicable is [] (no false bank classification on empty input)", () => {
    // Edge case: empty rows → code "10" absent → technically isBankPath=true.
    // But empty set returns early before the bank detection runs.
    // The result should be notApplicable=[] (the early return path).
    const result = aggregateScalars([]);
    expect(result.notApplicable).toHaveLength(0);
  });
});
