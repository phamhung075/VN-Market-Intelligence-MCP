export { fetchAndStoreMacroIndicators, type FetchResult } from "./macroIndicatorFetcher.js";
export {
  computeCarryTradeSignal,
  type CarryTradeSignal,
  type CarryTradeRegime,
} from "./carryTradeSignal.js";
export {
  computeMarketEarningYield,
  type TickerPE,
  type MarketEarningYieldResult,
  type MarketEarningYieldRefused,
} from "./marketEarningYield.js";
// Task 1880a: Investment Clock phase classifier
export {
  classifyInvestmentClockPhase,
  type InvestmentClockPhase,
  type InvestmentClockResult,
} from "./investmentClock.js";
