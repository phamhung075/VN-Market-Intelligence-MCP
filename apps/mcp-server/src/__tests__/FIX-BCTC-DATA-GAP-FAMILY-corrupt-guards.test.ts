/**
 * FIX-BCTC-DATA-GAP-FAMILY U4 + U5 + U6 — corrupt-scalar guards + serve diagnostics
 *
 * U4 — income-broken-with-assets guard (HPG 42nd+ cycle): total_assets > 0 AND
 *      net_revenue == 0 AND operating_profit == 0 AND net_profit == 0 →
 *      corrupt (income statement missed, balance sheet survived). Enforced at
 *      serve (bctcIdentityGuard, all three serve paths) AND write
 *      (parseBctcReport storeReport pre-block + bctc_zero_extract_blocks record).
 * U5 — scale-corruption guard (VNM/VEA class): total_assets below the 1 tỷ VND
 *      absolute floor, or total_assets/equity_total > 10^4 → corrupt.
 * U6 — serve-stage diagnostics: PENDING row → "extracted, refine pending
 *      (N layout units, M refined)"; true-absent keeps the EXACT legacy
 *      "Chưa có dữ liệu BCTC" string (bctc-analyst contract).
 *
 * DI strategy: real in-memory SQLite + registered MCP tools + pure guard calls.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerReportTools } from "../interface/mcp/tools/financial-reports/reports.js";
import { registerBctcFullTools } from "../interface/mcp/tools/financial-reports/bctcFullTools.js";
import { checkBctcIdentityGuard } from "../domain/services/financial-reports/bctcIdentityGuard.js";
import { parseBctcReport } from "../application/usecases/parseBctcReport.js";
import { buildBctcNoDataDiagnostic } from "../interface/mcp/tools/financial-reports/bctcNoDataDiagnostics.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
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
  return entry.handler(args) as Promise<{ content: Array<{ type: string; text: string }> }>;
}

type RowParams = {
  id: string;
  actionCode: string;
  sortKey: string;
  periodYear?: number;
  periodQuarter?: number;
  periodType?: string;
  totalAssets: number;
  equityTotal: number;
  netRevenue: number;
  operatingProfit: number;
  netProfit: number;
  refineStatus?: string;
};

function insertReportRow(p: RowParams): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO financial_reports (
      id, action_code, company_name, exchange, domain,
      period_year, period_quarter, period_type, period_start, period_end, sort_key,
      ssc_url, pdf_path, published_at, parsed_at, audit_status, auditor,
      extraction_confidence, net_revenue, gross_profit, operating_profit, ebitda,
      profit_before_tax, net_profit, eps, diluted_eps,
      total_assets, current_assets, cash, inventory,
      total_liabilities, short_term_debt, long_term_debt, equity_total,
      operating_cf, investing_cf, financing_cf, capex, free_cash_flow,
      balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json,
      refine_status
    ) VALUES (
      $id, $actionCode, $actionCode, 'HOSE', 'other',
      $periodYear, $periodQuarter, $periodType, $start, $end, $sortKey,
      'https://ssc.gov.vn/test', NULL, datetime('now'), datetime('now'), 'unaudited', NULL,
      0.8, $netRevenue, $netRevenue, $operatingProfit, $operatingProfit,
      $netProfit, $netProfit, 0, 0,
      $totalAssets, 0, 0, 0,
      $liabilities, 0, 0, $equityTotal,
      0, 0, 0, 0, 0,
      '{}', '{}', '{}', '{}',
      $refineStatus
    )
  `).run({
    $id: p.id,
    $actionCode: p.actionCode,
    $periodYear: p.periodYear ?? 2026,
    $periodQuarter: p.periodQuarter ?? 1,
    $periodType: p.periodType ?? "Q1",
    $start: "2026-01-01",
    $end: "2026-03-31",
    $sortKey: p.sortKey,
    $netRevenue: p.netRevenue,
    $operatingProfit: p.operatingProfit,
    $netProfit: p.netProfit,
    $totalAssets: p.totalAssets,
    $liabilities: Math.max(0, p.totalAssets - p.equityTotal),
    $equityTotal: p.equityTotal,
    $refineStatus: p.refineStatus ?? "PARTIAL",
  });
}

function insertLayoutUnit(reportId: string): void {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO bctc_layout_units
        (report_id, unit_id, schema_page, page_numbers_json, page_type, stitched_markdown, quarantined)
      VALUES (?, ?, 1, '[1]', 'prose', 'prose', 0)
    `).run(reportId, `unit-${reportId}`);
  } catch { /* table absent — ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// U4 — income-broken-with-assets guard (pure + serve + write)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DATA-GAP-FAMILY U4 — income-broken-with-assets guard", () => {
  it("pure: HPG-shaped row (TA>0, NR=0, OP=0, NP=0) → corrupt with income reason", () => {
    const result = checkBctcIdentityGuard({
      totalAssets: 150_000_000,
      equityTotal: 80_000_000,
      netRevenue: 0,
      operatingProfit: 0,
      netProfit: 0,
    });
    expect(result.corrupt).toBe(true);
    expect(result.reason).toContain("income statement absent while balance sheet present");
  });

  it("pure: healthy row (TA>0, NR>0) does NOT trip the income guard", () => {
    const result = checkBctcIdentityGuard({
      totalAssets: 150_000_000,
      equityTotal: 80_000_000,
      netRevenue: 39_500_000,
      operatingProfit: 8_500_000,
      netProfit: 6_880_000,
    });
    expect(result.corrupt).toBe(false);
  });

  it("pure: banks with zero operatingProfit but non-zero NR/NP are NOT blocked (1424a proxy regression)", () => {
    const result = checkBctcIdentityGuard({
      totalAssets: 2_550_963_342,
      equityTotal: 224_558_726,
      netRevenue: 10_000_000,
      operatingProfit: 0, // bank — structurally zero via 1424a proxy
      netProfit: 3_000_000,
    });
    expect(result.corrupt).toBe(false);
  });

  it("pure: income fields omitted (pre-U4 callers) fail open on the income predicate", () => {
    const result = checkBctcIdentityGuard({ totalAssets: 150_000_000, equityTotal: 80_000_000 });
    expect(result.corrupt).toBe(false);
  });

  it("serve: get_financial_summary hard-blocks an HPG-shaped row with [CORRUPT DATA — SKIP]", async () => {
    const server = new McpServer({ name: "t", version: "0.0.1" }, { capabilities: { tools: {} } });
    registerReportTools(server);
    insertReportRow({
      id: "hpg-income-broken", actionCode: "HPG_BROKEN", sortKey: "2026-Q1",
      totalAssets: 150_000_000, equityTotal: 80_000_000,
      netRevenue: 0, operatingProfit: 0, netProfit: 0,
    });

    const res = await callTool(server, "get_financial_summary", { actionCode: "HPG_BROKEN" });
    const text = res.content[0]!.text;
    expect(text).toContain("[CORRUPT DATA — SKIP]");
    expect(text).toContain("income statement absent while balance sheet present");
  });

  it("serve: get_bctc_full hard-blocks the same fingerprint BEFORE the PUB-1 gate", async () => {
    const server = new McpServer({ name: "t", version: "0.0.1" }, { capabilities: { tools: {} } });
    registerBctcFullTools(server);
    insertReportRow({
      id: "hpg-income-broken-full", actionCode: "HPG_FULL_BROKEN", sortKey: "2026-Q1",
      totalAssets: 150_000_000, equityTotal: 80_000_000,
      netRevenue: 0, operatingProfit: 0, netProfit: 0,
      refineStatus: "PENDING", // fails PUB-1 — proves the guard fires first
    });

    const res = await callTool(server, "get_bctc_full", { code: "HPG_FULL_BROKEN" });
    const text = res.content[0]!.text;
    expect(text).toContain("[CORRUPT DATA — SKIP]");
    expect(text).toContain("income statement absent while balance sheet present");
  });

  it("write: parseBctcReport storeReport refuses an income-broken extraction and records the block", async () => {
    // Balance sheet + cash flow present, NO income-statement section → TA>0, income all zero.
    const incomeBrokenText = `
BẢNG CÂN ĐỐI KẾ TOÁN
Tài sản ngắn hạn                                    50.000.000
  Tiền và tương đương tiền                            5.000.000
  Hàng tồn kho                                       12.000.000
Tài sản dài hạn                                     30.000.000
TỔNG CỘNG TÀI SẢN                                   80.000.000
Nợ ngắn hạn                                         20.000.000
Nợ dài hạn                                          10.000.000
Nợ phải trả                                         30.000.000
Vốn chủ sở hữu                                      50.000.000
TỔNG CỘNG NGUỒN VỐN                                 80.000.000
BÁO CÁO LƯU CHUYỂN TIỀN TỆ
Lưu chuyển tiền thuần từ hoạt động kinh doanh        5.880.000
Lưu chuyển tiền thuần trong kỳ                       2.880.000
`;

    const actionCode = "HPGWRITE";
    const report = await parseBctcReport({
      rawText: incomeBrokenText,
      actionCode,
      period: { year: 2026, quarter: 1 as const, periodType: "Q1", startDate: "2026-01-01", endDate: "2026-03-31", sortKey: "2026-Q1" },
      _telegramBugFn: async () => true,
    });

    // The in-memory report object is still returned (storeReport is void), but
    // the DB must NOT contain the corrupt row, and the block must be recorded.
    expect(report.balanceSheet.totalAssets).toBeGreaterThan(0);
    const dbRow = getDb()
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM financial_reports WHERE action_code = ? AND sort_key = ?",
      )
      .get(actionCode, "2026-Q1");
    expect(dbRow).toBeNull();

    const blockRow = getDb()
      .query<{ reason: string }, [string, string]>(
        "SELECT reason FROM bctc_zero_extract_blocks WHERE action_code = ? AND sort_key = ?",
      )
      .get(actionCode, "2026-Q1");
    expect(blockRow?.reason).toContain("income-broken-with-assets");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// U5 — scale-corruption guard (pure + regression)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DATA-GAP-FAMILY U5 — scale-corruption guard", () => {
  it("pure: VEA-shaped row (TA≈20.7M VND, EQ≈20.4M VND) trips the absolute floor", () => {
    const result = checkBctcIdentityGuard({
      totalAssets: 20.7,   // million VND — ~10^6× too small vs a real ~10^11 VND balance sheet
      equityTotal: 20.4,
      netRevenue: 259_905,
      operatingProfit: 0,
      netProfit: -0.00005,
    });
    expect(result.corrupt).toBe(true);
    expect(result.reason).toContain("below absolute floor");
    expect(result.reason).toContain("scale corruption");
  });

  it("pure: real-scale row passes the scale guard", () => {
    const result = checkBctcIdentityGuard({
      totalAssets: 100_000_000, // 100,000 tỷ VND — real large-cap scale (million VND units)
      equityTotal: 50_000_000,
      netRevenue: 10_000_000,
      operatingProfit: 1_000_000,
      netProfit: 800_000,
    });
    expect(result.corrupt).toBe(false);
  });

  it("pure: mixed-scale row (TA/equity > 10^4) trips the ratio cap", () => {
    const result = checkBctcIdentityGuard({
      totalAssets: 1_000_000,
      equityTotal: 50, // ratio = 20,000 > 10,000 — mixed-unit corruption
      netRevenue: 100_000,
      operatingProfit: 10_000,
      netProfit: 5_000,
    });
    expect(result.corrupt).toBe(true);
    expect(result.reason).toContain("> cap 10000");
  });

  it("regression: existing identity cases are unchanged (TA<=0, TA<EQ, null fail-open)", () => {
    expect(checkBctcIdentityGuard({ totalAssets: 0, equityTotal: 244_904_000 }).corrupt).toBe(true);
    expect(checkBctcIdentityGuard({ totalAssets: 100, equityTotal: 244_904_000 }).corrupt).toBe(true);
    expect(checkBctcIdentityGuard({ totalAssets: null, equityTotal: null }).corrupt).toBe(false);
    expect(checkBctcIdentityGuard({ totalAssets: 300_000_000, equityTotal: 300_000_000 }).corrupt).toBe(false);
  });

  it("regression: a small-but-plausible company above the floor is not blocked", () => {
    const result = checkBctcIdentityGuard({
      totalAssets: 1_500, // 1.5 tỷ VND — above the 1 tỷ floor
      equityTotal: 1_000,
      netRevenue: 900,
      operatingProfit: 100,
      netProfit: 80,
    });
    expect(result.corrupt).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// U6 — serve-stage diagnostics (refine-pending vs true-absent)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DATA-GAP-FAMILY U6 — serve-stage diagnostics", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: "t6", version: "0.0.1" }, { capabilities: { tools: {} } });
    registerBctcFullTools(server);
  });

  it("DXG-shaped DB (PENDING row, layout units, 0 refined) → refine-pending reason", async () => {
    insertReportRow({
      id: "dxg-pending", actionCode: "DXG", sortKey: "2026-Q1",
      totalAssets: 60_000_000, equityTotal: 20_000_000,
      netRevenue: 5_000_000, operatingProfit: 500_000, netProfit: 400_000,
      refineStatus: "PENDING",
    });
    insertLayoutUnit("dxg-pending"); // 1 layout unit

    const res = await callTool(server, "get_bctc_full", { code: "DXG" });
    const text = res.content[0]!.text;
    expect(text).toContain("extracted, refine pending");
    expect(text).toContain("1 layout units, 0 refined");
    // Must NOT be the flat legacy string (the 46th-cycle envelope this fixes).
    expect(text).not.toBe("Chưa có dữ liệu BCTC");
  });

  it("true-absent ticker keeps the EXACT legacy string (bctc-analyst contract)", async () => {
    const res = await callTool(server, "get_bctc_full", { code: "XYZ" });
    const text = res.content[0]!.text;
    expect(text).toBe("Chưa có dữ liệu BCTC cho XYZ. Kiểm tra bằng list_stored_pdfs.");
  });

  it("buildBctcNoDataDiagnostic: no PENDING row and no quarantine → kind='absent'", () => {
    const diag = buildBctcNoDataDiagnostic(getDb(), "XYZ");
    expect(diag.kind).toBe("absent");
    expect(diag.text).toBeNull();
  });

  it("buildBctcNoDataDiagnostic: PENDING row → refine_pending with layout-unit counts", () => {
    insertReportRow({
      id: "dxg-pending-2", actionCode: "DXG2", sortKey: "2026-Q1",
      totalAssets: 60_000_000, equityTotal: 20_000_000,
      netRevenue: 5_000_000, operatingProfit: 500_000, netProfit: 400_000,
      refineStatus: "PENDING",
    });
    insertLayoutUnit("dxg-pending-2");
    const diag = buildBctcNoDataDiagnostic(getDb(), "DXG2");
    expect(diag.kind).toBe("refine_pending");
    expect(diag.text).toContain("refine pending");
  });

  it("quarantined pair (write-blocked) surfaces the block reason via get_bctc_full's no-data branch", async () => {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO bctc_zero_extract_blocks
        (action_code, sort_key, attempt_count, last_blocked_at, reason, status)
      VALUES ('WBLK', '2026-Q1', 3, datetime('now'),
              'create-blocked: total_assets=0 (failed/zero extraction), no prior stored report exists',
              'active')
    `).run();

    const res = await callTool(server, "get_bctc_full", { code: "WBLK" });
    const text = res.content[0]!.text;
    expect(text).toContain("write-blocked 3 time(s)");
    expect(text).toContain("create-blocked");
    expect(text).not.toContain("Chưa có dữ liệu BCTC cho WBLK");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});
