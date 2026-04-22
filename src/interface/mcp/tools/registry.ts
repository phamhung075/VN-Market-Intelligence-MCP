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

import { registerWatchlistTools } from "./system/watchlist.js";
import { registerReportTools } from "./financial-reports/reports.js";
import { registerAlertTools } from "./alerts/alerts.js";
import { registerAnalysisTools } from "./news-analysis/analysis.js";
import { registerMarketTools } from "./market-data/marketTools.js";
import { registerMacroTools } from "./macro/macroTools.js";
import { registerTelegramTools } from "./briefings/telegramTools.js";
import { registerSummaryTools } from "./briefings/summaryTools.js";
import { registerSystemTools } from "./system/systemTools.js";
import { registerPortfolioTools } from "./portfolio/portfolioTools.js";
import { registerFeedbackTools } from "./system/feedbackTools.js";
import { registerPredictionTools } from "./macro/predictionTools.js";
import { registerPriceHistoryTools } from "./market-data/priceHistoryTools.js";
import { registerPositionTools } from "./portfolio/positionTools.js";
import { registerPortfolioRiskTool } from "./portfolio/portfolioRiskTool.js";
import { registerAlertAccuracyTool } from "./alerts/alertAccuracy.js";
import { registerSectorRotationTools } from "./sector/sectorRotationTools.js";
import { registerEarningsCalendarTools } from "./financial-reports/earningsCalendarTools.js";
import { registerAlertDigestTools } from "./alerts/alertDigestTools.js";
import { registerCorrelationTools } from "./sector/correlationTools.js";
import { registerPerformanceTools } from "./portfolio/performanceTools.js";
import { registerRebalancingTools } from "./portfolio/rebalancingTools.js";
import { registerPriceAlertTools } from "./market-data/priceAlertTools.js";
import { registerRateLimitTools } from "./macro/rateLimitTools.js";
import { registerCompareTools } from "./news-analysis/compareTools.js";
import { registerCustomAlertTools } from "./alerts/customAlertTools.js";
import { registerAlertMuteTools } from "./alerts/alertMuteTools.js";
import { registerTargetAllocationTools } from "./portfolio/targetAllocationTools.js";
import { registerSentimentTrendTools } from "./news-analysis/sentimentTrendTools.js";
import { registerTelegramReportTools } from "./briefings/telegramReportTools.js";
import { registerChangelogTools } from "./briefings/changelogTools.js";
import { registerBctcFullTools } from "./financial-reports/bctcFullTools.js";
import { registerMarketContextTools } from "./market-data/marketContextTools.js";
import { registerAgentSignalTools } from "./news-analysis/agentSignalTools.js";
import { registerCascadeMetricsTools } from "./news-analysis/cascadeMetricsTools.js";
import { registerSupplyChainTools } from "./sector/supplyChainTools.js";
import { registerLegalRiskTools } from "./sector/legalRiskTools.js";
import { registerPolicyTools } from "./macro/policyTools.js";
import { registerBondMaturityTools } from "./sector/bondMaturityTools.js";
import { registerClimateTools } from "./sector/climateTools.js";
import { registerEnergyTools } from "./sector/energyTools.js";
import { registerPublicInvestmentTools } from "./sector/publicInvestmentTools.js";
import { registerCreditFlowTools } from "./sector/creditFlowTools.js";
import { registerLeadershipTools } from "./sector/leadershipTools.js";
import { registerCrisisTools } from "./sector/crisisTools.js";
import { registerPharmaTools } from "./sector/pharmaTools.js";
import { registerSectorComparisonTools } from "./sector/sectorComparisonTools.js";
import { registerKinhDichTools } from "./kinhdich/kinhDichTools.js";
import { registerBrokerCredibilityTools } from "./sector/brokerCredibilityTools.js";
import { registerAskQueueTools } from "./system/askQueueTools.js";
import { registerAgentWorkLogTools } from "./system/agentWorkLogTools.js";
import { registerCronHealthTools } from "./alerts/cronHealthTools.js";
import { registerVpsProxyTools } from "./system/vpsProxyTools.js";
import { registerVpsHealthTools } from "./system/vpsHealthTools.js";
import { registerSlaStatusTools } from "./system/slaStatusTools.js";
import { registerEvidenceTools } from "./macro/evidenceTools.js";
import { registerCalibrationTools } from "./macro/calibrationTools.js";
import { registerForeignFlowTools } from "./market-data/foreignFlowTools.js";
import { registerInsiderTools } from "./market-data/insiderTools.js";
import { registerMarketMessageTools } from "./briefings/marketMessageTools.js";
import { registerTickerIntelligenceTools } from "./market-data/tickerIntelligenceTools.js";
import { registerTechnicalIndicatorTools } from "./market-data/technicalIndicatorTools.js";
import { registerPipelineHealthTools } from "./alerts/pipelineHealthTools.js";
import { registerCascadeOutcomeTools } from "./news-analysis/cascadeOutcomeTools.js";
import { registerCycleBootstrapTool } from "./system/cycleBootstrapTool.js";

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
  registerCronHealthTools,       // Task 1102: get_cron_health
  registerVpsProxyTools,         // VPS proxy: get_vps_proxy_health
  registerVpsHealthTools,        // Task 234: get_vps_service_health (+1 tool → 102)
  registerSlaStatusTools,        // Task 234: get_sla_status (+1 tool → 103)
  registerEvidenceTools,         // Task 1117: record_evidence_fragment (+1 tool → 85)
  registerCalibrationTools,     // Task 1129: get_calibration_report (+1 tool → 89)
  registerForeignFlowTools,     // Task 1134: get_foreign_flow (+1 tool) + Task 1283: diagnostics tools (+2 tools → 105)
  registerInsiderTools,         // Task 1146: get_insider_transactions (+1 tool → 91)
  registerMarketMessageTools,   // Task 1166: get_unreviewed_market_messages + review_market_message (+2 tools → 93)
  registerTickerIntelligenceTools, // Task 1180: get_ticker_intelligence (+1 tool → 97)
  registerTechnicalIndicatorTools, // Task 1302/1303: get_technical_indicators (+1 tool → 98)
  registerPipelineHealthTools,     // Task 1367: get_pipeline_health (+1 tool → 100)
  registerCascadeOutcomeTools,     // Task 1504: get_cascade_outcomes (+1 tool → 100)
  registerCycleBootstrapTool,      // Task 1563: get_cycle_bootstrap (+1 tool → 101)
];
