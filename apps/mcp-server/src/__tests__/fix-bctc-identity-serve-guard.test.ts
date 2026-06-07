/**
 * fix-bctc-identity-serve-guard — Unit tests for the balance-sheet identity gate
 * in get_financial_summary (reports.ts serve path).
 *
 * Root cause: 3rd occurrence of OCR-corruption fingerprint served raw
 * (VNM → VEA → CTG): total_assets=0, equity_total=244_904_000, net_margin=229157%.
 * Gate added: total_assets <= 0 OR total_assets < equity_total → confidence=0,
 * corrupt flag, suppress derived ratios.
 *
 * Task: FIX-BCTC-IDENTITY-SERVE-GUARD
 * Layer: interface — injectable SQLite in-memory, no real I/O.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerReportTools } from "../interface/mcp/tools/financial-reports/reports.js";

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
      '{}', '{}', '{}', '{}',
      NULL, NULL, NULL, $embeddingText, NULL
    )
  `).run({
    $id: p.id,
    $actionCode: p.actionCode,
    $companyName: p.actionCode + " Corp",
    $exchange: "HOSE",
    $domain: "banking",
    $periodYear: 2026,
    $periodQuarter: 1,
    $periodType: "Q1",
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
  });
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
