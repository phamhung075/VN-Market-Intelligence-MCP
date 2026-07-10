Bun.env["DB_PATH"] = ":memory:";
/**
 * FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS
 *
 * Proves get_financial_summary / compare_financials (reports.ts) gate on
 * validation_status='pending_extraction' — D2's shell-row upsert
 * (ensureFinancialReportShellRow.ts) leaves that value on unextracted rows
 * (NULL/0 financial data). Architect triage (sprint-SYSTEMIC-REMAKE-P1
 * STEP architect-S5): gate on validation_status, NOT refine_status like
 * get_bctc_full's PUB-1 — refine_status only transitions via the separate
 * agentic-refine pipeline, so legacy scalar-pipeline rows (real data, never
 * refined) sit at the DB default forever and must NOT be hidden.
 *
 * Coverage:
 *   (a) get_financial_summary: a validation_status='pending_extraction' row
 *       returns the pending-extraction message — not real data, not the
 *       generic "No financial data found" 404.
 *   (b) compare_financials: reports which period(s) are pending when one or
 *       both periods are validation_status='pending_extraction'.
 *   (c) REGRESSION (the exact case the architect flagged): rows with legacy
 *       validation_status values (the DB DEFAULT 'pending', plus 'passed' /
 *       'failed') are served normally, real data intact, unaffected by the
 *       new gate.
 *
 * See: docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-architect.md
 * STEP architect-S5; docs/handoffs/TASK_FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION.md#D2-QA-FINDING.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { registerReportTools } from "../interface/mcp/tools/financial-reports/reports.js";
import { ensureFinancialReportShellRow } from "../application/usecases/bctc/ensureFinancialReportShellRow.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper — invoke a registered MCP tool directly (same pattern as 085-tool-reports.test.ts)
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
// Helper — insert a "real data" row directly, with an explicit legacy
// validation_status (mirrors what the legacy scalar pipeline / an already
// agentic-refined row would leave behind). Balance sheet numbers chosen to
// pass bctcIdentityGuard (total_assets > 0 AND total_assets >= equity_total).
// ─────────────────────────────────────────────────────────────────────────────

function insertRealRow(opts: {
  actionCode: string;
  year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  validationStatus: string;
}): void {
  const { actionCode, year, quarter, validationStatus } = opts;
  const quarterNum = Number(quarter[1]);
  const sortKey = `${year}-${quarter}`;
  const id = `${actionCode}-${sortKey}-${validationStatus}`;

  getDb()
    .prepare(
      `
      INSERT INTO financial_reports (
        id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type, period_start, period_end, sort_key,
        parsed_at, validation_status, extraction_confidence,
        net_revenue, net_profit, total_assets, equity_total,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json
      ) VALUES (
        $id, $actionCode, 'Test Corp', 'HOSE', 'other',
        $periodYear, $periodQuarter, $periodType, $periodStart, $periodEnd, $sortKey,
        datetime('now'), $validationStatus, 0.9,
        39500000, 6880000, 80000000, 50000000,
        '{}', '{}', '{}', '{}'
      )
      `,
    )
    .run({
      $id: id,
      $actionCode: actionCode,
      $periodYear: year,
      $periodQuarter: quarterNum,
      $periodType: quarter,
      $periodStart: `${year}-01-01`,
      $periodEnd: `${year}-03-31`,
      $sortKey: sortKey,
      $validationStatus: validationStatus,
    });
}

beforeAll(async () => {
  Bun.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  closeDb();
  delete Bun.env["DB_PATH"];
});

beforeEach(() => {
  getDb().prepare("DELETE FROM financial_reports WHERE action_code LIKE 'GATETEST%'").run();
});

describe("FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS — validation_status='pending_extraction' gate", () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer(
      { name: "test-server", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerReportTools(server);
  });

  // ── (a) get_financial_summary ────────────────────────────────────────────
  it("get_financial_summary returns the pending-extraction message for a validation_status='pending_extraction' row (not real data, not 404)", async () => {
    await ensureFinancialReportShellRow({
      actionCode: "GATETEST1",
      year: 2025,
      quarter: "Q4",
      pdfPath: "/app/data/pdfs/GATETEST1_2025_Q4.pdf",
    });

    const result = await callTool(server, "get_financial_summary", {
      actionCode: "GATETEST1",
      year: 2025,
      quarter: "Q4",
    });

    const text = result.content[0]!.text;
    expect(text).toMatch(/not yet extracted/i);
    // Must NOT be the generic 404 branch (row exists — this is a distinct message).
    expect(text).not.toMatch(/No financial data found/i);
    // Must NOT render the real-data report header (would mean the shell row's
    // NULL/0 financial columns were served as if they were legitimate).
    expect(text).not.toContain("=== GATETEST1");
  });

  // ── (b) compare_financials — one period pending ──────────────────────────
  it("compare_financials reports only the pending period when one period is validation_status='pending_extraction'", async () => {
    insertRealRow({
      actionCode: "GATETEST2",
      year: 2024,
      quarter: "Q1",
      validationStatus: "passed",
    });
    await ensureFinancialReportShellRow({
      actionCode: "GATETEST2",
      year: 2024,
      quarter: "Q2",
      pdfPath: "/app/data/pdfs/GATETEST2_2024_Q2.pdf",
    });

    const result = await callTool(server, "compare_financials", {
      actionCode: "GATETEST2",
      period1: { year: 2024, quarter: "Q2" }, // pending shell row
      period2: { year: 2024, quarter: "Q1" }, // real data
    });

    const text = result.content[0]!.text;
    expect(text).toMatch(/not yet extracted/i);
    expect(text).toContain("2024-Q2");
    expect(text).not.toContain("2024-Q1");
  });

  // ── (b) compare_financials — both periods pending ────────────────────────
  it("compare_financials reports BOTH periods when both are validation_status='pending_extraction'", async () => {
    await ensureFinancialReportShellRow({
      actionCode: "GATETEST3",
      year: 2024,
      quarter: "Q1",
      pdfPath: "/app/data/pdfs/GATETEST3_2024_Q1.pdf",
    });
    await ensureFinancialReportShellRow({
      actionCode: "GATETEST3",
      year: 2024,
      quarter: "Q2",
      pdfPath: "/app/data/pdfs/GATETEST3_2024_Q2.pdf",
    });

    const result = await callTool(server, "compare_financials", {
      actionCode: "GATETEST3",
      period1: { year: 2024, quarter: "Q2" },
      period2: { year: 2024, quarter: "Q1" },
    });

    const text = result.content[0]!.text;
    expect(text).toMatch(/not yet extracted/i);
    expect(text).toContain("2024-Q1");
    expect(text).toContain("2024-Q2");
  });

  // ── (c) REGRESSION — legacy validation_status values still serve real data ──
  it("get_financial_summary serves real data unaffected for a legacy row at the DB DEFAULT validation_status='pending' (never touched by refine_status pipeline)", async () => {
    insertRealRow({
      actionCode: "GATETEST4",
      year: 2024,
      quarter: "Q1",
      validationStatus: "pending", // DB DEFAULT (bctc-schema.ts:818) — legacy scalar-pipeline row
    });

    const result = await callTool(server, "get_financial_summary", {
      actionCode: "GATETEST4",
      year: 2024,
      quarter: "Q1",
    });

    const text = result.content[0]!.text;
    expect(text).not.toMatch(/not yet extracted/i);
    expect(text).toContain("=== GATETEST4");
    expect(text).toContain("39"); // netRevenue ~39.5 billion, from insertRealRow fixture
  });

  it("get_financial_summary serves real data unaffected for legacy validation_status='passed' and 'failed' rows", async () => {
    insertRealRow({
      actionCode: "GATETEST5",
      year: 2024,
      quarter: "Q1",
      validationStatus: "passed",
    });
    insertRealRow({
      actionCode: "GATETEST6",
      year: 2024,
      quarter: "Q1",
      validationStatus: "failed",
    });

    const passedResult = await callTool(server, "get_financial_summary", {
      actionCode: "GATETEST5",
      year: 2024,
      quarter: "Q1",
    });
    const failedResult = await callTool(server, "get_financial_summary", {
      actionCode: "GATETEST6",
      year: 2024,
      quarter: "Q1",
    });

    expect(passedResult.content[0]!.text).not.toMatch(/not yet extracted/i);
    expect(passedResult.content[0]!.text).toContain("=== GATETEST5");

    expect(failedResult.content[0]!.text).not.toMatch(/not yet extracted/i);
    expect(failedResult.content[0]!.text).toContain("=== GATETEST6");
  });

  it("compare_financials serves a real comparison unaffected when both periods are legacy validation_status values", async () => {
    insertRealRow({
      actionCode: "GATETEST7",
      year: 2024,
      quarter: "Q1",
      validationStatus: "pending", // DB DEFAULT
    });
    insertRealRow({
      actionCode: "GATETEST7",
      year: 2023,
      quarter: "Q1",
      validationStatus: "passed",
    });

    const result = await callTool(server, "compare_financials", {
      actionCode: "GATETEST7",
      period1: { year: 2024, quarter: "Q1" },
      period2: { year: 2023, quarter: "Q1" },
    });

    const text = result.content[0]!.text;
    expect(text).not.toMatch(/not yet extracted/i);
    expect(text).toContain("2024");
    expect(text).toContain("2023");
    expect(text).toMatch(/Comparison/i);
  });
});
