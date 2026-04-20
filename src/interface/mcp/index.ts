/**
 * MCP Interface — barrel export
 *
 * Bun HTTP server + SSE transport + McpServer factory.
 * Validates input with Zod, delegates to application use cases,
 * and always returns { content: [{ type: 'text', text: ... }] }.
 *
 * Sub-folders:
 *   tools/  — individual tool handler modules (task 082+)
 *
 * Implemented tasks:
 *   - Task 081: Bun HTTP server + SSEServerTransport
 *   - Task 085: SSC report tools (fetch / summary / compare)
 *
 * Implemented tasks:
 *   - Task 082: Watchlist tools (add / remove / get / update_thresholds)
 *   - Task 086: Alert tools (get_alerts, mark_alert_read, run_daily_briefing, get_analysis_history)
 *
 * Pending tasks:
 *   - Task 083: Analysis tools (fetch_and_analyze, run_impact_chain)
 *   - Task 084: Market tools (snapshot, search_context, patterns)
 */

// ── Task 081: Bun HTTP server + SSE transport ─────────────────────────────
export {
  createBunServer,
  type BunServerOptions,
  type BunServerInstance,
} from "./server.js";

export { SseSessionManager } from "./transport.js";

// ── Task 082: Watchlist MCP tools ─────────────────────────────────────────
export { registerWatchlistTools } from "./tools/watchlist.js";

// ── Task 085: SSC report MCP tools ─────────────────────────────────────────
export {
  registerReportTools,
  type PipelineFn,
} from "./tools/financial-reports/reports.js";

// ── Task 086: Alert MCP tools ──────────────────────────────────────────────
export { registerAlertTools } from "./tools/alerts.js";
