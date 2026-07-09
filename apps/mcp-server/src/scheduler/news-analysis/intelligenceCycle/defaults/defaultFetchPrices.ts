/**
 * Intelligence Cycle — Step C default production impl: fetchHosePrices (+ UPCOM)
 *
 * FACTORY-SCHEDULER-split-intelligenceCycleJob: extracted verbatim from
 * intelligenceCycleJob.ts. Injected via
 * `deps.fetchPricesFn ?? (() => defaultFetchPrices(watchlistCodes))` in the
 * orchestrator's `_runCycle`.
 */

export async function defaultFetchPrices(codes: string[]): Promise<number> {
  if (codes.length === 0) return 0;

  // Classify stocks by exchange from watchlist domain
  const { getDb } = await import("../../../../infrastructure/db/schema.js");
  const db = getDb();
  let upcomCodes: string[] = [];
  let hoseCodes: string[] = [];
  try {
    const rows = db.prepare("SELECT code, exchange FROM watchlist").all() as Array<{ code: string; exchange: string }>;
    for (const r of rows) {
      if (r.exchange === "UPCOM") upcomCodes.push(r.code);
      else hoseCodes.push(r.code);
    }
  } catch {
    hoseCodes = codes; // fallback: treat all as HOSE
  }

  let total = 0;

  // Fetch HOSE stocks (VnDirect → CafeF fallback)
  if (hoseCodes.length > 0) {
    const { fetchHosePrices } = await import("../../../../infrastructure/fetchers/hose.js");
    const prices = await fetchHosePrices(hoseCodes);
    if (prices.length > 0) {
      const { storeMarketPrices } = await import("../../../../infrastructure/fetchers/hose.js");
      await storeMarketPrices(prices);
    }
    total += prices.length;
  }

  // Fetch UPCOM stocks (VnDirect stock_prices fallback)
  if (upcomCodes.length > 0) {
    const { fetchUpcomPrices } = await import("../../../../infrastructure/fetchers/hnx.js");
    const { storeMarketPrices } = await import("../../../../infrastructure/fetchers/hose.js");
    const prices = await fetchUpcomPrices(upcomCodes);
    if (prices.length > 0) await storeMarketPrices(prices);
    total += prices.length;
  }

  return total;
}
