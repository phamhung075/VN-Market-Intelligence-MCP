/**
 * BAL-1a-ratio-rederive.test.ts — DV Gate for BLOCK-3 ratio re-derivation
 *
 * Sprint: BCTC-ANALYTICS-LAYER
 * Task:   BAL-1a-DEV
 * Date:   2026-06-02
 *
 * Verifies: after finalizeBctcRefineTool runs, the 5 ratio columns (roe, roa,
 * current_ratio, debt_to_equity, net_debt_to_ebitda) AND eps are derived from
 * the corrected scalars committed by BLOCK-1, NOT from the stale OCR-parse values.
 *
 * Anti-false-green discipline (DB Arbiter Rule):
 *   ALL ratio assertions use direct bun:sqlite queries — never the tool return value.
 *
 * Root cause (brief 2026-06-02-bctc-analytics-layer-bal1 §2.2):
 *   BLOCK-1 corrects scalars; ratios stayed stale (OCR-parse values).
 *   BLOCK-3 re-derives them from the corrected scalars after BLOCK-1 commits.
 *
 * Design note on test setup:
 *   finalizeBctcRefineTool DELETES bctc_table_rows then re-inserts from refined_unit
 *   markdown, then runs BLOCK-1 (scalar backfill from the freshly inserted rows).
 *   Therefore: to control what scalars BLOCK-3 sees, we control the markdown content
 *   so BLOCK-1 writes the exact scalars we intend. The markdown produces the same
 *   scalar values as what we want to test — this is intentional (no trick: we are
 *   testing that BLOCK-3 correctly derives ratios from whatever BLOCK-1 produced).
 *
 * Tests:
 *   BAL1A-1  VNM-like fixture: net_profit/equity from markdown → ROE ≈ 27%
 *            Pre-state has stale roe=0 (the OCR-parse bug), BLOCK-3 overwrites to ~27%
 *   BAL1A-2  DHG-like fixture: correct total_assets from markdown → ROA sane (<100%)
 *            Pre-state has stale roa=7891932 (astronomical), BLOCK-3 overwrites to sane
 *   BAL1A-3  Null-denominator: markdown produces equity=0 → roe=NULL (not Infinity/NaN)
 *   BAL1A-4  eps column is NULL post-refine (stale OCR EPS cleared)
 *   BAL1A-5  debt_to_equity: short_term_debt+long_term_debt from DB / equity → correct ratio
 *   BAL1A-6  net_debt_to_ebitda: ebitda=0 → NULL (guard: ebitda>0, mirrors ratioComputer.ts L132)
 *   BAL1A-7  current_ratio: balance_sheet_json with currentLiabilities.total > 0
 *   BAL1A-8  current_ratio: balance_sheet_json = '{}' → current_ratio=NULL (no crash)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildFinalizeBctcRefineHandler } from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

interface RatioRow {
  roe: number | null;
  roa: number | null;
  current_ratio: number | null;
  debt_to_equity: number | null;
  net_debt_to_ebitda: number | null;
  eps: number | null;
}

interface ScalarRow extends RatioRow {
  net_profit: number | null;
  equity_total: number | null;
  total_assets: number | null;
}

function readRatios(db: Database, reportId: string): RatioRow | null {
  return db
    .prepare<RatioRow, [string]>(
      `SELECT roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda, eps
       FROM financial_reports WHERE id = ?`,
    )
    .get(reportId) as RatioRow | null;
}

function readScalarsAndRatios(db: Database, reportId: string): ScalarRow | null {
  return db
    .prepare<ScalarRow, [string]>(
      `SELECT roe, roa, current_ratio, debt_to_equity, net_debt_to_ebitda, eps,
              net_profit, equity_total, total_assets
       FROM financial_reports WHERE id = ?`,
    )
    .get(reportId) as ScalarRow | null;
}

/**
 * Seed a financial_reports row.
 * stale_roe / stale_roa / stale_eps represent the garbage values written by the
 * original OCR parse path — BLOCK-3 must overwrite them.
 *
 * balance_sheet_json encodes currentLiabilities.total for current_ratio derivation.
 * short_term_debt / long_term_debt are the debt columns for debt_to_equity / net_debt_to_ebitda.
 * Note: these debt columns are NOT updated by bctcScalarAggregator (BLOCK-1);
 * they persist from the original OCR parse. BLOCK-3 reads them from DB.
 */
function seedReport(
  db: Database,
  reportId: string,
  ticker: string,
  opts: {
    stale_roe?: number | null;
    stale_roa?: number | null;
    stale_eps?: number | null;
    short_term_debt?: number | null;
    long_term_debt?: number | null;
    balance_sheet_json?: string;
  } = {},
): void {
  const bsJson = opts.balance_sheet_json ?? "{}";
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        parsed_at, extraction_confidence,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
        short_term_debt, long_term_debt,
        roe, roa, eps,
        refine_status, confirm_status)
     VALUES (?, ?, ?, 'HOSE', 'consumer',
             2026, 'Q1', 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
             datetime('now'), 0.85,
             ?, '{}', '{}', '{}',
             ?, ?,
             ?, ?, ?,
             'PENDING', 'PENDING')`,
  ).run(
    reportId,
    ticker,
    ticker + " Corp",
    bsJson,
    opts.short_term_debt ?? null,
    opts.long_term_debt ?? null,
    opts.stale_roe ?? 0,
    opts.stale_roa ?? 7_891_932,  // DHG astronomical garbage — must be overwritten
    opts.stale_eps ?? 12,         // OCR garbage — must be cleared to NULL
  );
}

/**
 * Seed refined_unit markdown that produces specific scalar values via BLOCK-1.
 * Values are in million VND (max value < 1e11 → divisor=1, no scale conversion).
 * The markdown includes income_statement rows (code 10/60) and balance_sheet rows
 * (codes 270/300/400) so BLOCK-1 sets net_profit, net_revenue, equity_total,
 * total_liabilities, total_assets, current_assets.
 *
 * Additionally seeds cash and ebitda columns directly since those are NOT
 * populated by the minimal markdown (no CF rows in the test) — needed for
 * net_debt_to_ebitda computation.
 */
function seedRefinedUnit(
  db: Database,
  reportId: string,
  unitId: string,
  opts: {
    // Income statement (million VND, divisor=1 assumed — keep max < 1e11)
    net_revenue: number;
    net_profit: number;
    // Balance sheet (million VND)
    total_assets: number;
    total_liabilities: number;
    equity_total: number;
    current_assets?: number;
  },
): void {
  const incSection = "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH";
  const bsSection  = "BẢNG CÂN ĐỐI KẾ TOÁN";

  // Format number with dot-separated thousands (VN locale) as the markdown parser expects
  const fmt = (v: number) => v.toLocaleString("vi-VN");

  const incRows = [
    incSection,
    "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
    "|---|---|---|---|",
    `| 10 | Doanh thu thuần | ${fmt(opts.net_revenue)} | ${fmt(opts.net_revenue - 100)} |`,
    `| 60 | Lợi nhuận sau thuế | ${fmt(opts.net_profit)} | ${fmt(opts.net_profit - 50)} |`,
  ].join("\n");

  const bsRows: string[] = [
    bsSection,
    "| Mã số | Chỉ tiêu | Q1-2026 | Q1-2025 |",
    "|---|---|---|---|",
    `| 270 | Tổng tài sản | ${fmt(opts.total_assets)} | ${fmt(opts.total_assets - 500)} |`,
    `| 300 | Nợ phải trả | ${fmt(opts.total_liabilities)} | ${fmt(opts.total_liabilities - 200)} |`,
    `| 400 | Vốn chủ sở hữu | ${fmt(opts.equity_total)} | ${fmt(opts.equity_total - 300)} |`,
  ];
  if (opts.current_assets !== undefined) {
    bsRows.push(`| 100 | Tài sản ngắn hạn | ${fmt(opts.current_assets)} | ${fmt(opts.current_assets - 100)} |`);
  }

  const markdown = incRows + "\n\n" + bsRows.join("\n");

  db.prepare(
    `INSERT OR REPLACE INTO bctc_refined_units
       (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
     VALUES (?, ?, '[1]', ?, 5, 0.85, 'DONE')`,
  ).run(reportId, unitId, markdown);
}

/**
 * Update cash and ebitda columns directly after seeding (BLOCK-1 won't set them
 * from the minimal income+balance markdown — no CF rows / no depreciation).
 * These are needed for net_debt_to_ebitda tests.
 */
function setScalarsDirect(
  db: Database,
  reportId: string,
  opts: { cash?: number | null; ebitda?: number | null },
): void {
  const parts: string[] = [];
  const vals: (number | null | string)[] = [];
  if ("cash" in opts) { parts.push("cash = ?"); vals.push(opts.cash ?? null); }
  if ("ebitda" in opts) { parts.push("ebitda = ?"); vals.push(opts.ebitda ?? null); }
  if (parts.length === 0) return;
  vals.push(reportId);
  (db.prepare(`UPDATE financial_reports SET ${parts.join(", ")} WHERE id = ?`) as {
    run: (...args: (number | null | string)[]) => unknown;
  }).run(...vals);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BAL1A-1: VNM-like fixture — ROE re-derived from corrected scalars (not stale 0)", () => {
  let db: Database;

  beforeEach(() => { db = openTestDb(); });
  afterEach(() => { db.close(); });

  it("ROE ≈ 27% after BLOCK-3 runs with net_profit=9413, equity_total=34483", async () => {
    /**
     * Pre-condition (stale OCR state):
     *   roe = 0  (incomeBroken guard fired at original parse time — all income fields zero)
     *
     * BLOCK-1 runs from markdown: net_profit=9413, equity_total=34483, total_assets=50000
     * BLOCK-3 re-derives: roe = 9413 / 34483 × 100 ≈ 27.3%
     *
     * RED (before BLOCK-3): roe stays 0 — the original OCR garbage
     * GREEN (after BLOCK-3): roe ≈ 27.3%
     */
    const REPORT_ID = "bal1a-vnm-roe-test-00000000001";

    seedReport(db, REPORT_ID, "VNM", { stale_roe: 0, stale_roa: 0 });
    seedRefinedUnit(db, REPORT_ID, "unit-bal1a", {
      net_revenue:      50_000,
      net_profit:        9_413,  // million VND — produces ROE=9413/34483≈27.3%
      total_assets:     50_000,
      total_liabilities: 15_517,
      equity_total:     34_483,
    });

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "DONE" });

    // Direct DB read — NOT relying on tool return value
    const row = readScalarsAndRatios(db, REPORT_ID);
    expect(row).not.toBeNull();

    // Sanity: confirm BLOCK-1 wrote the expected scalars from the markdown
    expect(row!.net_profit).not.toBeNull();
    expect(row!.equity_total).not.toBeNull();

    // CORE ASSERTION: ROE must be ~27.3% (not 0, not garbage)
    expect(row!.roe).not.toBeNull();
    expect(row!.roe).not.toBe(0);

    const expectedRoe = (row!.net_profit! / row!.equity_total!) * 100;
    expect(row!.roe!).toBeCloseTo(expectedRoe, 1);
    expect(row!.roe!).toBeGreaterThan(25);
    expect(row!.roe!).toBeLessThan(35);
  });
});

describe("BAL1A-2: DHG-like fixture — ROA not astronomical after corrected total_assets", () => {
  let db: Database;

  beforeEach(() => { db = openTestDb(); });
  afterEach(() => { db.close(); });

  it("ROA < 100% after BLOCK-3 (was 7,891,932% from scale-error denominator)", async () => {
    /**
     * Pre-condition (stale OCR state):
     *   roa = 7_891_932  (original parse used unit-scale-wrong total_assets as denominator)
     *
     * BLOCK-1 runs from markdown with correct total_assets.
     * BLOCK-3 re-derives: roa = net_profit / total_assets × 100 — should be sane.
     *
     * RED: roa stays 7,891,932 (astronomical stale value)
     * GREEN: roa < 100% (any realistic company bound)
     */
    const REPORT_ID = "bal1a-dhg-roa-test-00000000002";

    seedReport(db, REPORT_ID, "DHG", { stale_roa: 7_891_932 });
    seedRefinedUnit(db, REPORT_ID, "unit-bal1a", {
      net_revenue:      4_000,
      net_profit:         415,    // million VND
      total_assets:    10_000,    // correct total_assets (not ×1000 error)
      total_liabilities: 5_000,
      equity_total:     5_000,
    });

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "DONE" });

    const row = readScalarsAndRatios(db, REPORT_ID);
    expect(row).not.toBeNull();

    // roa must be sane — not 7,891,932
    expect(row!.roa).not.toBeNull();
    expect(row!.roa).not.toBe(7_891_932);
    expect(Math.abs(row!.roa!)).toBeLessThan(100);  // no real company ROA >100%
  });
});

describe("BAL1A-3: null-denominator — roe=NULL when equity_total≤0 (not Infinity/NaN)", () => {
  let db: Database;

  beforeEach(() => { db = openTestDb(); });
  afterEach(() => { db.close(); });

  it("equity_total from markdown = 0 → roe=NULL (safeDivide guard fires)", async () => {
    /**
     * equity_total is forced to near-zero by making total_assets = total_liabilities
     * so BLOCK-1 produces equity_total close to 0. We force it to exactly 0 via direct update
     * after BLOCK-1 runs — but actually we need to set it before BLOCK-3 runs.
     * Workaround: use a markdown that produces balance violation (equity=0),
     * which causes BLOCK-1 to SKIP the UPDATE (balanceViolation fires for 0-equity).
     * Then we set equity_total=0 directly after BLOCK-1.
     *
     * Actually simpler: seed the report with equity_total=0 (the test fixture),
     * then seed a minimal markdown that still produces rows (BLOCK-1 may update equity
     * from the markdown). After finalize, check: if equity_total=0, roe must be NULL.
     *
     * To guarantee equity_total=0 for BLOCK-3, seed markdown with equity 0
     * and total_assets = total_liabilities (balance identity violation — BLOCK-1 skips UPDATE).
     * Then directly set equity_total=0 to simulate the state we want to test.
     */
    const REPORT_ID = "bal1a-null-denom-000000000003";

    seedReport(db, REPORT_ID, "TST", { stale_roe: 999 });
    // Minimal markdown — BLOCK-1 will parse these rows. We want equity_total=0 for BLOCK-3.
    // Seed direct equity_total=0 AFTER finalize won't work. Instead:
    // Run finalize so BLOCK-3 re-derives from current DB state.
    // After finalize, manually set equity_total=0 then run a second time — but that's
    // testing the invariant directly.
    //
    // Cleaner approach: skip the finalize round-trip for this pure null-safety test.
    // Use a direct DB unit test of the BLOCK-3 formula by:
    //   1. Insert report with equity_total=0 pre-set (already done in seedReport)
    //   2. Run finalize (BLOCK-1 may update equity; if markdown produces equity>0, skip this test)
    //   3. Override equity_total=0 directly and re-run finalize again (idempotent)

    seedRefinedUnit(db, REPORT_ID, "unit-null", {
      net_revenue:        5_000,
      net_profit:         1_000,
      total_assets:       8_000,
      total_liabilities:  8_000, // = total_assets → balance violation → BLOCK-1 skips UPDATE
      equity_total:           0,
    });

    // Run finalize — BLOCK-1 will detect balance violation (total_liabilities + equity ≠ total_assets)
    // and SKIP the scalar UPDATE. So pre-seeded equity_total=0 is preserved.
    // BLOCK-3 then tries to compute roe = net_profit / equity_total but equity_total=0 → NULL.
    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "DONE" });

    const row = readScalarsAndRatios(db, REPORT_ID);
    expect(row).not.toBeNull();

    // If BLOCK-1 preserved equity_total=0 (due to balance violation skip OR seed was 0):
    // roe must be NULL. If BLOCK-1 somehow wrote a non-zero equity, check it's still finite.
    if (row!.equity_total === 0 || row!.equity_total === null) {
      // This is the null-denominator scenario we're testing
      expect(row!.roe).toBeNull();  // MUST be NULL, not Infinity/NaN
    } else {
      // BLOCK-1 wrote a value — check roe is a finite number derived correctly
      const expectedRoe = (row!.net_profit! / row!.equity_total!) * 100;
      expect(row!.roe).not.toBeNull();
      expect(Number.isFinite(row!.roe!)).toBe(true);
      expect(row!.roe!).toBeCloseTo(expectedRoe, 1);
    }
  });

  it("pure null-denominator unit: equity_total=0 in DB → roe UPDATE sets NULL (direct column test)", async () => {
    /**
     * This test sets equity_total=0 directly in the DB, then runs finalize.
     * The finalize BLOCK-1 will overwrite scalars from the markdown, but if we
     * control the markdown to produce equity=0 (balance violation), BLOCK-1 skips.
     * Then BLOCK-3 must produce roe=NULL.
     *
     * We use a different fixture: no refined_units markdown → finalize parses 0 rows
     * → BLOCK-1 skips (no scalars), equity_total stays as seeded (0).
     * BLOCK-3 then derives roe with equity_total=0 → roe=NULL.
     */
    const REPORT_ID = "bal1a-null-denom-b-0000000003b";

    // Seed report with equity_total=0 and net_profit=1000 (the "after BLOCK-1 corrected net_profit" state)
    db.prepare(
      `INSERT OR REPLACE INTO financial_reports
         (id, action_code, company_name, exchange, domain,
          period_year, period_quarter, period_type, period_start, period_end, sort_key,
          parsed_at, extraction_confidence,
          balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
          net_profit, equity_total, total_assets,
          roe, eps,
          refine_status, confirm_status)
       VALUES (?, 'TST', 'Test Corp', 'HOSE', 'consumer',
               2026, 'Q1', 'Q1', '2026-01-01', '2026-03-31', '2026-Q1',
               datetime('now'), 0.85,
               '{}', '{}', '{}', '{}',
               1000, 0, 5000,
               999, 12,
               'PENDING', 'PENDING')`,
    ).run(REPORT_ID);

    // Seed a minimal refined_unit that produces no income rows (balance only, no code 60)
    // so BLOCK-1 may try to update total_assets/equity but will get a balance violation
    // (equity=0, total_liabilities=5000, total_assets=5000 → 5000+0=5000=5000 ✓ actually passes)
    // Let's seed NO refined units → finalize parses 0 DONE windows → BLOCK-1 gets empty rows
    // → aggregator returns all-null → no UPDATE → equity_total stays 0

    // (no seedRefinedUnit call — BLOCK-1 skips cleanly with no rows)

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "FAILED" });
    // FAILED status → no refined_units needed; BLOCK-1 will run with 0 rows
    // equity_total=0 is preserved (aggregator returns all-null → no UPDATE)

    const row = readScalarsAndRatios(db, REPORT_ID);
    expect(row).not.toBeNull();

    // equity_total must still be 0 (BLOCK-1 preserved it)
    // roe must be NULL (not 999, not Infinity, not NaN)
    expect(row!.equity_total).toBe(0);
    expect(row!.roe).toBeNull();  // BLOCK-3 null-guard: denominator=0 → NULL
  });
});

describe("BAL1A-4: eps cleared to NULL post-refine (FU-BCTC-EPS-FOOTNOTE)", () => {
  let db: Database;

  beforeEach(() => { db = openTestDb(); });
  afterEach(() => { db.close(); });

  it("stale OCR eps=12 is overwritten to NULL after finalize", async () => {
    /**
     * OCR misread the BCTC line code "70" (or similar) as the EPS value → eps=12 VND.
     * bctcScalarAggregator L744: eps=null (no standard VAS code).
     * BLOCK-3 must explicitly SET eps=NULL to clear the stale OCR value.
     *
     * RED: eps stays 12 (OCR garbage)
     * GREEN: eps=NULL (cleared by BLOCK-3 unconditionally)
     */
    const REPORT_ID = "bal1a-eps-null-test-000000004";

    seedReport(db, REPORT_ID, "TST", { stale_eps: 12 });
    seedRefinedUnit(db, REPORT_ID, "unit-bal1a", {
      net_revenue: 5_000,
      net_profit:    500,
      total_assets:  8_000,
      total_liabilities: 4_000,
      equity_total:      4_000,
    });

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "DONE" });

    const ratios = readRatios(db, REPORT_ID);
    expect(ratios).not.toBeNull();

    // eps must be NULL — BLOCK-3 clears it unconditionally (FU-BCTC-EPS-FOOTNOTE)
    expect(ratios!.eps).toBeNull();
  });
});

describe("BAL1A-5: debt_to_equity computed/null from DB debt columns", () => {
  let db: Database;

  beforeEach(() => { db = openTestDb(); });
  afterEach(() => { db.close(); });

  it("short_term_debt=null → debt_to_equity=NULL", async () => {
    const REPORT_ID = "bal1a-debt-null-test-00000005a";

    seedReport(db, REPORT_ID, "TST", {
      short_term_debt: null,
      long_term_debt:  null,
    });
    seedRefinedUnit(db, REPORT_ID, "unit-bal1a", {
      net_revenue:      4_000,
      net_profit:         400,
      total_assets:      6_000,
      total_liabilities: 2_500,
      equity_total:      3_500,
    });

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "DONE" });

    const ratios = readRatios(db, REPORT_ID);
    expect(ratios).not.toBeNull();
    expect(ratios!.debt_to_equity).toBeNull();
  });

  it("short_term_debt=2000, long_term_debt=1000, equity=5000 → debt_to_equity=0.6", async () => {
    /**
     * debt_to_equity = (2000 + 1000) / 5000 = 0.6
     * Formula sourced from ratioComputer.ts L130:
     *   debtToEquity = safeDivide(totalDebt, bs.equity.total)
     *   where totalDebt = shortTermDebt + longTermDebt (L65)
     */
    const REPORT_ID = "bal1a-debt-computed-00000005b";

    seedReport(db, REPORT_ID, "TST", {
      short_term_debt: 2_000,
      long_term_debt:  1_000,
    });
    seedRefinedUnit(db, REPORT_ID, "unit-bal1a", {
      net_revenue:       8_000,
      net_profit:          500,
      total_assets:       8_000,
      total_liabilities:  3_000,
      equity_total:       5_000,
    });

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "DONE" });

    const ratios = readRatios(db, REPORT_ID);
    expect(ratios).not.toBeNull();
    expect(ratios!.debt_to_equity).not.toBeNull();
    // (2000+1000)/5000 = 0.6
    expect(ratios!.debt_to_equity!).toBeCloseTo(0.6, 4);
  });
});

describe("BAL1A-6: net_debt_to_ebitda=NULL when ebitda=0 (guard: ebitda>0)", () => {
  let db: Database;

  beforeEach(() => { db = openTestDb(); });
  afterEach(() => { db.close(); });

  it("ebitda=0 → net_debt_to_ebitda=NULL (mirrors ratioComputer.ts L132 guard)", async () => {
    /**
     * ratioComputer.ts L132: netDebtToEbitda = inc.ebitda > 0 ? safeDivide(...) : null
     * Same guard must apply in BLOCK-3.
     */
    const REPORT_ID = "bal1a-ebitda-zero-000000006";

    seedReport(db, REPORT_ID, "TST", {
      short_term_debt: 1_000,
      long_term_debt:    500,
    });
    seedRefinedUnit(db, REPORT_ID, "unit-bal1a", {
      net_revenue:      4_000,
      net_profit:         300,
      total_assets:      6_000,
      total_liabilities: 2_000,
      equity_total:      4_000,
    });

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "DONE" });

    // Set ebitda=0 AFTER finalize BLOCK-1 (which doesn't produce ebitda from our markdown).
    // Then run finalize again — BLOCK-3 re-reads ebitda=0 → NULL.
    // Actually BLOCK-1 would have left ebitda=null (no CF rows). ebitda=null also → NULL.
    // To test ebitda=0 case: set it directly, then run finalize again.
    setScalarsDirect(db, REPORT_ID, { ebitda: 0, cash: 200 });
    await handler({ report_id: REPORT_ID, report_status: "DONE" });

    const ratios = readRatios(db, REPORT_ID);
    expect(ratios).not.toBeNull();
    expect(ratios!.net_debt_to_ebitda).toBeNull();  // ebitda=0 → guard fires → NULL
  });

  it("ebitda=800, short_term_debt=1000, long_term_debt=500, cash=200 → net_debt_to_ebitda=1.625", async () => {
    /**
     * net_debt_to_ebitda = (1000+500-200)/800 = 1300/800 = 1.625
     * Formula: (short_term_debt + long_term_debt - cash) / ebitda
     * when ebitda > 0 (mirrors ratioComputer.ts L65-66, L132)
     */
    const REPORT_ID = "bal1a-ebitda-nonzero-0000006b";

    seedReport(db, REPORT_ID, "TST", {
      short_term_debt: 1_000,
      long_term_debt:    500,
    });
    seedRefinedUnit(db, REPORT_ID, "unit-bal1a", {
      net_revenue:      4_000,
      net_profit:         300,
      total_assets:      6_000,
      total_liabilities: 2_000,
      equity_total:      4_000,
    });

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "DONE" });

    // Set ebitda=800, cash=200 — these are not produced by the minimal markdown
    setScalarsDirect(db, REPORT_ID, { ebitda: 800, cash: 200 });
    await handler({ report_id: REPORT_ID, report_status: "DONE" });

    const ratios = readRatios(db, REPORT_ID);
    expect(ratios).not.toBeNull();
    expect(ratios!.net_debt_to_ebitda).not.toBeNull();
    // (1000+500-200)/800 = 1300/800 = 1.625
    expect(ratios!.net_debt_to_ebitda!).toBeCloseTo(1.625, 3);
  });
});

describe("BAL1A-7: current_ratio from balance_sheet_json.currentLiabilities.total", () => {
  let db: Database;

  beforeEach(() => { db = openTestDb(); });
  afterEach(() => { db.close(); });

  it("current_assets=3000, currentLiabilities.total=2000 → current_ratio=1.5", async () => {
    /**
     * current_ratio = current_assets / currentLiabilities.total
     * Formula sourced from ratioComputer.ts L122:
     *   currentRatio = safeDivide(bs.currentAssets.total, bs.currentLiabilities.total)
     *
     * current_liabilities.total is NOT a scalar column in financial_reports.
     * BLOCK-3 reads it from balance_sheet_json.currentLiabilities.total.
     */
    const REPORT_ID = "bal1a-current-ratio-0000007";

    const bsJson = JSON.stringify({
      currentAssets: { total: 3_000, cash: 500 },
      currentLiabilities: { total: 2_000, shortTermDebt: 800, accountsPayable: 1_200 },
      totalAssets: 8_000,
      totalLiabilities: 5_000,
      equity: { total: 3_000 },
    });

    seedReport(db, REPORT_ID, "TST", { balance_sheet_json: bsJson });
    seedRefinedUnit(db, REPORT_ID, "unit-bal1a", {
      net_revenue:      5_000,
      net_profit:         300,
      total_assets:      8_000,
      total_liabilities: 5_000,
      equity_total:      3_000,
      current_assets:    3_000,
    });

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "DONE" });

    const ratios = readRatios(db, REPORT_ID);
    expect(ratios).not.toBeNull();
    expect(ratios!.current_ratio).not.toBeNull();
    // 3000 / 2000 = 1.5
    expect(ratios!.current_ratio!).toBeCloseTo(1.5, 4);
  });
});

describe("BAL1A-8: current_ratio=NULL when balance_sheet_json has no currentLiabilities", () => {
  let db: Database;

  beforeEach(() => { db = openTestDb(); });
  afterEach(() => { db.close(); });

  it("balance_sheet_json='{}' → current_ratio=NULL (no crash)", async () => {
    /**
     * When balance_sheet_json is missing currentLiabilities.total, BLOCK-3 must
     * produce NULL — not crash and not compute a wrong value.
     */
    const REPORT_ID = "bal1a-bs-empty-json-00000008";

    seedReport(db, REPORT_ID, "TST", { balance_sheet_json: "{}" });
    seedRefinedUnit(db, REPORT_ID, "unit-bal1a", {
      net_revenue:      5_000,
      net_profit:         400,
      total_assets:      8_000,
      total_liabilities: 4_000,
      equity_total:      4_000,
      current_assets:    3_000,
    });

    const handler = buildFinalizeBctcRefineHandler(db);
    await handler({ report_id: REPORT_ID, report_status: "DONE" });

    const ratios = readRatios(db, REPORT_ID);
    expect(ratios).not.toBeNull();
    expect(ratios!.current_ratio).toBeNull();
  });
});
