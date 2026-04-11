/**
 * Dynamic Tool Registry — Task 308
 *
 * Single source of truth for all MCP tool registration functions.
 * To add a new tool: create the tool file, add one entry here.
 * No edits to server.ts required.
 *
 * @module interface/mcp/tools/registry
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerWatchlistTools } from "./watchlist.js";
import { registerReportTools } from "./reports.js";
import { registerAlertTools } from "./alerts.js";
import { registerAnalysisTools } from "./analysis.js";
import { registerMarketTools } from "./marketTools.js";
import { registerMacroTools } from "./macroTools.js";
import { registerTelegramTools } from "./telegramTools.js";
import { registerSummaryTools } from "./summaryTools.js";
import { registerSystemTools } from "./systemTools.js";
import { registerPortfolioTools } from "./portfolioTools.js";
import { registerFeedbackTools } from "./feedbackTools.js";
import { registerPredictionTools } from "./predictionTools.js";
import { registerPriceHistoryTools } from "./priceHistoryTools.js";
import { registerPositionTools } from "./positionTools.js";
import { registerPortfolioRiskTool } from "./portfolioRiskTool.js";
import { registerAlertAccuracyTool } from "./alertAccuracy.js";
import { registerSectorRotationTools } from "./sectorRotationTools.js";
import { registerEarningsCalendarTools } from "./earningsCalendarTools.js";
import { registerAlertDigestTools } from "./alertDigestTools.js";
import { registerCorrelationTools } from "./correlationTools.js";
import { registerPerformanceTools } from "./performanceTools.js";
import { registerRebalancingTools } from "./rebalancingTools.js";
import { registerPriceAlertTools } from "./priceAlertTools.js";
import { registerRateLimitTools } from "./rateLimitTools.js";
import { registerCompareTools } from "./compareTools.js";
import { registerCustomAlertTools } from "./customAlertTools.js";
import { registerAlertMuteTools } from "./alertMuteTools.js";
import { registerTargetAllocationTools } from "./targetAllocationTools.js";
import { registerSentimentTrendTools } from "./sentimentTrendTools.js";
import { registerTelegramReportTools } from "./telegramReportTools.js";
import { registerChangelogTools } from "./changelogTools.js";
import { registerBctcFullTools } from "./bctcFullTools.js";
import { registerMarketContextTools } from "./marketContextTools.js";
import { registerAgentSignalTools } from "./agentSignalTools.js";
import { registerCascadeMetricsTools } from "./cascadeMetricsTools.js";
import { registerSupplyChainTools } from "./supplyChainTools.js";
import { registerLegalRiskTools } from "./legalRiskTools.js";
import { registerPolicyTools } from "./policyTools.js";
import { registerBondMaturityTools } from "./bondMaturityTools.js";
import { registerClimateTools } from "./climateTools.js";
import { registerEnergyTools } from "./energyTools.js";
import { registerPublicInvestmentTools } from "./publicInvestmentTools.js";
import { registerCreditFlowTools } from "./creditFlowTools.js";
import { registerLeadershipTools } from "./leadershipTools.js";
import { registerCrisisTools } from "./crisisTools.js";
import { registerPharmaTools } from "./pharmaTools.js";
import { registerSectorComparisonTools } from "./sectorComparisonTools.js";
import { registerKinhDichTools } from "./kinhDichTools.js";
import { registerBrokerCredibilityTools } from "./brokerCredibilityTools.js";
import { registerAskQueueTools } from "./askQueueTools.js";
import { registerAgentWorkLogTools } from "./agentWorkLogTools.js";

/**
 * Flat array of all MCP tool registration functions.
 *
 * Adding a new tool:
 *   1. Create src/interface/mcp/tools/<yourTool>.ts
 *   2. Add one line here: `registerYourTools,`
 *   3. Done — server.ts needs no changes.
 */
export const toolRegistry: Array<(server: McpServer) => void> = [
  registerWatchlistTools,
  registerReportTools,
  registerAlertTools,
  registerAnalysisTools,
  registerMarketTools,
  registerMacroTools,
  registerTelegramTools,
  registerSummaryTools,
  registerSystemTools,
  registerPortfolioTools,
  registerFeedbackTools,
  registerPredictionTools,
  registerPriceHistoryTools,
  registerPositionTools,
  registerPortfolioRiskTool,
  registerAlertAccuracyTool,
  registerSectorRotationTools,
  registerEarningsCalendarTools,
  registerAlertDigestTools,
  registerCorrelationTools,
  registerPerformanceTools,
  registerRebalancingTools,
  registerPriceAlertTools,
  registerRateLimitTools,
  registerCompareTools,
  registerCustomAlertTools,
  registerAlertMuteTools,
  registerTargetAllocationTools,
  registerSentimentTrendTools,
  registerTelegramReportTools,
  registerChangelogTools,
  registerBctcFullTools,
  registerMarketContextTools,
  registerAgentSignalTools,
  registerCascadeMetricsTools,
  registerSupplyChainTools,
  registerLegalRiskTools,
  registerPolicyTools,
  registerBondMaturityTools,
  registerClimateTools,
  registerEnergyTools,
  registerPublicInvestmentTools,
  registerCreditFlowTools,
  registerLeadershipTools,
  registerCrisisTools,
  registerPharmaTools,         // Sprint 044: get_pharma_signals
  registerSectorComparisonTools, // Sprint 045: get_sector_comparison
  registerKinhDichTools,       // Task 285: 6 Kinh Dich tools
  registerBrokerCredibilityTools, // Task 915: get_broker_credibility
  registerAskQueueTools,          // Task 1078: get_pending_ask_questions + answer_ask_question
  registerAgentWorkLogTools,     // Task 1109: log_agent_work + get_agent_work_log
];
