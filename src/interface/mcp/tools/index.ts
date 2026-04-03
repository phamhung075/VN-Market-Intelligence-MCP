/**
 * Barrel — MCP tool registration functions
 *
 * Re-exports all `register*Tools` functions so that server.ts (and tests) can
 * import from a single entry point.
 *
 * @module interface/mcp/tools
 */

export { registerWatchlistTools } from "./watchlist.js";
export { registerReportTools } from "./reports.js";
export { registerAlertTools } from "./alerts.js";
export { registerAnalysisTools } from "./analysis.js";
export { registerMarketTools } from "./marketTools.js";
// Sprint 040 — Macro Catalyst tools (task 251)
export { registerPublicInvestmentTools } from "./publicInvestmentTools.js";
export { registerCreditFlowTools } from "./creditFlowTools.js";
export { registerLeadershipTools } from "./leadershipTools.js";
