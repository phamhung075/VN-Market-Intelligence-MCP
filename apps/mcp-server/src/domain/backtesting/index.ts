/**
 * domain/backtesting barrel — Task 1842d (extended from 1842c)
 *
 * Public API for the backtesting domain module.
 */

export { VNSignalAdapter } from "./VNSignalAdapter.js";
export { normalizeSignal } from "./signalNormalizer.js";
export type { TradingSignalDirection } from "./signalNormalizer.js";
export type { RawKinhDichSignal, NormalisedSignal } from "./VNSignalAdapter.js";

// Models
export type { BacktestParams, TradeRecord, TradeLog, BacktestReport } from "./models.js";

// Strategy registry
export { strategyRegistry, BacktestStrategyNotFoundError } from "./strategyRegistry.js";
export type { StrategyDefinition, RawSignalRow } from "./strategyRegistry.js";

// Engine
export { runBacktestEngine } from "./backtestEngine.js";
export type { BacktestEngineInput } from "./backtestEngine.js";
