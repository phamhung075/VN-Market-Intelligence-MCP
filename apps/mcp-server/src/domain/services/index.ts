/**
 * Domain Services — barrel export — Sprint 210
 *
 * Exposes public API for all domain services.
 * Pure business logic — no I/O, no infrastructure imports.
 *
 * Note on type collisions: several service files share type names (ValidationResult,
 * PricePoint, WatchlistEntry, ImpactDirection, Severity). These are domain-local types
 * intentionally defined per-file. Import directly from the specific file when you need
 * the type. This barrel exports functions only for colliding-type files.
 *
 * @module domain/services
 */

// --- Alert services ---
export * from "./alertCooldown.js";
export * from "./alertDedup.js";
export * from "./alertGenerator.js";
export * from "./alertGrouper.js";
export * from "./alertMuteChecker.js";
export * from "./alertPolicyChecker.js";
// alertOutcomeScorer: PricePoint collides with volatilityCalculator — export functions + non-colliding types only
export {
  classifyAlertType,
  scoreAlertOutcome,
} from "./alertOutcomeScorer.js";
export type {
  AlertOutcome,
  AlertClass,
  AlertClassification,
  OutcomeResult,
} from "./alertOutcomeScorer.js";

// --- Financial extractors ---
export * from "./financial-reports/balanceSheetExtractor.js";
export * from "./financial-reports/cashFlowExtractor.js";
export * from "./financial-reports/incomeStatementExtractor.js";
export * from "./financial-reports/ratioComputer.js";
export * from "./financial-reports/periodDeltaComputer.js";
// bctcValidator: ValidationResult collides with priceNewsValidator — export function only
export { validateFinancialReport } from "./financial-reports/bctcValidator.js";
// priceNewsValidator: ValidationResult collides — export functions only
export { validatePriceNews, extractHistoricalParallels, detectSensitiveDates } from "./financial-reports/priceNewsValidator.js";

// --- Market analysis ---
export * from "./signalDetector.js";
export * from "./cascadeEngine.js";
export * from "./chainSynthesizer.js";
export * from "./intradayAnalyzer.js";
export * from "./orderBookAnalyzer.js";
export * from "./priceAlertChecker.js";
export * from "./convictionScorer.js";
export * from "./decisionNoteSynthesizer.js";
export * from "./signalClassWeighter.js";
// volatilityCalculator: PricePoint collides with performanceAttribution — export functions only
export { computeStockVolatility } from "./volatilityCalculator.js";
// performanceAttribution: PricePoint collides — export functions only
export { computeAttribution } from "./performanceAttribution.js";

// --- Sector & correlation ---
export * from "./correlationCalculator.js";
export * from "./sectorPeers.js";
export * from "./sectorRotationDetector.js";
export * from "./sectorValuationComparator.js";

// --- Macro & prediction ---
export * from "./macroIndicatorScorer.js";
export * from "./macroOutlierGuard.js";
export * from "./macroThresholds.js";
export * from "./predictionCascadeMapper.js";
export * from "./predictionSignalDetector.js";
export * from "./forecastConfidenceScore.js";
export * from "./baseRateComputer.js";

// --- News & sentiment ---
export * from "./newsNormalizer.js";
export * from "./sentimentClassifier.js";
export * from "./sentimentTrend.js";
export * from "./recencyWeighter.js";
export * from "./vnRelevanceFilter.js";
export * from "./embeddingTextBuilder.js";

// --- Portfolio & performance ---
export * from "./portfolioPnlCalculator.js";
export * from "./portfolioRiskCalculator.js";
export * from "./rebalancingCalculator.js";
export * from "./stopLossComputer.js";

// --- Price backfill service (Task 240) ---
export * from "./priceBackfillService.js";

// --- Thematic analysis ---
export * from "./bondMaturityTracker.js";
export * from "./catalystCalendar.js";
export * from "./customAlertEvaluator.js";
export * from "./financial-reports/earningsCalendar.js";
export * from "./reputationScorer.js";
export * from "./sourceHealthTracker.js";
export * from "./stockAliases.js";
export * from "./stockSearch.js";
export * from "./tradeRelationships.js";

// Severity/ImpactDirection/WatchlistEntry collisions in thematic files — export functions only
export { getSeasonalContext, mapClimateImpact } from "./climateImpactMapper.js";
export { analyzeCreditFlow } from "./creditFlowAnalyzer.js";
export { CRISIS_COOLDOWN_MINUTES, detectCrisisPatterns } from "./crisisPatternDetector.js";
export { analyzeEnergyMarket } from "./energyMarketAnalyzer.js";
export { analyzeForeignFlow } from "./foreignFlowAnalyzer.js";
export { classifyInsiderTransaction, detectMassInsiderBuy } from "./leadershipSignal.js";
export { detectLegalRisk } from "./legalRiskDetector.js";
export { classifyPharmaEvent } from "./pharmaEventMapper.js";
export { classifyPolicy } from "./policyImpactMapper.js";
export { analyzeSupplyChainImpact } from "./supplyChainAnalyzer.js";
export { detectSupplyChainEvent } from "./supplyChainEventDetector.js";

// --- Infrastructure utilities (domain-safe) ---
export * from "./rateLimiter.js";
export * from "./sparkline.js";
export * from "./timeConstants.js";
export * from "./tradingWindow.js";
export * from "./vnNumberParser.js";

// --- VPS & System Health (Task 234) ---
// vpsHealthPoller: exports can use * (no collisions)
export * from "./vpsHealthPoller.js";
// freshnessSlaChecker: SignalType collides with signalDetector — export functions only
export {
  checkDataFreshnessSla,
  checkSignalSla,
  classifySeverity,
  isVnMarketHours,
  isVnTradingDay,
  getSlaThreshold,
  DEFAULT_SLA_CONFIG,
} from "./freshnessSlaChecker.js";

// --- Kinh Dich sub-module ---
export * from "./kinhDich/index.js";
