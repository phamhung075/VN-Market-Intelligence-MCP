/**
 * pushPricesSignals.ts
 * Task 1526b — market-hours guard for signal detection in push-prices handler.
 *
 * Extracted so tests can mock dependencies and verify the guard without
 * spinning up the full HTTP server.
 */

import { detectSignals, type Signal } from "../../domain/services/signalDetector.js";
import { isVnMarketHoursUtc } from "../../scheduler/vpsProxyWatchdogJob.js";

/** Minimal shape of a VPS price payload item */
export interface VpsPriceItem {
  code?: string;
  price?: number | null;
  volume?: number | null;
  type?: string;
  ref_price?: string;
  change_pct?: string;
}

/**
 * Run signal detection for the given prices, guarded by VN market hours.
 *
 * - Outside market hours (weekends / off-hours UTC): no-op, returns [].
 * - Inside market hours: detects signals for stock-type items.
 *
 * @param prices           Raw price payload from VPS proxy
 * @param now              Override current time (for testing). Defaults to new Date().
 * @param detectSignalsFn  Optional DI override for detectSignals (used in tests to avoid mock.module).
 * @returns                Detected signals (empty array when guard blocks)
 */
export async function runSignalDetectionGuard(
  prices: VpsPriceItem[],
  now?: Date,
  detectSignalsFn?: typeof detectSignals,
): Promise<Signal[]> {
  if (!isVnMarketHoursUtc(now ?? new Date())) {
    return [];
  }

  const signals: Signal[] = [];

  for (const p of prices) {
    if (!p.code || p.price == null) continue;
    const isStock = !p.type || p.type === "stock";
    if (!isStock) continue;

    const priceVnd = p.price * 1000;

    const refP = p.ref_price ? parseFloat(p.ref_price) : 0;
    let previousPrice: number;
    if (refP > 0) {
      previousPrice = refP * 1000;
    } else {
      const pctFallback = p.change_pct ? parseFloat(p.change_pct) : 0;
      previousPrice = pctFallback !== 0 ? priceVnd / (1 + pctFallback / 100) : priceVnd;
    }

    const fn = detectSignalsFn ?? detectSignals;
    const stockSignals = fn({
      actionCode: p.code,
      price: priceVnd,
      previousPrice,
      volume: p.volume ?? 0,
      avgVolume: 0,
    });

    if (stockSignals.length > 0) {
      signals.push(...stockSignals);
    }
  }

  return signals;
}
