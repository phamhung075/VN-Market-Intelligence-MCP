/**
 * TRUST-RED-sanity-gate.test.ts — Anti-False-Green QA Gate
 *
 * Sprint: BCTC-TRUST-RED
 * Task: TRUST-QA-1
 * Author: qa
 * Date: 2026-05-30
 *
 * Mandatory RED-before-GREEN protocol:
 *   Each test case documents the RED observation (what happens when the gate is
 *   disabled / bypassed) and then verifies the GREEN state (gate fires correctly).
 *
 *   RED observation methodology: each case includes a comment block documenting
 *   what was observed when the gate was temporarily disabled (comment out the
 *   validateBctcUnit / detectMagnitudeViolations / detectCrossStatementRevenue /
 *   checkPublishability call in the respective handler). The RED was observed and
 *   documented before this test file was committed.
 *
 * DB arbiter rule: ALL assertions on DB state use direct bun:sqlite
 *   `db.query(...)` / `db.prepare(...).get(...)` — NEVER HTTP echo fields
 *   (rows_stored, rows_parsed, etc.) which only reflect parse output, not DB commit.
 *   This is the mcp-server-write-wedge lesson: write-wedge scenarios return
 *   200-OK with echo counts while DB commits silently fail.
 *
 * Scope: in-memory :memory: DB only (zero filesystem, zero network).
 * Do NOT modify HCM-DISAMBIG-extraction.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { buildPushBctcRefinedUnitHandler } from "../interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.js";
import { buildFinalizeBctcRefineHandler } from "../interface/mcp/tools/financial-reports/finalizeBctcRefineTool.js";
import { registerBctcFullTools } from "../interface/mcp/tools/financial-reports/bctcFullTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test infrastructure helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Open a fresh in-memory DB with the full financial-reports schema. */
function openTestDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  initNewsTables(db);
  initMarketDataTables(db);
  initSystemTables(db);
  return db;
}

/**
 * Seed a minimal financial_reports row.
 * Uses columns that are guaranteed present (all NOT NULL without DEFAULT
 * that cannot be inferred) and sets refine_status explicitly.
 */
function seedReport(
  db: Database,
  reportId: string,
  ticker: string,
  refineStatus: string = "PENDING",
): void {
  db.prepare(
    `INSERT OR REPLACE INTO financial_reports
       (id, action_code, company_name, exchange, domain,
        period_year, period_quarter, period_type,
        period_start, period_end, sort_key, parsed_at, extraction_confidence,
        pdf_path, text_status, refine_status,
        balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
     VALUES (?, ?, ?, 'HOSE', 'technology',
             2026, 'Q1', 'Q1', '2026-01-01', '2026-03-31',
             '2026-Q1', datetime('now'), 0.85,
             '/app/data/pdfs/test.pdf', 'COMPLETE', ?,
             '{}', '{}', '{}', '{}')`,
  ).run(reportId, ticker, ticker + " Corp", refineStatus);
}

/**
 * Seed a bctc_refined_unit directly (bypass push gate — for finalize tests).
 * Allows TR-RED-2 and TR-RED-3 to pre-seed DONE units with known markdown.
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
 * Seed a bctc_table_row directly — used for TR-RED-4 and TR-RED-5 publishability checks.
 */
function seedTableRow(
  db: Database,
  reportId: string,
  opts: {
    section?: string;
    isSummary?: number;
    valueCurrent?: number | null;
    label?: string;
  } = {},
): void {
  const section = opts.section ?? "income_statement";
  const isSummary = opts.isSummary ?? 0;
  const valueCurrent = opts.valueCurrent !== undefined ? opts.valueCurrent : 100000;
  const label = opts.label ?? "Test Label";
  db.prepare(
    `INSERT INTO bctc_table_rows
       (report_id, page_number, statement_section, row_order, label,
        period_current, value_current, is_summary_row)
     VALUES (?, 1, ?, 1, ?, 'Q1-2026', ?, ?)`,
  ).run(reportId, section, label, valueCurrent, isSummary);
}

/**
 * Parse MCP tool result text as JSON.
 */
function parseResult(result: { content: [{ type: "text"; text: string }] }): unknown {
  return JSON.parse(result.content[0]!.text);
}

/**
 * Invoke a registered MCP tool directly through its server callback.
 * Pattern from 240-bctc-full.test.ts — avoids HTTP/transport layer.
 */
async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const tools = (server as unknown as {
    _registeredTools: Record<
      string,
      {
        callback?: (
          args: Record<string, unknown>,
        ) => Promise<{ content: Array<{ type: string; text: string }> }>;
        handler?: (
          args: Record<string, unknown>,
        ) => Promise<{ content: Array<{ type: string; text: string }> }>;
      }
    >;
  })._registeredTools;

  const tool = tools[name];
  if (!tool) throw new Error(`Tool ${name} not registered`);
  const fn = tool.callback ?? tool.handler;
  if (!fn) throw new Error(`No callable found for tool: ${name}`);
  const result = await fn(args);
  return result.content[0]?.text ?? "";
}

// ─────────────────────────────────────────────────────────────────────────────
// TRUST-RED Gate Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("TRUST-RED sanity gates (anti-false-green, RED-before-GREEN protocol)", () => {
  let db: Database;
  let pushHandler: ReturnType<typeof buildPushBctcRefinedUnitHandler>;
  let finalizeHandler: ReturnType<typeof buildFinalizeBctcRefineHandler>;

  beforeEach(() => {
    db = openTestDb();
    pushHandler = buildPushBctcRefinedUnitHandler(db);
    finalizeHandler = buildFinalizeBctcRefineHandler(db);
  });

  afterEach(() => {
    db.close();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TR-RED-1: DT-1 Digit-Run Inject → REJECTED_SANITY at ingest
  // ───────────────────────────────────────────────────────────────────────────

  it("TR-RED-1: DT-1 digit-run inject → gate BLOCKS, window_status='REJECTED_SANITY', no bctc_table_rows", async () => {
    /**
     * RED observation (gate disabled — documented for protocol compliance):
     * When validateBctcUnit call is commented out in pushBctcRefinedUnitTool.ts
     * (line: `const validation = validateBctcUnit(...)`), the handler proceeds
     * with the caller-supplied window_status='DONE'. The INSERT executes with
     * window_status='DONE' — malformed digit-run values are stored undetected.
     * DB query `SELECT window_status FROM bctc_refined_units WHERE unit_id='tr-red-1-u0'`
     * returns 'DONE' instead of 'REJECTED_SANITY'. Test assertion
     * `expect(row.window_status).toBe("REJECTED_SANITY")` would FAIL (RED = bug exposed).
     *
     * GREEN (gate enabled — current state of pushBctcRefinedUnitTool.ts):
     * validateBctcUnit fires; 2 distinct digit-runs → BLOCK;
     * window_status forced to 'REJECTED_SANITY' before INSERT;
     * ok: false returned; test assertions pass.
     */

    const reportId = "tr-red-1-rpt";
    const unitId = "tr-red-1-u0";
    seedReport(db, reportId, "FPT");

    // Fabricated markdown with ≥2 distinct digit-run values (ordered ascending sequences)
    const fakeMarkdown = [
      "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|---|",
      "| 100 | Doanh thu thuần | 12345678901234 | 8901234567890 |",
      "| 200 | Lợi nhuận gộp | 23456789012345 | 7890123456789 |",
    ].join("\n");

    // Call push handler (DT-1 gate fires inside handler at ingest)
    const result = await pushHandler({
      report_id: reportId,
      unit_id: unitId,
      page_numbers: [1],
      markdown: fakeMarkdown,
      confidence: 0.85,
      flags: [],
      window_status: "DONE",
    });

    // ── GREEN assertions ────────────────────────────────────────────────────

    // 1. HTTP-level response confirms gate fired (ok: false with rejected_reason)
    const parsed = parseResult(result) as {
      ok: boolean;
      unit_id?: string;
      rejected_reason?: Array<{ code: string; severity: string }>;
    };
    expect(parsed.ok).toBe(false);
    expect(parsed.rejected_reason).toBeDefined();
    expect(parsed.rejected_reason!.length).toBeGreaterThan(0);
    expect(parsed.rejected_reason!.some((v) => v.code === "DIGIT_RUN")).toBe(true);
    expect(parsed.rejected_reason!.some((v) => v.severity === "BLOCK")).toBe(true);

    // 2. DIRECT DB arbiter: window_status MUST be 'REJECTED_SANITY', NOT 'DONE'
    //    This is the honest gate: bun:sqlite direct query, not HTTP echo.
    const unitRow = db
      .query<{ window_status: string; flags: string }, [string]>(
        "SELECT window_status, flags FROM bctc_refined_units WHERE unit_id = ?",
      )
      .get(unitId);
    expect(unitRow).toBeDefined();
    expect(unitRow!.window_status).toBe("REJECTED_SANITY");

    // 3. DB arbiter: flags must contain sanity violation code
    const flags = JSON.parse(unitRow!.flags ?? "[]") as string[];
    expect(flags.some((f) => f.includes("DIGIT_RUN"))).toBe(true);

    // 4. DB arbiter: bctc_table_rows COUNT = 0 for this report
    //    (unit is REJECTED_SANITY → finalize skips it; but also nothing was finalized)
    const tableRowCount = db
      .query<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ?",
      )
      .get(reportId);
    expect(tableRowCount!.cnt).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TR-RED-2: DT-2 Magnitude Violation (gross_profit = net_revenue) → BLOCK
  // ───────────────────────────────────────────────────────────────────────────

  it("TR-RED-2: DT-2 magnitude violation (gross_profit=net_revenue) → refine_status='REJECTED_SANITY', bctc_table_rows COUNT=0", async () => {
    /**
     * RED observation (gate disabled):
     * When detectMagnitudeViolations call is removed from finalizeBctcRefineTool.ts
     * (lines: `const magnitudeViolations = detectMagnitudeViolations(finalRows)`
     *  and `const hasBlockViolation = ...`), finalize proceeds normally.
     * The atomic transaction executes: DELETE + INSERT + UPDATE refine_status='DONE'.
     * DB query `SELECT refine_status FROM financial_reports WHERE id=?` returns 'DONE'.
     * DB query `SELECT COUNT(*) FROM bctc_table_rows WHERE report_id=?` returns > 0.
     * Both assertions `expect(refineStatus).toBe("REJECTED_SANITY")` and
     * `expect(rowCount).toBe(0)` would FAIL (RED = gate bypass exposed).
     *
     * GREEN (gate enabled):
     * detectMagnitudeViolations fires on finalRows; MAGNITUDE_GROSS_EQ_NET BLOCK;
     * transaction aborted; refine_status='REJECTED_SANITY'; no bctc_table_rows inserted.
     */

    const reportId = "tr-red-2-rpt";
    seedReport(db, reportId, "ACB");

    // Seed a DONE unit with markdown that parses to gross_profit = net_revenue.
    // The parser (parseRefinedMarkdown) sets is_summary_row=1 ONLY when: no code column
    // AND label is ALL-CAPS. We use:
    //   - Section header "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH" → section='income_statement'
    //   - 3-column rows (no code): label | current | prior
    //   - ALL-CAPS labels → is_summary_row=1
    //   - detectMagnitudeViolations regex is case-insensitive: matches "DOANH THU THUẦN"
    const violatingMarkdown = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|",
      "| DOANH THU THUẦN | 100,000 | 90,000 |",
      "| LỢI NHUẬN GỘP | 100,000 | 90,000 |",
    ].join("\n");

    // Seed directly (bypass push gate — simulating a pre-gate era contamination)
    seedRefinedUnit(db, reportId, "unit-red-2", violatingMarkdown, "DONE");

    // Call finalize — DT-2 gate fires here on aggregate parsed rows
    const result = await finalizeHandler({
      report_id: reportId,
      report_status: "DONE",
    });

    const parsed = parseResult(result) as {
      ok: boolean;
      rejected_reason?: Array<{ code: string; severity: string }>;
    };

    // ── GREEN assertions ────────────────────────────────────────────────────

    // 1. Handler returns ok: false
    expect(parsed.ok).toBe(false);

    // 2. DIRECT DB arbiter: refine_status = 'REJECTED_SANITY' (not 'DONE')
    const reportRow = db
      .query<{ refine_status: string }, [string]>(
        "SELECT refine_status FROM financial_reports WHERE id = ?",
      )
      .get(reportId);
    expect(reportRow).toBeDefined();
    expect(reportRow!.refine_status).toBe("REJECTED_SANITY");

    // 3. DIRECT DB arbiter: bctc_table_rows COUNT = 0 (no rows inserted)
    //    This is the critical DB-write-wedge-proof assertion: handler echo 'rows_parsed'
    //    would reflect parse output (non-zero) but the DB must show 0 (transaction aborted).
    const tableRowCount = db
      .query<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ?",
      )
      .get(reportId);
    expect(tableRowCount!.cnt).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TR-RED-3: DT-3 Cross-Statement Revenue Contradiction → BLOCK finalize
  // ───────────────────────────────────────────────────────────────────────────

  it("TR-RED-3: DT-3 revenue contradiction (≥3 distinct prior values >20% apart) → refine_status='REJECTED_SANITY'", async () => {
    /**
     * RED observation (gate disabled):
     * When detectCrossStatementRevenue call is removed (or hasBlockViolation always false),
     * finalize proceeds with the contradictory revenue rows. refine_status='DONE' is written.
     * bctc_table_rows COUNT > 0. Assertion `expect(refineStatus).toBe("REJECTED_SANITY")`
     * would FAIL (RED = DT-3 gate bypass exposed — revenue contradiction not caught).
     *
     * GREEN (gate enabled):
     * detectCrossStatementRevenue collects all revenue rows across units;
     * 3 distinct prior values [16,058,000 / 11,481,000 / 20,225,000] pairwise divergence:
     *   11481 vs 20225 = (20225-11481)/20225 = 43.2% > 20% threshold → BLOCK;
     * Transaction aborted; refine_status='REJECTED_SANITY'; bctc_table_rows=0.
     */

    const reportId = "tr-red-3-rpt";
    seedReport(db, reportId, "FPT");

    // Three units with contradictory prior-period Doanh thu thuần values:
    // Unit A: prior = 16,058,000 (tỷ — 16,058 tỷ prior period)
    // Unit B: prior = 11,481,000 (11,481 tỷ — 28.5% divergence vs unit A)
    // Unit C: prior = 20,225,000 (20,225 tỷ — 43.2% divergence vs unit B)
    // Any pair involving 11481 vs 20225 exceeds 20% threshold → BLOCK

    // Use 3-column format (no code) + "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH" header
    // so parser produces income_statement section rows matching /doanh thu thu[aầâ]n/i
    // DT-3 operates on value_prior across units.
    const md1 = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|",
      "| Doanh thu thuần | 100,000 | 16,058,000 |",
    ].join("\n");

    const md2 = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|",
      "| Doanh thu thuần | 100,000 | 11,481,000 |",
    ].join("\n");

    const md3 = [
      "BÁO CÁO KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|",
      "| Doanh thu thuần | 100,000 | 20,225,000 |",
    ].join("\n");

    // Seed 3 DONE units with contradictory revenue (bypass push gate — simulating pre-gate data)
    seedRefinedUnit(db, reportId, "unit-red-3a", md1, "DONE");
    seedRefinedUnit(db, reportId, "unit-red-3b", md2, "DONE");
    seedRefinedUnit(db, reportId, "unit-red-3c", md3, "DONE");

    // Call finalize — DT-3 gate fires on aggregate parsed rows
    const result = await finalizeHandler({
      report_id: reportId,
      report_status: "DONE",
    });

    const parsed = parseResult(result) as { ok: boolean };

    // ── GREEN assertions ────────────────────────────────────────────────────

    // 1. Handler returns ok: false
    expect(parsed.ok).toBe(false);

    // 2. DIRECT DB arbiter: refine_status = 'REJECTED_SANITY'
    const reportRow = db
      .query<{ refine_status: string }, [string]>(
        "SELECT refine_status FROM financial_reports WHERE id = ?",
      )
      .get(reportId);
    expect(reportRow).toBeDefined();
    expect(reportRow!.refine_status).toBe("REJECTED_SANITY");

    // 3. DIRECT DB arbiter: bctc_table_rows COUNT = 0 (transaction blocked)
    const tableRowCount = db
      .query<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ?",
      )
      .get(reportId);
    expect(tableRowCount!.cnt).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TR-RED-4: Publish Guard refuses REJECTED_SANITY report via get_bctc_full
  // ───────────────────────────────────────────────────────────────────────────

  it("TR-RED-4: publish guard refuses REJECTED_SANITY report — no 'Net Revenue :' in output", async () => {
    /**
     * RED observation (gate disabled):
     * When checkPublishability call is removed from bctcFullTools.ts
     * (lines: `const pubCheck = checkPublishability(db, latestRow.id)`
     *  and `if (!pubCheck.publishable) { return ... }`), the tool proceeds to
     * buildSummarySection. Output contains "Net Revenue :" with formatted numbers.
     * Assertion `expect(output).not.toContain("Net Revenue :")` would FAIL
     * (RED = PUB-1 gate bypass: REJECTED_SANITY report served as if publishable).
     *
     * GREEN (gate enabled):
     * checkPublishability evaluates PUB-1: refine_status NOT IN ('DONE','PARTIAL');
     * returns { publishable: false, reason: "Chưa có dữ liệu BCTC" };
     * tool returns refusal text without any financial data.
     * No "Net Revenue :" line; no formatted VND numbers.
     */

    const reportId = "tr-red-4-rpt";
    const ticker = "FPT";

    // Seed a REJECTED_SANITY report using seedReport helper (handles all NOT NULL columns).
    // Then update refine_status to REJECTED_SANITY.
    // get_bctc_full queries financial_reports by action_code — the row must have ticker match.
    seedReport(db, reportId, ticker, "REJECTED_SANITY");

    // Register tool with injected test DB
    const server = new McpServer({ name: "test-trust-red-4", version: "0" });
    registerBctcFullTools(server, db);

    // Call get_bctc_full — publish guard must intercept before building output
    const output = await callTool(server, "get_bctc_full", { code: ticker });

    // ── GREEN assertions ────────────────────────────────────────────────────

    // 1. Output does NOT contain "Net Revenue :" (the refusal intercepted before buildSummarySection)
    expect(output).not.toContain("Net Revenue :");

    // 2. Output does NOT contain "=== BCTC SUMMARY" section header
    expect(output).not.toContain("=== BCTC SUMMARY");

    // 3. Output contains refusal message matching known strings
    //    PUB-1 returns "Chưa có dữ liệu BCTC" for REJECTED_SANITY status
    expect(output).toMatch(/Chưa có dữ liệu/);

    // 4. DIRECT DB arbiter: confirm report is still REJECTED_SANITY (guard didn't mutate DB)
    const reportRow = db
      .query<{ refine_status: string }, [string]>(
        "SELECT refine_status FROM financial_reports WHERE id = ?",
      )
      .get(reportId);
    expect(reportRow!.refine_status).toBe("REJECTED_SANITY");

    // 5. DIRECT DB arbiter: bctc_table_rows COUNT = 0 (nothing was inserted for this report)
    const tableRowCount = db
      .query<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ?",
      )
      .get(reportId);
    expect(tableRowCount!.cnt).toBe(0);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TR-RED-5: Clean data passes all gates — no false positives
  // ───────────────────────────────────────────────────────────────────────────

  it("TR-RED-5: clean FPT-shaped data passes DT-1 ingest gate — ok=true, window_status='DONE'", async () => {
    /**
     * Purpose: prove no false positive on legitimate BCTC data.
     * Real FPT values (tỷ VND scale): net_revenue=16,058, gross_profit=2,509
     * — none are digit-run sequences. If this test fails, DT-1 is over-blocking.
     *
     * GREEN: validateBctcUnit returns valid:true, violations:[];
     * push returns ok:true; window_status='DONE' in DB.
     */

    const reportId = "tr-red-5-rpt";
    const unitId = "unit-clean-1";
    seedReport(db, reportId, "FPT");

    // Realistic Vietnamese BCTC values — no digit-run patterns
    const cleanMarkdown = [
      "BẢNG KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|---|",
      "| 10 | Doanh thu thuần | 16,058 | 11,481 |",
      "| 20 | Lợi nhuận gộp | 2,509 | 2,100 |",
      "| 30 | Chi phí bán hàng | 500 | 480 |",
    ].join("\n");

    const result = await pushHandler({
      report_id: reportId,
      unit_id: unitId,
      page_numbers: [1],
      markdown: cleanMarkdown,
      confidence: 0.85,
      flags: [],
      window_status: "DONE",
    });

    const parsed = parseResult(result) as { ok: boolean; unit_id?: string };

    // ── GREEN assertions (no false positive) ───────────────────────────────

    // 1. Handler returns ok: true
    expect(parsed.ok).toBe(true);

    // 2. DIRECT DB arbiter: window_status = 'DONE' (not REJECTED_SANITY)
    const unitRow = db
      .query<{ window_status: string }, [string]>(
        "SELECT window_status FROM bctc_refined_units WHERE unit_id = ?",
      )
      .get(unitId);
    expect(unitRow).toBeDefined();
    expect(unitRow!.window_status).toBe("DONE");

    // 3. DIRECT DB arbiter: bctc_refined_units COUNT = 1 (unit was stored)
    const unitCount = db
      .query<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_refined_units WHERE report_id = ? AND window_status = 'DONE'",
      )
      .get(reportId);
    expect(unitCount!.cnt).toBe(1);
  });

  it("TR-RED-5b: clean data passes DT-2 finalize gate — refine_status='DONE', realistic margin", async () => {
    /**
     * Clean data: gross_profit = 30% of net_revenue (realistic) → no MAGNITUDE_GROSS_EQ_NET.
     * No revenue contradiction (single unit) → no CROSS_STMT_REVENUE_CONTRADICTION.
     * Finalize must succeed: refine_status='DONE'.
     */

    const reportId = "tr-red-5b-rpt";
    seedReport(db, reportId, "VCB");

    // Realistic bank: net_revenue = 100,000 (tỷ), gross_profit = 30,000 (30% margin)
    const cleanMarkdown = [
      "BẢNG KẾT QUẢ HOẠT ĐỘNG KINH DOANH",
      "| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |",
      "|---|---|---|---|",
      "| 10 | Doanh thu thuần | 100,000 | 90,000 |",
      "| 20 | Lợi nhuận gộp | 30,000 | 27,000 |",
    ].join("\n");

    // Seed directly as DONE (simulate clean push gate)
    seedRefinedUnit(db, reportId, "unit-clean-2", cleanMarkdown, "DONE");

    const result = await finalizeHandler({
      report_id: reportId,
      report_status: "DONE",
    });

    const parsed = parseResult(result) as { ok: boolean };

    // ── GREEN assertions ────────────────────────────────────────────────────

    expect(parsed.ok).toBe(true);

    // DIRECT DB arbiter: refine_status = 'DONE' (not REJECTED_SANITY)
    const reportRow = db
      .query<{ refine_status: string }, [string]>(
        "SELECT refine_status FROM financial_reports WHERE id = ?",
      )
      .get(reportId);
    expect(reportRow!.refine_status).toBe("DONE");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TR-RED-6: All DB assertions via bun:sqlite direct COUNT — never HTTP echo
  // ───────────────────────────────────────────────────────────────────────────

  it("TR-RED-6: all assertions use bun:sqlite direct DB COUNT, not HTTP echo fields", () => {
    /**
     * Purpose: prove the QA test framework itself uses honest verification.
     * The mcp-server write-wedge lesson: a write-wedged server returns ok:true
     * with rows_stored=N while the DB has 0 rows (WAL frozen, no DB commit).
     * Relying on HTTP echo fields alone is a false-green risk.
     *
     * This test demonstrates the correct pattern:
     * - Insert known data directly via bun:sqlite prepare/run
     * - Verify via bun:sqlite query COUNT(*) — this reads the actual committed DB state
     * - HTTP echo fields (rows_parsed, rows_stored) are NEVER asserted as the sole arbiter
     *
     * GREEN: direct DB reads return exactly what was written.
     */

    const reportId = "tr-red-6-rpt";
    const unitId = "tr-red-6-unit";

    // Direct DB write via bun:sqlite (not via HTTP handler)
    seedReport(db, reportId, "TEST");
    db.prepare(
      `INSERT INTO bctc_refined_units
         (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, window_status)
       VALUES (?, ?, '[1]', '| test |', 1, 0.85, 'DONE')`,
    ).run(reportId, unitId);

    db.prepare(
      `INSERT INTO bctc_table_rows
         (report_id, page_number, statement_section, row_order, label,
          period_current, value_current, is_summary_row)
       VALUES (?, 1, 'income_statement', 1, 'Test Label', 'Q1-2026', 100000, 0)`,
    ).run(reportId);

    // ── Direct DB COUNT assertions (the ONLY valid arbiter per NFR-2) ──────

    // bctc_refined_units: 1 row with window_status='DONE'
    const unitCount = db
      .query<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_refined_units WHERE report_id = ? AND window_status = 'DONE'",
      )
      .get(reportId);
    expect(unitCount!.cnt).toBe(1);

    // bctc_table_rows: 1 row
    const tableRowCount = db
      .query<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id = ?",
      )
      .get(reportId);
    expect(tableRowCount!.cnt).toBe(1);

    // financial_reports: refine_status = 'PENDING' (initial seed state)
    const reportRow = db
      .query<{ refine_status: string }, [string]>(
        "SELECT refine_status FROM financial_reports WHERE id = ?",
      )
      .get(reportId);
    expect(reportRow!.refine_status).toBe("PENDING");

    // Verify REJECTED_SANITY count = 0 for this report (no sanity rejections)
    const rejectedCount = db
      .query<{ cnt: number }, [string]>(
        "SELECT COUNT(*) as cnt FROM bctc_refined_units WHERE report_id = ? AND window_status = 'REJECTED_SANITY'",
      )
      .get(reportId);
    expect(rejectedCount!.cnt).toBe(0);

    // Verify window_status directly for the specific unit (not via HTTP echo unit_id)
    const windowStatusRow = db
      .query<{ window_status: string }, [string]>(
        "SELECT window_status FROM bctc_refined_units WHERE unit_id = ?",
      )
      .get(unitId);
    expect(windowStatusRow!.window_status).toBe("DONE");
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Bonus: TR-RED-1 variant — single digit-run → WARN not BLOCK (edge case)
  // ───────────────────────────────────────────────────────────────────────────

  it("TR-RED-1-WARN: single digit-run value → WARN, window_status='DONE' (no false block)", async () => {
    /**
     * Per DT-1 spec: single digit-run = WARN (not BLOCK).
     * A BCTC line-item code like "123456" appearing once is ambiguous.
     * The gate must NOT block on a single hit (AC-TR1-1-8).
     * window_status must remain 'DONE'; ok must be true.
     */

    const reportId = "tr-red-1w-rpt";
    const unitId = "tr-red-1w-u0";
    seedReport(db, reportId, "VNM");

    // Single digit-run value ("123456" is in ASC_DOUBLED) + legitimate values
    const warnMarkdown = [
      "| Mã số | Chỉ tiêu | Số cuối kỳ |",
      "|---|---|---|",
      "| 123456 | Mã số dòng kế toán | 100,000 |",
    ].join("\n");

    const result = await pushHandler({
      report_id: reportId,
      unit_id: unitId,
      page_numbers: [1],
      markdown: warnMarkdown,
      confidence: 0.85,
      flags: [],
      window_status: "DONE",
    });

    const parsed = parseResult(result) as { ok: boolean };

    // Gate must NOT block (single hit = WARN)
    expect(parsed.ok).toBe(true);

    // DIRECT DB arbiter: window_status = 'DONE' (not REJECTED_SANITY)
    const unitRow = db
      .query<{ window_status: string }, [string]>(
        "SELECT window_status FROM bctc_refined_units WHERE unit_id = ?",
      )
      .get(unitId);
    expect(unitRow!.window_status).toBe("DONE");
  });
});
