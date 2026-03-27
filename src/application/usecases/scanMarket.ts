/**
 * Market Scan Use Case — Task 103
 *
 * Orchestrates the market open/close price-scan pipeline:
 *   1. Read all watchlist stock codes from SQLite
 *   2. Fetch live prices (HOSE) — injectable for tests
 *   3. Persist fetched prices to market_prices + market_prices_history
 *   4. Compute avgVolume from history (suppress if < 5 rows)
 *   5. Run detectSignals for price_drop / price_surge / volume_spike only
 *   6. Generate and persist alerts for affected watchlist stocks
 *
 * Layer: application/usecases
 * May import from domain/ and infrastructure/ — must not contain raw HTTP calls.
 */

import { detectSignals } from "../../domain/services/signalDetector.js";
import type { MarketSnapshot } from "../../domain/services/signalDetector.js";
import { generateAlerts } from "../../domain/services/alertGenerator.js";
import { storeAlerts } from "../../infrastructure/db/alertStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import { storeMarketPrices } from "../../infrastructure/fetchers/hose.js";
import type { MarketPrice } from "../../infrastructure/fetchers/hose.js";
import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Summary returned after a scan cycle. */
export interface MarketScanResult {
  /** Number of stocks whose prices were fetched successfully */
  scanned: number;
  /** Total signal count across all scanned stocks */
  signals: number;
  /** Number of Alert records generated and persisted */
  alerts: number;
}

/** Injectable price fetcher — defaults to `fetchHosePrices` in production */
export type PriceFetcher = (codes: string[]) => Promise<MarketPrice[]>;

/** Options for `scanMarket` — all optional for easy testing */
export interface ScanMarketOptions {
  /**
   * Override the price fetcher — defaults to `fetchHosePrices`.
   * Inject a mock in tests to avoid network calls.
   */
  fetchPrices?: PriceFetcher;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** A watchlist entry with the shape expected by generateAlerts. */
interface WatchlistItem {
  actionCode: string;
}

/**
 * Read all stock codes from the watchlist table.
 * Maps `code` column → `actionCode` to match the `generateAlerts` interface.
 * Returns an empty array if the table is empty or missing.
 */
function getWatchlistEntries(): WatchlistItem[] {
  try {
    const db = getDb();
    const rows = db
      .query<{ code: string }, []>("SELECT code FROM watchlist")
      .all();
    return rows.map((r) => ({ actionCode: r.code }));
  } catch (err) {
    logger.warn("[scanMarket] failed to read watchlist", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Compute the average daily volume for a stock from its price history.
 *
 * Uses the last 20 rows (ordered by fetched_at DESC).
 * Returns 0 if fewer than 5 rows are available — this suppresses
 * `volume_spike` detection (detectSignals.ts line 176: `if (avgVolume > 0)`).
 */
function getAvgVolumeSync(code: string): number {
  const MIN_HISTORY_ROWS = 5;
  const HISTORY_LIMIT = 20;

  try {
    const db = getDb();
    const rows = db
      .query<{ volume: number }, [string, number]>(
        `SELECT volume
         FROM market_prices_history
         WHERE code = ?
         ORDER BY fetched_at DESC
         LIMIT ?`,
      )
      .all(code, HISTORY_LIMIT);

    if (rows.length < MIN_HISTORY_ROWS) {
      return 0; // sparse history → suppress volume_spike
    }

    const sum = rows.reduce((acc, r) => acc + (r.volume ?? 0), 0);
    return sum / rows.length;
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported use case
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one complete market scan cycle (open or close).
 *
 * @param options - Injectable fetcher for testing; defaults to real HOSE fetcher
 * @returns       Summary counts: scanned, signals, alerts
 */
export async function scanMarket(
  options: ScanMarketOptions = {},
): Promise<MarketScanResult> {
  const result: MarketScanResult = { scanned: 0, signals: 0, alerts: 0 };

  // ── Step 1: Read watchlist ───────────────────────────────────────────────
  const watchlistEntries = getWatchlistEntries();

  if (watchlistEntries.length === 0) {
    logger.debug("[scanMarket] watchlist is empty — nothing to scan");
    return result;
  }

  const codes = watchlistEntries.map((w) => w.actionCode);

  // ── Step 2: Fetch live prices ───────────────────────────────────────────
  let prices: MarketPrice[];

  try {
    const fetcher: PriceFetcher =
      options.fetchPrices ??
      (async (c) => {
        const { fetchHosePrices } = await import(
          "../../infrastructure/fetchers/hose.js"
        );
        return fetchHosePrices(c);
      });

    prices = await fetcher(codes);
  } catch (err) {
    logger.error("[scanMarket] price fetch failed — scan aborted", {
      error: err instanceof Error ? err.message : String(err),
    });
    return result;
  }

  if (prices.length === 0) {
    logger.warn("[scanMarket] fetcher returned 0 prices — no scan performed");
    return result;
  }

  // ── Step 3: Persist prices to history + latest snapshot ─────────────────
  try {
    await storeMarketPrices(prices);
  } catch (err) {
    logger.warn("[scanMarket] storeMarketPrices failed — signals still run", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 4–5: Build snapshots + detect signals ────────────────────────────
  const allSignals: ReturnType<typeof detectSignals> = [];

  for (const price of prices) {
    const avgVolume = getAvgVolumeSync(price.code);

    const snapshot: MarketSnapshot = {
      actionCode: price.code,
      price: price.price,
      previousPrice: price.previousPrice,
      volume: price.volume,
      avgVolume,
    };

    // Only price_drop / price_surge / volume_spike — no context (no recentNews / latestReportDate)
    const detected = detectSignals(snapshot);

    // Filter to only the three price-based signal types
    const priceSignals = detected.filter(
      (s) =>
        s.type === "price_drop" ||
        s.type === "price_surge" ||
        s.type === "volume_spike",
    );

    allSignals.push(...priceSignals);
    result.scanned++;
  }

  result.signals = allSignals.length;

  if (allSignals.length === 0) {
    logger.debug("[scanMarket] no signals detected", {
      scanned: result.scanned,
    });
    return result;
  }

  // ── Step 6: Generate and persist alerts ──────────────────────────────────
  const alerts = generateAlerts(allSignals, watchlistEntries);
  result.alerts = alerts.length;

  if (alerts.length > 0) {
    try {
      storeAlerts(alerts, getDb());
      logger.info("[scanMarket] alerts stored", {
        count: alerts.length,
        codes: alerts.map((a) => a.actionCode),
      });
    } catch (err) {
      logger.error("[scanMarket] storeAlerts failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("[scanMarket] scan complete", {
    scanned: result.scanned,
    signals: result.signals,
    alerts: result.alerts,
  });

  return result;
}
