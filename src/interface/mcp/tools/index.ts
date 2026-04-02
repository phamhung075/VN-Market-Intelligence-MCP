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
export { registerMacroTools } from "./macroTools.js";
export { registerTelegramTools } from "./telegramTools.js";
export { registerSummaryTools } from "./summaryTools.js";
export { registerSystemTools } from "./systemTools.js";
export { registerPortfolioTools } from "./portfolioTools.js";
export { registerFeedbackTools } from "./feedbackTools.js";
export { registerPredictionTools } from "./predictionTools.js";
export { registerAlertCheckTools } from "./alertCheckTools.js";
