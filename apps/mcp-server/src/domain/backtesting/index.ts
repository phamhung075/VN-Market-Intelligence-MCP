/**
 * domain/backtesting barrel — Task 1842c
 *
 * Public API for the backtesting domain module.
 */

export { VNSignalAdapter } from "./VNSignalAdapter.js";
export { normalizeSignal } from "./signalNormalizer.js";
export type { TradingSignalDirection } from "./signalNormalizer.js";
export type { RawKinhDichSignal, NormalisedSignal } from "./VNSignalAdapter.js";
