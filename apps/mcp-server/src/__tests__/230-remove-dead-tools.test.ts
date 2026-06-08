/**
 * Task 230 — Remove 8 Dead/Forbidden Tools from MCP Registration
 *
 * Verifies that the 8 removed tools are NO LONGER registered on the McpServer,
 * while all other tools remain functional.
 *
 * Tools removed:
 *   1. get_feedback         — feedbackTools.ts
 *   2. get_global_log       — systemTools.ts
 *   3. get_tool_log         — systemTools.ts
 *   4. run_daily_briefing   — alerts.ts
 *   5. search_stocks        — searchTools.ts
 *   6. fetch_ssc_reports    — reports.ts
 *   7. trigger_alert_check  — alertCheckTools.ts
 *   8. export_portfolio_snapshot — exportTools.ts
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerFeedbackTools } from "../interface/mcp/tools/system/feedbackTools.js";
import { registerSystemTools } from "../interface/mcp/tools/system/systemTools.js";
import { registerAlertTools } from "../interface/mcp/tools/alerts/alerts.js";
import { registerReportTools } from "../interface/mcp/tools/financial-reports/reports.js";
import { registerSearchStocksTools } from "../interface/mcp/tools/news-analysis/searchTools.js";
import { registerAlertCheckTools } from "../interface/mcp/tools/alerts/alertCheckTools.js";
import { registerExportTools } from "../interface/mcp/tools/portfolio/exportTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ─────────────────────────────────────────────────────────────────────────────
// Setup: a single McpServer with all affected tool groups registered
// ─────────────────────────────────────────────────────────────────────────────

// Use in-memory DB to avoid side effects
Bun.env["DB_PATH"] = ":memory:";

let server: McpServer;
let registry: Record<string, unknown>;

beforeAll(() => {
  server = new McpServer(
    { name: "test-230", version: "0.0.0" },
    { capabilities: { tools: {} } },
  );

  // Register all affected tool groups
  registerFeedbackTools(server);
  registerSystemTools(server);
  registerAlertTools(server);
  registerReportTools(server);
  registerSearchStocksTools(server);
  registerAlertCheckTools(server);
  registerExportTools(server);

  registry = (server as unknown as { _registeredTools: Record<string, unknown> })
    ._registeredTools;
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: removed tools must NOT be present
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 230 — Removed tools absent from MCP registry", () => {

  it("get_feedback is NOT registered (forbidden — use read_telegram_reports instead)", () => {
    expect("get_feedback" in registry).toBe(false);
  });

  it("get_global_log is NOT registered (internal log access forbidden for AI agents)", () => {
    expect("get_global_log" in registry).toBe(false);
  });

  it("get_tool_log is NOT registered (internal log access forbidden for AI agents)", () => {
    expect("get_tool_log" in registry).toBe(false);
  });

  it("run_daily_briefing is NOT registered (replaced by morningBriefingJob + Telegram)", () => {
    expect("run_daily_briefing" in registry).toBe(false);
  });

  it("search_stocks is NOT registered (dead — low usage, no investment value)", () => {
    expect("search_stocks" in registry).toBe(false);
  });

  it("fetch_ssc_reports is NOT registered (automated via sscCheckerJob cron)", () => {
    expect("fetch_ssc_reports" in registry).toBe(false);
  });

  it("trigger_alert_check is NOT registered (replaced by intelligence cycle step C)", () => {
    expect("trigger_alert_check" in registry).toBe(false);
  });

  it("export_portfolio_snapshot is NOT registered (automated via weeklyPortfolioReportJob)", () => {
    expect("export_portfolio_snapshot" in registry).toBe(false);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Tests: remaining tools from each group ARE still present
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 230 — Remaining tools still registered", () => {

  it("submit_feedback still registered (feedbackTools)", () => {
    expect("submit_feedback" in registry).toBe(true);
  });

  it("get_system_status still registered (systemTools — merged from get_system_health + get_error_summary, task 234)", () => {
    expect("get_system_status" in registry).toBe(true);
  });

  it("get_alerts still registered (alerts)", () => {
    expect("get_alerts" in registry).toBe(true);
  });

  it("mark_alert_read still registered (alerts)", () => {
    expect("mark_alert_read" in registry).toBe(true);
  });

  it("get_analysis_history still registered (alerts)", () => {
    expect("get_analysis_history" in registry).toBe(true);
  });

  it("get_financial_summary still registered (reports)", () => {
    expect("get_financial_summary" in registry).toBe(true);
  });

  it("compare_financials still registered (reports)", () => {
    expect("compare_financials" in registry).toBe(true);
  });

});
