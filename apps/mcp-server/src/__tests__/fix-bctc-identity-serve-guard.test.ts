/**
 * fix-bctc-identity-serve-guard — Unit tests for the shared balance-sheet
 * identity gate (domain/services/financial-reports/bctcIdentityGuard.ts)
 * across ALL THREE `financial_reports` serve paths:
 *   - get_financial_summary (reports.ts)
 *   - compare_financials    (reports.ts)
 *   - get_bctc_full         (bctcFullTools.ts)
 *
 * Root cause: 3rd occurrence of OCR-corruption fingerprint served raw
 * (VNM → VEA → CTG): total_assets=0, equity_total=244_904_000, net_margin=229157%.
 * Gate: total_assets <= 0 OR total_assets < equity_total → confidence=0,
 * corrupt flag, suppress derived ratios.
 *
 * FIX-BCTC-BANK-SUMMARY-MAPPING W1 (FR-5, AC-4, AC-7, AC-12): the gate was
 * originally authored ONLY inside get_financial_summary and never fired on
 * get_bctc_full / compare_financials (never-fired scope gap, not a
 * regression — see architect brief 2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING
 * §3.3). It is now factored into ONE shared helper called by all three tools
 * — this file's later `describe` blocks extend coverage to the other two.
 *
 * Task: FIX-BCTC-IDENTITY-SERVE-GUARD (origin) + FIX-BCTC-BANK-SUMMARY-MAPPING W1 (extension)
 * Layer: interface — injectable SQLite in-memory, no real I/O.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerReportTools } from "../interface/mcp/tools/financial-reports/reports.js";
import { registerBctcFullTools } from "../interface/mcp/tools/financial-reports/bctcFullTools.js";
import { checkBctcIdentityGuard } from "../domain/services/financial-reports/bctcIdentityGuard.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper: invoke a registered MCP tool directly (bypasses SSE transport)
// ─────────────────────────────────────────────────────────────────────────────

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const registry = (server as unknown as {
    _registeredTools: Record<string, {
      handler: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;
  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler(args) as Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: insert a minimal corrupt financial_reports row directly into DB
// ─────────────────────────────────────────────────────────────────────────────

type CorruptRowParams = {
  id: string;
  actionCode: string;
  sortKey: string;
  totalAssets: number;
  equityTotal: number;
  extractionConfidence: number;
  /**
   * W1 addition: get_bctc_full's PUB-1 gate requires refine_status IN
   * ('DONE','PARTIAL') to reach the identity guard's serve path at all when
   * the row is NOT corrupt (corrupt rows short-circuit before PUB-1..8 —
   * see bctcFullTools.ts guard placement). Default 'PENDING' preserves the
   * exact pre-W1 fixture behavior (column was previously omitted from the
   * INSERT and fell back to the schema's ALTER TABLE ... DEFAULT 'PENDING').
   */
  refineStatus?: string;
  /**
   * W1 addition (AC-8/non-regression): lets a fixture pin a stale/failed
   * persisted validation_status independently of the identity guard, which
   * must key ONLY on total_assets/equity_total — never on validation_status.
   */
  validationStatus?: string;
  /**
   * W1 addition: compare_financials needs TWO distinct periods for the same
   * actionCode. Defaults preserve the original hardcoded 2026-Q1 fixture.
   */
  periodYear?: number;
  periodQuarter?: number;
  periodType?: string;
};

function insertCorruptRow(p: CorruptRowParams): void {
  const db = getDb();
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
      balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
      yoy_delta_json, qoq_delta_json, market_data_json, embedding_text, notes_raw_text,
      refine_status, validation_status
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
      '{}', '{}', '{}', '{}',
      NULL, NULL, NULL, $embeddingText, NULL,
      $refineStatus, $validationStatus
    )
  `).run({
    $id: p.id,
    $actionCode: p.actionCode,
    $companyName: p.actionCode + " Corp",
    $exchange: "HOSE",
    $domain: "banking",
    $periodYear: p.periodYear ?? 2026,
    $periodQuarter: p.periodQuarter ?? 1,
    $periodType: p.periodType ?? "Q1",
    $periodStart: "2026-01-01",
    $periodEnd: "2026-03-31",
    $sortKey: p.sortKey,
    $sscUrl: "https://ssc.gov.vn/test-corrupt",
    $publishedAt: "2026-04-15T00:00:00.000Z",
    $parsedAt: "2026-04-15T01:00:00.000Z",
    $auditStatus: "unaudited",
    $extractionConfidence: p.extractionConfidence,
    // OCR-corrupt income statement — non-zero revenue to expose the nonsensical margin
    $netRevenue: 10_608_000,   // ~10.6 tỷ (non-zero so margin would be ~2000x if served)
    $grossProfit: 9_800_000,
    $operatingProfit: 9_500_000,
    $ebitda: 9_500_000,
    $profitBeforeTax: 9_400_000,
    $netProfit: 24_310_000,    // net_profit > net_revenue — nonsensical (229% margin)
    $eps: 3_200,
    $dilutedEps: 3_200,
    // Corrupt balance sheet: assets=0 or assets<equity
    $totalAssets: p.totalAssets,
    $currentAssets: 0,
    $cash: 0,
    $inventory: 0,
    $totalLiabilities: 0,
    $shortTermDebt: 0,
    $longTermDebt: 0,
    $equityTotal: p.equityTotal,
    $operatingCf: 5_000_000,
    $investingCf: -2_000_000,
    $financingCf: 1_000_000,
    $capex: -1_500_000,
    $freeCashFlow: 3_500_000,
    // Nonsensical derived ratios (as OCR corruption produces)
    $grossMarginPct: 92.38,
    $operatingMarginPct: 89.55,
    $netMarginPct: 229157.0,   // The smoking-gun corruption signal
    $roe: null,
    $roa: null,
    $embeddingText: `${p.actionCode} 2026-Q1 corrupt fixture`,
    $refineStatus: p.refineStatus ?? "PENDING",
    $validationStatus: p.validationStatus ?? null,
  });
}

/**
 * W1 addition: insert one bctc_table_rows row so get_bctc_full's PUB-2/PUB-3
 * publishability gates pass (needed only for NON-corrupt fixtures that must
 * reach buildSummarySection — corrupt fixtures short-circuit on the identity
 * guard BEFORE the PUB-1..8 gate runs, so they never need this row).
 */
function insertBalanceSheetRow(reportId: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO bctc_table_rows
      (report_id, page_number, statement_section, row_order, code, label,
       period_current, value_current, is_summary_row)
    VALUES (?, 1, 'balance_sheet', 1, '270', 'Total Assets', '2026-Q1', 100000, 0)
  `).run(reportId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-IDENTITY-SERVE-GUARD — balance-sheet identity gate in get_financial_summary", () => {
  let server: McpServer;

  beforeAll(async () => {
    await initDatabase();
    // Clear any leftover rows from other test files
    getDb().exec("DELETE FROM financial_reports WHERE action_code IN ('CTG', 'VNM_CORRUPT', 'GOOD_CORP')");
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(() => {
    server = new McpServer(
      { name: "test-server", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerReportTools(server);
  });

  // ── G1: CTG-fingerprint (assets=0 < equity=244904000) ─────────────────────
  it("DV-BCTC-GUARD-1: CTG corrupt fingerprint (assets=0, equity=244904000) → CORRUPT flag, no ratios", async () => {
    insertCorruptRow({
      id: "ctg-corrupt-2026-q1",
      actionCode: "CTG",
      sortKey: "2026-Q1",
      totalAssets: 0,
      equityTotal: 244_904_000,
      extractionConfidence: 0.56,
    });

    const result = await callTool(server, "get_financial_summary", {
      actionCode: "CTG",
      year: 2026,
      quarter: "Q1",
    });

    expect(result.content).toHaveLength(1);
    const text = result.content[0]!.text;

    // Must signal corruption
    expect(text).toContain("[CORRUPT DATA — SKIP]");
    // assets=0 fires the "zero or negative" branch of the guard
    expect(text).toContain("zero or negative");

    // Confidence must be forced to 0
    expect(text).toContain("Confidence: 0%");

    // Must NOT serve the nonsensical 229,157% margin (those are table rows in the happy path)
    expect(text).not.toContain("229157");
    expect(text).not.toContain("Net Revenue     :");   // happy-path table row format
    expect(text).not.toContain("Net Profit      :");   // happy-path table row format

    // Must include the actionCode and period for traceability
    expect(text).toContain("CTG");
    expect(text).toContain("2026-Q1");

    // Must include re-extract action hint
    expect(text).toContain("/api/bctc-inspect");
  });

  // ── G2: total_assets < equity_total (not zero, but violated identity) ──────
  it("DV-BCTC-GUARD-2: assets < equity (assets=100, equity=244904000) → CORRUPT flag", async () => {
    insertCorruptRow({
      id: "vnm-corrupt-2026-q1",
      actionCode: "VNM_CORRUPT",
      sortKey: "2026-Q1",
      totalAssets: 100,
      equityTotal: 244_904_000,
      extractionConfidence: 0.60,
    });

    const result = await callTool(server, "get_financial_summary", {
      actionCode: "VNM_CORRUPT",
      year: 2026,
      quarter: "Q1",
    });

    const text = result.content[0]!.text;

    expect(text).toContain("[CORRUPT DATA — SKIP]");
    // The corrupt reason should show the assets < equity form
    expect(text).toContain("balance-sheet identity violated");
    expect(text).toContain("Confidence: 0%");
    // Derived ratio TABLE ROWS (happy-path format "ROE             :") are suppressed —
    // the explanation line may mention "ROE" as a concept, so we match the table format
    expect(text).not.toContain("ROE             :");   // happy-path table row format
    expect(text).not.toContain("ROA             :");   // happy-path table row format
    // Net margin table row is suppressed
    expect(text).not.toContain("Net Profit      :");
  });

  // ── G3: valid report passes through guard unchanged ──────────────────────
  it("DV-BCTC-GUARD-3: valid report (assets=500000 > equity=200000) passes guard and shows metrics", async () => {
    insertCorruptRow({
      id: "good-corp-2026-q1",
      actionCode: "GOOD_CORP",
      sortKey: "2026-Q1",
      totalAssets: 500_000_000,
      equityTotal: 200_000_000,
      extractionConfidence: 0.90,
    });

    const result = await callTool(server, "get_financial_summary", {
      actionCode: "GOOD_CORP",
      year: 2026,
      quarter: "Q1",
    });

    const text = result.content[0]!.text;

    // Should NOT be flagged as corrupt
    expect(text).not.toContain("[CORRUPT DATA — SKIP]");
    // Should serve normal output
    expect(text).toContain("GOOD_CORP");
    expect(text).toContain("Net Revenue");
    expect(text).toContain("Total Assets");
  });

  // ── G4: assets=0 alone (no equity present) → zero guard triggers ─────────
  it("DV-BCTC-GUARD-4: total_assets=0 with equity=0 → still corrupt (assets<=0 guard)", async () => {
    const db = getDb();
    db.exec("DELETE FROM financial_reports WHERE action_code = 'ZERO_ALL'");
    insertCorruptRow({
      id: "zero-all-2026-q1",
      actionCode: "ZERO_ALL",
      sortKey: "2026-Q1",
      totalAssets: 0,
      equityTotal: 0,
      extractionConfidence: 0.10,
    });

    const result = await callTool(server, "get_financial_summary", {
      actionCode: "ZERO_ALL",
      year: 2026,
      quarter: "Q1",
    });

    const text = result.content[0]!.text;

    // total_assets <= 0 fires regardless of equity value
    expect(text).toContain("[CORRUPT DATA — SKIP]");
    expect(text).toContain("zero or negative");
    expect(text).toContain("Confidence: 0%");
  });

  // ── G5: assets exactly equal to equity → valid (A = E, no liabilities case)
  it("DV-BCTC-GUARD-5: total_assets equal to equity_total → passes guard (no-debt company)", async () => {
    const db = getDb();
    db.exec("DELETE FROM financial_reports WHERE action_code = 'NODEBT'");
    insertCorruptRow({
      id: "nodebt-2026-q1",
      actionCode: "NODEBT",
      sortKey: "2026-Q1",
      totalAssets: 300_000_000,
      equityTotal: 300_000_000,  // equity = assets (liabilities=0) — valid corner case
      extractionConfidence: 0.85,
    });

    const result = await callTool(server, "get_financial_summary", {
      actionCode: "NODEBT",
      year: 2026,
      quarter: "Q1",
    });

    const text = result.content[0]!.text;

    // assets >= equity, so NOT corrupt (equality is valid)
    expect(text).not.toContain("[CORRUPT DATA — SKIP]");
    expect(text).toContain("NODEBT");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-BCTC-BANK-SUMMARY-MAPPING W1 — get_bctc_full coverage (AC-4, AC-7)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-BANK-SUMMARY-MAPPING W1 — identity guard coverage in get_bctc_full", () => {
  let server: McpServer;

  beforeAll(async () => {
    await initDatabase();
    getDb().exec(
      "DELETE FROM financial_reports WHERE action_code IN ('CTG_FULL', 'VCB_FULL', 'FPT_FULL')",
    );
    getDb().exec(
      "DELETE FROM bctc_table_rows WHERE report_id IN ('ctg-full-corrupt-2026-q1', 'vcb-full-good-2026-q1', 'fpt-full-nonreg-2026-q1')",
    );
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(() => {
    server = new McpServer(
      { name: "test-server-bctc-full", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerReportTools(server);
    registerBctcFullTools(server);
  });

  // ── G6: CTG-fingerprint via get_bctc_full — never-fired gap, now hard-blocked ──
  it("DV-BCTC-GUARD-6: get_bctc_full CTG-fingerprint (assets=0) → CORRUPT flag, hard-blocked BEFORE the PUB-1..8 gate", async () => {
    insertCorruptRow({
      id: "ctg-full-corrupt-2026-q1",
      actionCode: "CTG_FULL",
      sortKey: "2026-Q1",
      totalAssets: 0,
      equityTotal: 244_904_000,
      extractionConfidence: 0.56,
      // refineStatus intentionally omitted (defaults 'PENDING', fails PUB-1) —
      // proves the identity guard fires BEFORE checkPublishability, i.e. it
      // is a true hard-block independent of publishability heuristics.
    });

    const result = await callTool(server, "get_bctc_full", {
      code: "CTG_FULL",
      year: 2026,
      quarter: "Q1",
    });

    const text = result.content[0]!.text;

    expect(text).toContain("[CORRUPT DATA — SKIP]");
    expect(text).toContain("zero or negative");
    expect(text).toContain("Confidence: 0%");
    // Must NOT fall through to the (different) PUB-1 "no data" refusal message —
    // the identity guard must win, not merely coincide with another block reason.
    expect(text).not.toContain("Chưa có dữ liệu BCTC");
    expect(text).not.toContain("BCTC SUMMARY");
  });

  // ── G7: VCB-shaped valid report — non-regression, passes guard, serves normally ──
  it("DV-BCTC-GUARD-7: get_bctc_full VCB-shaped valid report (assets>equity) serves normally, no CORRUPT flag", async () => {
    insertCorruptRow({
      id: "vcb-full-good-2026-q1",
      actionCode: "VCB_FULL",
      sortKey: "2026-Q1",
      totalAssets: 2_550_963_342,
      equityTotal: 224_558_726,
      extractionConfidence: 0.75,
      refineStatus: "PARTIAL",
    });
    insertBalanceSheetRow("vcb-full-good-2026-q1");

    const result = await callTool(server, "get_bctc_full", {
      code: "VCB_FULL",
      year: 2026,
      quarter: "Q1",
    });

    const text = result.content[0]!.text;

    expect(text).not.toContain("[CORRUPT DATA — SKIP]");
    expect(text).toContain("BCTC SUMMARY");
    expect(text).toContain("VCB_FULL");
  });

  // ── G8: FPT-shaped non-regression — validation_status=failed but identity holds ──
  it("DV-BCTC-GUARD-8: get_bctc_full FPT-shaped non-regression — validation_status=failed but identity holds → NOT blocked", async () => {
    insertCorruptRow({
      id: "fpt-full-nonreg-2026-q1",
      actionCode: "FPT_FULL",
      sortKey: "2026-Q1",
      totalAssets: 68_586_095,
      equityTotal: 40_122_037, // identity holds: 68.59M > 40.12M — guard must NOT fire
      extractionConfidence: 0.8125,
      refineStatus: "DONE",
      validationStatus: "failed", // pre-existing unrelated defect — must NOT trip THIS guard
    });
    insertBalanceSheetRow("fpt-full-nonreg-2026-q1");

    const result = await callTool(server, "get_bctc_full", {
      code: "FPT_FULL",
      year: 2026,
      quarter: "Q1",
    });

    const text = result.content[0]!.text;

    expect(text).not.toContain("[CORRUPT DATA — SKIP]");
    expect(text).toContain("BCTC SUMMARY");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX-BCTC-BANK-SUMMARY-MAPPING W1 — compare_financials coverage (AC-4, AC-7)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-BANK-SUMMARY-MAPPING W1 — identity guard coverage in compare_financials", () => {
  let server: McpServer;

  beforeAll(async () => {
    await initDatabase();
    getDb().exec(
      "DELETE FROM financial_reports WHERE action_code IN ('CTG_CMP', 'VCB_CMP', 'FPT_CMP')",
    );
  });

  afterAll(() => {
    closeDb();
  });

  beforeEach(() => {
    server = new McpServer(
      { name: "test-server-compare", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerReportTools(server);
  });

  // ── G9: CTG-fingerprint as period1 — compare_financials previously had ZERO guard ──
  it("DV-BCTC-GUARD-9: compare_financials CTG-fingerprint period (assets=0) → CORRUPT flag, no comparison table", async () => {
    insertCorruptRow({
      id: "ctg-cmp-corrupt-2026-q1",
      actionCode: "CTG_CMP",
      sortKey: "2026-Q1",
      totalAssets: 0,
      equityTotal: 244_904_000,
      extractionConfidence: 0.56,
      periodYear: 2026,
      periodQuarter: 1,
      periodType: "Q1",
    });
    insertCorruptRow({
      id: "ctg-cmp-good-2025-q4",
      actionCode: "CTG_CMP",
      sortKey: "2025-Q4",
      totalAssets: 300_000_000,
      equityTotal: 200_000_000,
      extractionConfidence: 0.85,
      periodYear: 2025,
      periodQuarter: 4,
      periodType: "Q4",
    });

    const result = await callTool(server, "compare_financials", {
      actionCode: "CTG_CMP",
      period1: { year: 2026, quarter: "Q1" },
      period2: { year: 2025, quarter: "Q4" },
    });

    const text = result.content[0]!.text;

    expect(text).toContain("[CORRUPT DATA — SKIP]");
    expect(text).toContain("zero or negative");
    // Must NOT serve the delta comparison table
    expect(text).not.toContain("Comparison:");
    expect(text).not.toContain("Delta type:");
  });

  // ── G10: VCB-shaped both periods valid — non-regression, normal comparison served ──
  it("DV-BCTC-GUARD-10: compare_financials VCB-shaped both periods valid → normal comparison, no CORRUPT flag", async () => {
    insertCorruptRow({
      id: "vcb-cmp-p1-2026-q1",
      actionCode: "VCB_CMP",
      sortKey: "2026-Q1",
      totalAssets: 2_550_963_342,
      equityTotal: 224_558_726,
      extractionConfidence: 0.75,
      periodYear: 2026,
      periodQuarter: 1,
      periodType: "Q1",
    });
    insertCorruptRow({
      id: "vcb-cmp-p2-2025-q4",
      actionCode: "VCB_CMP",
      sortKey: "2025-Q4",
      totalAssets: 2_400_000_000,
      equityTotal: 210_000_000,
      extractionConfidence: 0.78,
      periodYear: 2025,
      periodQuarter: 4,
      periodType: "Q4",
    });

    const result = await callTool(server, "compare_financials", {
      actionCode: "VCB_CMP",
      period1: { year: 2026, quarter: "Q1" },
      period2: { year: 2025, quarter: "Q4" },
    });

    const text = result.content[0]!.text;

    expect(text).not.toContain("[CORRUPT DATA — SKIP]");
    expect(text).toContain("Comparison:");
    expect(text).toContain("Delta type:");
  });

  // ── G11: FPT-shaped non-regression — validation_status irrelevant to this guard ──
  it("DV-BCTC-GUARD-11: compare_financials FPT-shaped non-regression — identity holds both periods → NOT blocked", async () => {
    insertCorruptRow({
      id: "fpt-cmp-p1-2026-q1",
      actionCode: "FPT_CMP",
      sortKey: "2026-Q1",
      totalAssets: 68_586_095,
      equityTotal: 40_122_037,
      extractionConfidence: 0.8125,
      validationStatus: "failed",
      periodYear: 2026,
      periodQuarter: 1,
      periodType: "Q1",
    });
    insertCorruptRow({
      id: "fpt-cmp-p2-2025-q4",
      actionCode: "FPT_CMP",
      sortKey: "2025-Q4",
      totalAssets: 65_000_000,
      equityTotal: 38_000_000,
      extractionConfidence: 0.85,
      periodYear: 2025,
      periodQuarter: 4,
      periodType: "Q4",
    });

    const result = await callTool(server, "compare_financials", {
      actionCode: "FPT_CMP",
      period1: { year: 2026, quarter: "Q1" },
      period2: { year: 2025, quarter: "Q4" },
    });

    const text = result.content[0]!.text;

    expect(text).not.toContain("[CORRUPT DATA — SKIP]");
    expect(text).toContain("Comparison:");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// checkBctcIdentityGuard — NULL-safety (fail-open), pure-function unit tests
// ─────────────────────────────────────────────────────────────────────────────
//
// Regression discovered while wiring W1 into get_bctc_full: TRUST-RED-sanity-gate
// .test.ts's TR-RED-4 seeds a financial_reports row via `seedReport()` that
// deliberately leaves total_assets/equity_total unset (column is nullable REAL
// in bctc-schema.ts — a "not yet extracted" row, refine_status=REJECTED_SANITY).
// In JS, `null <= 0` is `true`, so a naive port of the guard would misclassify
// this as a "corrupt" 0-value reading and short-circuit BEFORE the PUB-1
// refine_status refusal TR-RED-4 exists to verify. total_assets=NULL is a
// categorically different state (no data yet) from total_assets=0 (extracted,
// known-bad) — the guard must fail OPEN on null and defer to the caller's own
// no-data/publishability gate.
describe("checkBctcIdentityGuard — NULL-safety (fail-open, not a corruption fingerprint)", () => {
  it("DV-BCTC-GUARD-12: totalAssets=null (not yet extracted) → NOT corrupt, fails open", () => {
    const result = checkBctcIdentityGuard({ totalAssets: null, equityTotal: null });
    expect(result.corrupt).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("DV-BCTC-GUARD-13: totalAssets=undefined with a real equityTotal → NOT corrupt, fails open", () => {
    const result = checkBctcIdentityGuard({ totalAssets: undefined, equityTotal: 244_904_000 });
    expect(result.corrupt).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("DV-BCTC-GUARD-14: totalAssets=0 (a DEFINITE known-bad number, not null) → still corrupt", () => {
    // Guards the fix itself doesn't overcorrect: an actual extracted 0 must
    // still hard-block exactly like before the null-safety fix.
    const result = checkBctcIdentityGuard({ totalAssets: 0, equityTotal: 244_904_000 });
    expect(result.corrupt).toBe(true);
    expect(result.reason).toContain("zero or negative");
  });

  it("DV-BCTC-GUARD-15: totalAssets=positive, equityTotal=null → treated as equity=0, not corrupt", () => {
    const result = checkBctcIdentityGuard({ totalAssets: 500_000_000, equityTotal: null });
    expect(result.corrupt).toBe(false);
  });
});
