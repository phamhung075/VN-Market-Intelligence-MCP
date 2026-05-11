/**
 * Task 187 — Earnings Calendar: get_earnings_calendar MCP tool
 *
 * Tests cover the pure domain service (earningsCalendar.ts) and the
 * full MCP tool handler (earningsCalendarTools.ts).
 *
 * Acceptance criteria:
 *  - Watchlist stock with no filing → next Q deadline shown as "(ước tính)"
 *  - Stock past deadline with no entry → "QUÁ HẠN"
 *  - Stock within 14 days of deadline → "SẮP ĐẾN"
 *  - Stock with actual filing → "ĐÃ NỘP" with date
 *  - Empty watchlist → "Danh sách theo dõi trống"
 *  - >= 14 tests, tsc 0 errors
 *
 * Vietnamese BCTC statutory deadlines (calendar days after quarter end):
 *  - Q1 (ends 31 Mar): April 30
 *  - Q2 (ends 30 Jun): July 30
 *  - Q3 (ends 30 Sep): October 30
 *  - Q4/Annual (ends 31 Dec): March 30 (next year)
 */

import { describe, it, expect } from "bun:test";
import {
  getDeadlineForQuarter,
  classifyFilingStatus,
  getNextDeadline,
  type FilingStatus,
  type DeadlineInfo,
} from "../domain/services/financial-reports/earningsCalendar.js";

// ─────────────────────────────────────────────────────────────────────────────
// Domain service: getDeadlineForQuarter
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 187 — getDeadlineForQuarter", () => {
  it("returns April 30 for Q1 of a given year", () => {
    const d = getDeadlineForQuarter(2024, 1);
    expect(d).toEqual(new Date("2024-04-30"));
  });

  it("returns July 30 for Q2 of a given year", () => {
    const d = getDeadlineForQuarter(2024, 2);
    expect(d).toEqual(new Date("2024-07-30"));
  });

  it("returns October 30 for Q3 of a given year", () => {
    const d = getDeadlineForQuarter(2024, 3);
    expect(d).toEqual(new Date("2024-10-30"));
  });

  it("returns March 31 of the NEXT year for Q4 (90 days after Dec 31)", () => {
    const d = getDeadlineForQuarter(2024, 4);
    expect(d).toEqual(new Date("2025-03-31"));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Domain service: getNextDeadline
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 187 — getNextDeadline", () => {
  it("returns Q1 deadline when current date is in January", () => {
    // Jan 15 2025 → next deadline is Q4-2024: Mar 31 2025 (90 days after Dec 31)
    const result = getNextDeadline(new Date("2025-01-15"));
    expect(result.deadline).toEqual(new Date("2025-03-31"));
    expect(result.quarter).toBe(4);
    expect(result.year).toBe(2024);
  });

  it("returns Q1-2025 deadline when current date is March 31 2025", () => {
    // Mar 31 2025 → Q4-2024 deadline (Mar 30) has just passed, next is Q1-2025: Apr 30 2025
    const result = getNextDeadline(new Date("2025-03-31"));
    expect(result.deadline).toEqual(new Date("2025-04-30"));
    expect(result.quarter).toBe(1);
    expect(result.year).toBe(2025);
  });

  it("returns Q2 deadline when current date is May 1", () => {
    // May 1 2025 → Q1 deadline (Apr 30) just passed, next is Q2: Jul 30 2025
    const result = getNextDeadline(new Date("2025-05-01"));
    expect(result.deadline).toEqual(new Date("2025-07-30"));
    expect(result.quarter).toBe(2);
    expect(result.year).toBe(2025);
  });

  it("returns Q3 deadline when current date is August 1", () => {
    const result = getNextDeadline(new Date("2025-08-01"));
    expect(result.deadline).toEqual(new Date("2025-10-30"));
    expect(result.quarter).toBe(3);
    expect(result.year).toBe(2025);
  });

  it("returns Q4 deadline (next year) when current date is November 1", () => {
    const result = getNextDeadline(new Date("2025-11-01"));
    expect(result.deadline).toEqual(new Date("2026-03-31"));
    expect(result.quarter).toBe(4);
    expect(result.year).toBe(2025);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Domain service: classifyFilingStatus
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 187 — classifyFilingStatus", () => {
  // Today from task context: 2026-04-01
  const today = new Date("2026-04-01");

  it("returns DA_NOP with filing date when report exists", () => {
    const status = classifyFilingStatus(today, {
      filingDate: "2026-03-15",
      quarter: 4,
      year: 2025,
      deadline: new Date("2026-03-30"),
    });
    expect(status.status).toBe("DA_NOP");
    expect(status.filingDate).toBe("2026-03-15");
  });

  it("returns QUA_HAN when deadline has passed and no filing", () => {
    // Today is 2026-04-01, deadline was 2026-03-30 → overdue
    const status = classifyFilingStatus(today, {
      filingDate: null,
      quarter: 4,
      year: 2025,
      deadline: new Date("2026-03-30"),
    });
    expect(status.status).toBe("QUA_HAN");
  });

  it("returns SAP_DEN when deadline is within 14 days and no filing", () => {
    // Today is 2026-04-01, deadline is 2026-04-14 → 13 days away
    const status = classifyFilingStatus(today, {
      filingDate: null,
      quarter: 1,
      year: 2026,
      deadline: new Date("2026-04-14"),
    });
    expect(status.status).toBe("SAP_DEN");
  });

  it("returns SAP_DEN exactly on the 14th day boundary", () => {
    // deadline exactly 14 days from today
    const status = classifyFilingStatus(today, {
      filingDate: null,
      quarter: 1,
      year: 2026,
      deadline: new Date("2026-04-15"),
    });
    expect(status.status).toBe("SAP_DEN");
  });

  it("returns UOC_TINH when deadline is more than 14 days away and no filing", () => {
    // Today is 2026-04-01, deadline is 2026-04-30 → 29 days away
    const status = classifyFilingStatus(today, {
      filingDate: null,
      quarter: 1,
      year: 2026,
      deadline: new Date("2026-04-30"),
    });
    expect(status.status).toBe("UOC_TINH");
  });

  it("DA_NOP takes priority even if filing date is after deadline", () => {
    // Late filer — still DA_NOP once filed
    const status = classifyFilingStatus(today, {
      filingDate: "2026-04-01",
      quarter: 4,
      year: 2025,
      deadline: new Date("2026-03-30"),
    });
    expect(status.status).toBe("DA_NOP");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool integration: get_earnings_calendar
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEarningsCalendarTools } from "../interface/mcp/tools/financial-reports/earningsCalendarTools.js";
import { Database } from "bun:sqlite";

/** Call a registered MCP tool by name using the SDK's internal registry. */
async function callTool(
  server: McpServer,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const registry = (server as unknown as {
    _registeredTools: Record<string, {
      handler: (a: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;
  const tool = registry[name];
  if (!tool) throw new Error(`Tool "${name}" not registered`);
  const result = await tool.handler(args);
  const r = result as { content: Array<{ text: string }> };
  return r.content[0]?.text ?? "";
}

describe("Task 187 — get_earnings_calendar MCP tool", () => {
  it("returns 'Danh sách theo dõi trống' for empty watchlist", async () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, exchange TEXT NOT NULL, domain TEXT NOT NULL DEFAULT 'other',
      company_name TEXT, notes TEXT, added_at TEXT NOT NULL,
      alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY, action_code TEXT NOT NULL, company_name TEXT NOT NULL,
      exchange TEXT NOT NULL, domain TEXT NOT NULL,
      period_year INTEGER NOT NULL, period_quarter INTEGER, period_type TEXT NOT NULL,
      period_start TEXT NOT NULL, period_end TEXT NOT NULL, sort_key TEXT NOT NULL,
      published_at TEXT, parsed_at TEXT NOT NULL,
      balance_sheet_json TEXT NOT NULL, income_stmt_json TEXT NOT NULL,
      cash_flow_json TEXT NOT NULL, ratios_json TEXT NOT NULL,
      UNIQUE(action_code, sort_key)
    )`);

    const server = new McpServer({ name: "test", version: "0.0.1" }, { capabilities: { tools: {} } });
    registerEarningsCalendarTools(server, db);

    const text = await callTool(server, "get_earnings_calendar", {
      _testDate: "2026-04-01",
    });

    expect(text).toContain("Danh sách theo dõi trống");
  });

  it("shows UOC_TINH for a stock with no filing and deadline far away", async () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, exchange TEXT NOT NULL, domain TEXT NOT NULL DEFAULT 'other',
      company_name TEXT, notes TEXT, added_at TEXT NOT NULL,
      alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY, action_code TEXT NOT NULL, company_name TEXT NOT NULL,
      exchange TEXT NOT NULL, domain TEXT NOT NULL,
      period_year INTEGER NOT NULL, period_quarter INTEGER, period_type TEXT NOT NULL,
      period_start TEXT NOT NULL, period_end TEXT NOT NULL, sort_key TEXT NOT NULL,
      published_at TEXT, parsed_at TEXT NOT NULL,
      balance_sheet_json TEXT NOT NULL, income_stmt_json TEXT NOT NULL,
      cash_flow_json TEXT NOT NULL, ratios_json TEXT NOT NULL,
      UNIQUE(action_code, sort_key)
    )`);
    db.exec(`INSERT INTO watchlist (code, exchange, domain, added_at) VALUES ('VNM', 'HOSE', 'agriculture', '2026-01-01')`);

    const server = new McpServer({ name: "test", version: "0.0.1" }, { capabilities: { tools: {} } });
    registerEarningsCalendarTools(server, db);

    // Date: 2026-04-01. Next deadline is Q1-2026: Apr 30 2026 (29 days away → UOC_TINH)
    const text = await callTool(server, "get_earnings_calendar", {
      _testDate: "2026-04-01",
    });

    expect(text).toContain("VNM");
    expect(text).toContain("ước tính");
  });

  it("shows QUÁ HẠN for a stock past its deadline with no filing", async () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, exchange TEXT NOT NULL, domain TEXT NOT NULL DEFAULT 'other',
      company_name TEXT, notes TEXT, added_at TEXT NOT NULL,
      alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY, action_code TEXT NOT NULL, company_name TEXT NOT NULL,
      exchange TEXT NOT NULL, domain TEXT NOT NULL,
      period_year INTEGER NOT NULL, period_quarter INTEGER, period_type TEXT NOT NULL,
      period_start TEXT NOT NULL, period_end TEXT NOT NULL, sort_key TEXT NOT NULL,
      published_at TEXT, parsed_at TEXT NOT NULL,
      balance_sheet_json TEXT NOT NULL, income_stmt_json TEXT NOT NULL,
      cash_flow_json TEXT NOT NULL, ratios_json TEXT NOT NULL,
      UNIQUE(action_code, sort_key)
    )`);
    db.exec(`INSERT INTO watchlist (code, exchange, domain, added_at) VALUES ('FPT', 'HOSE', 'tech', '2026-01-01')`);

    const server = new McpServer({ name: "test", version: "0.0.1" }, { capabilities: { tools: {} } });
    registerEarningsCalendarTools(server, db);

    // Date: 2026-04-01. Q4-2025 deadline was Mar 30 2026 → QUÁ HẠN, no filing for FPT
    const text = await callTool(server, "get_earnings_calendar", {
      _testDate: "2026-04-01",
    });

    expect(text).toContain("FPT");
    expect(text).toContain("QUÁ HẠN");
  });

  it("shows SẮP ĐẾN for a stock with deadline within 14 days", async () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, exchange TEXT NOT NULL, domain TEXT NOT NULL DEFAULT 'other',
      company_name TEXT, notes TEXT, added_at TEXT NOT NULL,
      alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY, action_code TEXT NOT NULL, company_name TEXT NOT NULL,
      exchange TEXT NOT NULL, domain TEXT NOT NULL,
      period_year INTEGER NOT NULL, period_quarter INTEGER, period_type TEXT NOT NULL,
      period_start TEXT NOT NULL, period_end TEXT NOT NULL, sort_key TEXT NOT NULL,
      published_at TEXT, parsed_at TEXT NOT NULL,
      balance_sheet_json TEXT NOT NULL, income_stmt_json TEXT NOT NULL,
      cash_flow_json TEXT NOT NULL, ratios_json TEXT NOT NULL,
      UNIQUE(action_code, sort_key)
    )`);
    db.exec(`INSERT INTO watchlist (code, exchange, domain, added_at) VALUES ('VCB', 'HOSE', 'banking', '2026-01-01')`);

    const server = new McpServer({ name: "test", version: "0.0.1" }, { capabilities: { tools: {} } });
    registerEarningsCalendarTools(server, db);

    // Date: 2026-04-17. Next deadline Q1-2026: Apr 30 2026 (13 days away → SẮP ĐẾN)
    const text = await callTool(server, "get_earnings_calendar", {
      _testDate: "2026-04-17",
    });

    expect(text).toContain("VCB");
    expect(text).toContain("SẮP ĐẾN");
  });

  it("shows ĐÃ NỘP with date for a stock that has filed", async () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, exchange TEXT NOT NULL, domain TEXT NOT NULL DEFAULT 'other',
      company_name TEXT, notes TEXT, added_at TEXT NOT NULL,
      alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY, action_code TEXT NOT NULL, company_name TEXT NOT NULL,
      exchange TEXT NOT NULL, domain TEXT NOT NULL,
      period_year INTEGER NOT NULL, period_quarter INTEGER, period_type TEXT NOT NULL,
      period_start TEXT NOT NULL, period_end TEXT NOT NULL, sort_key TEXT NOT NULL,
      published_at TEXT, parsed_at TEXT NOT NULL,
      balance_sheet_json TEXT NOT NULL, income_stmt_json TEXT NOT NULL,
      cash_flow_json TEXT NOT NULL, ratios_json TEXT NOT NULL,
      UNIQUE(action_code, sort_key)
    )`);
    db.exec(`INSERT INTO watchlist (code, exchange, domain, added_at) VALUES ('VCB', 'HOSE', 'banking', '2026-01-01')`);
    // Insert a Q4-2025 filing for VCB
    db.exec(`INSERT INTO financial_reports
      (id, action_code, company_name, exchange, domain, period_year, period_quarter, period_type,
       period_start, period_end, sort_key, published_at, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
      VALUES ('r1', 'VCB', 'Vietcombank', 'HOSE', 'banking', 2025, 4, 'Q4',
       '2025-10-01', '2025-12-31', '2025-Q4', '2026-03-15T00:00:00Z', '2026-03-15T00:00:00Z',
       '{}', '{}', '{}', '{}')`);

    const server = new McpServer({ name: "test", version: "0.0.1" }, { capabilities: { tools: {} } });
    registerEarningsCalendarTools(server, db);

    // Date: 2026-04-01. Q4-2025 deadline was Mar 30 2026, VCB filed on Mar 15 → ĐÃ NỘP
    const text = await callTool(server, "get_earnings_calendar", {
      _testDate: "2026-04-01",
    });

    expect(text).toContain("VCB");
    expect(text).toContain("ĐÃ NỘP");
    expect(text).toContain("2026-03-15");
  });

  it("handles multiple stocks with mixed statuses", async () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY, exchange TEXT NOT NULL, domain TEXT NOT NULL DEFAULT 'other',
      company_name TEXT, notes TEXT, added_at TEXT NOT NULL,
      alert_drop_pct REAL NOT NULL DEFAULT -3, alert_rise_pct REAL NOT NULL DEFAULT 5,
      alert_impact_min REAL NOT NULL DEFAULT 7, alert_report_new INTEGER NOT NULL DEFAULT 1
    )`);
    db.exec(`CREATE TABLE IF NOT EXISTS financial_reports (
      id TEXT PRIMARY KEY, action_code TEXT NOT NULL, company_name TEXT NOT NULL,
      exchange TEXT NOT NULL, domain TEXT NOT NULL,
      period_year INTEGER NOT NULL, period_quarter INTEGER, period_type TEXT NOT NULL,
      period_start TEXT NOT NULL, period_end TEXT NOT NULL, sort_key TEXT NOT NULL,
      published_at TEXT, parsed_at TEXT NOT NULL,
      balance_sheet_json TEXT NOT NULL, income_stmt_json TEXT NOT NULL,
      cash_flow_json TEXT NOT NULL, ratios_json TEXT NOT NULL,
      UNIQUE(action_code, sort_key)
    )`);
    db.exec(`INSERT INTO watchlist (code, exchange, domain, added_at) VALUES ('VCB', 'HOSE', 'banking', '2026-01-01')`);
    db.exec(`INSERT INTO watchlist (code, exchange, domain, added_at) VALUES ('FPT', 'HOSE', 'tech', '2026-01-01')`);
    // VCB has filed Q4-2025
    db.exec(`INSERT INTO financial_reports
      (id, action_code, company_name, exchange, domain, period_year, period_quarter, period_type,
       period_start, period_end, sort_key, published_at, parsed_at,
       balance_sheet_json, income_stmt_json, cash_flow_json, ratios_json)
      VALUES ('r1', 'VCB', 'Vietcombank', 'HOSE', 'banking', 2025, 4, 'Q4',
       '2025-10-01', '2025-12-31', '2025-Q4', '2026-03-15T00:00:00Z', '2026-03-15T00:00:00Z',
       '{}', '{}', '{}', '{}')`);

    const server = new McpServer({ name: "test", version: "0.0.1" }, { capabilities: { tools: {} } });
    registerEarningsCalendarTools(server, db);

    // Date: 2026-04-01 — VCB: ĐÃ NỘP, FPT: QUÁ HẠN (deadline Mar 30 passed, no filing)
    const text = await callTool(server, "get_earnings_calendar", {
      _testDate: "2026-04-01",
    });

    expect(text).toContain("VCB");
    expect(text).toContain("ĐÃ NỘP");
    expect(text).toContain("FPT");
    expect(text).toContain("QUÁ HẠN");
  });
});
