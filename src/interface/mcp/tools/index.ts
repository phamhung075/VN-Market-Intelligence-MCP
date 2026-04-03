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
export { registerPriceHistoryTools } from "./priceHistoryTools.js";
export { registerPositionTools } from "./positionTools.js";
export { registerPortfolioRiskTool } from "./portfolioRiskTool.js";
export { registerAlertAccuracyTool } from "./alertAccuracy.js";
export { registerSearchStocksTools } from "./searchTools.js";
export { registerDataFreshnessTools } from "./dataFreshnessTools.js";
export { registerSectorRotationTools } from "./sectorRotationTools.js";
export { registerEarningsCalendarTools } from "./earningsCalendarTools.js";
export { registerAlertDigestTools } from "./alertDigestTools.js";
export { registerCorrelationTools } from "./correlationTools.js";
export { registerExportTools } from "./exportTools.js";
export { registerPerformanceTools } from "./performanceTools.js";
export { registerRebalancingTools } from "./rebalancingTools.js";
export { registerPriceAlertTools } from "./priceAlertTools.js";
export { registerRateLimitTools } from "./rateLimitTools.js";
export { registerSourceHealthTools } from "./sourceHealthTools.js";
export { registerCompareTools } from "./compareTools.js";
export { registerCustomAlertTools } from "./customAlertTools.js";
export { registerAlertMuteTools } from "./alertMuteTools.js";
export { registerTargetAllocationTools } from "./targetAllocationTools.js";
export { registerSentimentTrendTools } from "./sentimentTrendTools.js";
export { registerTelegramReportTools } from "./telegramReportTools.js";
export { registerChangelogTools } from "./changelogTools.js";
export { registerBctcFullTools } from "./bctcFullTools.js";
export { registerMarketContextTools } from "./marketContextTools.js";
export { registerAgentSignalTools } from "./agentSignalTools.js";
export { registerCascadeMetricsTools } from "./cascadeMetricsTools.js";
export { registerSupplyChainTools } from "./supplyChainTools.js";
export { registerLegalRiskTools } from "./legalRiskTools.js";
export { registerPolicyTools } from "./policyTools.js";
export { registerBondMaturityTools } from "./bondMaturityTools.js";
export { registerClimateTools } from "./climateTools.js";
export { registerEnergyTools } from "./energyTools.js";
// Sprint 040 — Macro Catalyst tools (task 251)
export { registerPublicInvestmentTools } from "./publicInvestmentTools.js";
export { registerCreditFlowTools } from "./creditFlowTools.js";
export { registerLeadershipTools } from "./leadershipTools.js";
