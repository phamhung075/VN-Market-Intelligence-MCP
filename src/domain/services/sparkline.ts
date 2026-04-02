/**
 * ASCII Sparkline Generator — Task 181 (Domain Layer)
 *
 * Pure function that converts a price series into a compact visual
 * representation using Unicode block characters.
 *
 * DDD: this is pure domain logic — no imports from infrastructure/.
 */

/** The 8-level block character palette (▁ = lowest, █ = highest). */
const BARS = "▁▂▃▄▅▆▇█";

/**
 * Generates a fixed-width ASCII sparkline from an ordered price series.
 *
 * The function:
 *  1. Returns "—" if fewer than 2 prices are supplied or width < 1.
 *  2. Resamples the input prices to exactly `width` points using linear
 *     interpolation (nearest-sample), so the output is always `width` chars.
 *  3. Maps each resampled value linearly onto the range [0, 7] (8 discrete
 *     levels) using the observed min/max of the full input series.
 *  4. When min === max (flat line) every character is ▁.
 *
 * @param prices - Price series, oldest first, in any unit (VND, USD…).
 * @param width  - Desired sparkline length in characters. Defaults to 5.
 * @returns      - `width`-character sparkline string, or "—" for trivial input.
 *
 * @example
 *   generateSparkline([80000, 82000, 81000, 85000, 84000])
 *   // → "▂▄▃█▆"
 */
export function generateSparkline(prices: number[], width = 5): string {
  if (prices.length < 2 || width < 1) return "—";

  const min = Math.min(...prices);
  const max = Math.max(...prices);

  /**
   * Map a single price to a bar-character index in [0, 7].
   * When min === max (flat line), all values map to index 0 (▁).
   */
  function toBarIndex(price: number): number {
    if (max === min) return 0;
    // Clamp to [0, 7]
    return Math.min(7, Math.floor(((price - min) / (max - min)) * 8));
  }

  /**
   * Resample the price array to `width` points using nearest-sample
   * interpolation (picks the closest source price for each output slot).
   */
  function resample(): number[] {
    if (prices.length === width) return prices.slice();
    const result: number[] = [];
    for (let i = 0; i < width; i++) {
      // Map output index i → source index (float), then round to nearest
      const srcIdx = (i / (width - 1)) * (prices.length - 1);
      result.push(prices[Math.round(srcIdx)]!);
    }
    return result;
  }

  const sampled = width === 1
    // For width=1, always use the last (most recent) price
    ? [prices[prices.length - 1]!]
    : resample();

  return sampled.map((p) => BARS[toBarIndex(p)]!).join("");
}
