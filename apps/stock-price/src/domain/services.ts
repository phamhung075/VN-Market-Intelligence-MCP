/**
 * Stock Price Domain — ResolvePriceService
 *
 * 3-tier price fallback logic:
 *   Tier 1: HOSE/VnDirect (primary, fastest)
 *   Tier 2: HNX (fallback)
 *   Tier 3: UPCOM / cache (last resort)
 *
 * All tiers race concurrently; first successful result wins.
 * If all fail, throws PriceNotAvailableError.
 */

import type { PriceQuote } from './models.js';
import type { PriceFetcherPort, PriceHistoryPort } from './repositories.js';

export class PriceNotAvailableError extends Error {
  constructor(code: string) {
    super(`Price not available for ${code}`);
    this.name = 'PriceNotAvailableError';
  }
}

export class ResolvePriceService {
  constructor(
    private readonly tier1: PriceFetcherPort,
    private readonly tier2: PriceFetcherPort,
    private readonly tier3: PriceFetcherPort,
    private readonly history: PriceHistoryPort,
  ) {}

  /** Fetch price with 3-tier concurrent fallback. First non-null result wins. */
  async fetchPrice(code: string): Promise<PriceQuote> {
    // Run all 3 tiers concurrently; collect results in order
    const results = await Promise.allSettled([
      this.tier1.fetchPrice(code),
      this.tier2.fetchPrice(code),
      this.tier3.fetchPrice(code),
    ]);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value !== null) {
        const quote = result.value;
        // Persist async (fire-and-forget)
        this.history.saveQuote(quote).catch(() => void 0);
        return quote;
      }
    }

    throw new PriceNotAvailableError(code);
  }
}
