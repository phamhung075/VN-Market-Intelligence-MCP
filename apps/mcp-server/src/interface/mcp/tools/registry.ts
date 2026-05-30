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

import { registerSequentialMarketAnalysisTools } from "./analysis/sequential-market-analysis.js";
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
import { registerAlertAccuracyTool, registerMarkAlertOutcomeTool } from "./alerts/alertAccuracy.js";
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
import { registerBctcSkipTool } from "./financial-reports/bctcSkipTool.js";
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
import { registerSignalDiagnosticsTools } from "./system/signalDiagnosticsTools.js";
import { registerImfSignalsTool } from "./macro/imfSignals.js";
import { registerAgentMemoryTools } from "./system/agentMemoryTools.js";
import { registerAgentMemoryUpdateTools } from "./system/agentMemoryUpdateTools.js";
import { registerBctcDebugTriggerTool } from "./system/bctcDebugTriggerTool.js";
import { registerPriceDebugTriggerTool } from "./system/priceDebugTriggerTool.js";
import { registerNewsDebugTriggerTool } from "./system/newsDebugTriggerTool.js";
import { registerSbvDebugTriggerTool } from "./system/sbvDebugTriggerTool.js";
import { registerForeignFlowDebugTriggerTool } from "./system/foreignFlowDebugTriggerTool.js";
import { registerCarryTools } from "./macro/carryTools.js";
import { registerDinhGiaTools } from "./macro/dinhGiaTools.js";
import { registerInvestmentClockTools, registerPyramidTierTool } from "./macro/investmentClockTools.js";
import { registerVpsServiceRestartTool } from "./system/vpsServiceRestartTool.js";
import { registerSmartCompactTool } from "./system/smartCompactTool.js";
import { registerBctcBatchSweepTool } from "./financial-reports/bctcBatchSweepTool.js";
import { registerBacktestTools, registerBacktestQueryTools, registerBacktestLifecycleTools } from "./backtesting/index.js";
import { registerAlertVerdictTools } from "./alerts/alertVerdictTools.js";
import { registerComputeAccrualsTool } from "./financial-reports/computeAccrualsTool.js"; // Task 1878b: compute_accruals (#129)
import { registerFedLiquiditySpreadTool } from "./macro/getFedLiquiditySpreadTool.js"; // Task 1879b: get_fed_liquidity_spread (#130)
import { registerGetCashFlowTool } from "./financial-reports/cashFlowTool.js"; // Task 1890a-A: get_cash_flow (#131)
import { registerGetBctcOcfTool } from "./financial-reports/getBctcOcfTool.js"; // Task 1909b: get_bctc_ocf (#132)
import { registerGetIsmSubcomponentsTool } from "./macro/getIsmSubcomponentsTool.js"; // Task 1910a: get_ism_subcomponents (#133)
import { registerGetAccuracyContextTool } from "./news-analysis/getAccuracyContextTool.js"; // 2026-05-17: get_accuracy_context (#134)
import { registerCoordinationTools } from "./system/coordinationTools.js"; // Task task-lock Phase 1: task_claim, task_heartbeat, task_release, task_list_held (#135-#138)
import { registerGetBctcPageTextTool } from "./financial-reports/getBctcPageTextTool.js"; // BCTC-AGENTIC-REFINE FR-3: get_bctc_page_text (#139)
import { registerGetBctcPageImageTool } from "./financial-reports/getBctcPageImageTool.js"; // BCTC-AGENTIC-REFINE FR-4: get_bctc_page_image (#140)
import { registerGetBctcRefinedTool } from "./financial-reports/getBctcRefinedTool.js"; // BCTC-AGENTIC-REFINE FR-11: get_bctc_refined (#141)
import { registerGetBctcPendingRefineTool } from "./financial-reports/getBctcPendingRefineTool.js"; // AR-MCP-OPTY AC-1: get_bctc_pending_refine (#142)
import { registerPushBctcRefinedUnitTool } from "./financial-reports/pushBctcRefinedUnitTool.js"; // AR-MCP-OPTY AC-2: push_bctc_refined_unit (#143)
import { registerFinalizeBctcRefineTool } from "./financial-reports/finalizeBctcRefineTool.js"; // AR-MCP-OPTY AC-3: finalize_bctc_refine (#144)
import { registerListFlaggedBctcCellsTool } from "./financial-reports/listFlaggedBctcCellsTool.js"; // HC-DEV-4: list_flagged_bctc_cells (#145)
import { registerSubmitBctcCorrectionTool } from "./financial-reports/submitBctcCorrectionTool.js"; // HC-DEV-4: submit_bctc_correction (#146)

/**
 * Flat array of all MCP tool registration functions.
 *
 * Adding a new tool:
 *   1. Create src/interface/mcp/tools/<yourTool>.ts
 *   2. Add one line here: `registerYourTools,`
 *   3. Done — server.ts needs no changes.
 */
export const toolRegistry: Array<(server: McpServer) => void> = [
  registerSequentialMarketAnalysisTools, // Sequential thinking for complex market analysis
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
  registerMarkAlertOutcomeTool,
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
  registerSignalDiagnosticsTools,  // Task 1293c: get_signal_rejection_summary (+1 tool → 102)
  registerImfSignalsTool,          // Task 1296b: get_imf_signals (+1 tool → 103)
  registerAgentMemoryTools,        // Task 1300a: get_memory_files + search_memory_by_trigger (+2 tools → 105)
  registerAgentMemoryUpdateTools,  // Task 1300b: append_session_record + update_memory_file (+2 tools → 107)
  registerBctcDebugTriggerTool,         // FIX-BCTC-DEBUG: trigger_bctc_vps_fetch (+1 tool → 109)
  registerPriceDebugTriggerTool,        // FIX-VPS-DEBUG-TRIGGERS: trigger_price_vps_fetch (+1 → 110)
  registerNewsDebugTriggerTool,         // FIX-VPS-DEBUG-TRIGGERS: trigger_news_vps_fetch (+1 → 111)
  registerSbvDebugTriggerTool,          // FIX-VPS-DEBUG-TRIGGERS: trigger_sbv_vps_fetch (+1 → 112)
  registerForeignFlowDebugTriggerTool,  // FIX-VPS-DEBUG-TRIGGERS: trigger_foreign_flow_vps_fetch (+1 → 113)
  registerBctcSkipTool,                 // Task 1343d: bctc_skip_queue_item (+1 → 114)
  registerCarryTools,                   // Task 1423e: get_macro_calendar (+1 → 115)
  registerDinhGiaTools,                 // Task 1426b: get_yield_spread_signal (+1 → 116)
  registerVpsServiceRestartTool,        // Task 1779b: restart_vps_service (+1 → 117)
  registerSmartCompactTool,             // Task 1821b: smart_compact (+1 → 118)
  registerBctcBatchSweepTool,           // Task 1841b: run_bctc_batch_sweep (+1 → 119)
  registerBacktestTools,                // Task 1842d: run_backtest (+1 → 120)
  registerBacktestQueryTools,           // Task 1844a: get_backtest_runs (#121) + get_backtest_run (#122) (+2 → 122)
  registerBacktestLifecycleTools,       // Task 1846b: delete_backtest_run (#123) + export_backtest_run_csv (#124) + compare_backtest_runs (#125) (+3 → 125)
  registerAlertVerdictTools,            // Task 1863d: write_alert_verdict (#126)
  registerInvestmentClockTools,         // Task 1880a: get_investment_clock_phase (#127)
  registerPyramidTierTool,              // Task 1880b: get_pyramid_tier (#128)
  registerComputeAccrualsTool,          // Task 1878b: compute_accruals (#129)
  registerFedLiquiditySpreadTool,       // Task 1879b: get_fed_liquidity_spread (#130)
  registerGetCashFlowTool,              // Task 1890a-A: get_cash_flow (#131)
  registerGetBctcOcfTool,               // Task 1909b: get_bctc_ocf (#132)
  registerGetIsmSubcomponentsTool,      // Task 1910a: get_ism_subcomponents (#133)
  registerGetAccuracyContextTool,       // 2026-05-17: get_accuracy_context (#134)
  registerCoordinationTools,             // Task task-lock Phase 1: task_claim (#135), task_heartbeat (#136), task_release (#137), task_list_held (#138)
  registerGetBctcPageTextTool,           // BCTC-AGENTIC-REFINE FR-3: get_bctc_page_text (#139)
  registerGetBctcPageImageTool,          // BCTC-AGENTIC-REFINE FR-4: get_bctc_page_image (#140)
  registerGetBctcRefinedTool,            // BCTC-AGENTIC-REFINE FR-11: get_bctc_refined (#141)
  registerGetBctcPendingRefineTool,      // AR-MCP-OPTY AC-1: get_bctc_pending_refine (#142)
  registerPushBctcRefinedUnitTool,       // AR-MCP-OPTY AC-2: push_bctc_refined_unit (#143)
  registerFinalizeBctcRefineTool,        // AR-MCP-OPTY AC-3: finalize_bctc_refine (#144)
  registerListFlaggedBctcCellsTool,      // HC-DEV-4: list_flagged_bctc_cells (#145)
  registerSubmitBctcCorrectionTool,      // HC-DEV-4: submit_bctc_correction (#146)
];
