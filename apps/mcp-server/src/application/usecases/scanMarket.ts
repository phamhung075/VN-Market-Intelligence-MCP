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
import { validatePriceNews, type PriceAction, type NewsSentiment } from "../../domain/services/financial-reports/priceNewsValidator.js";
import { classifySentiment } from "../../domain/services/sentimentClassifier.js";
import { computeConviction, type ConvictionInput } from "../../domain/services/convictionScorer.js";
import {
  getContextStocksForWatchlist,
  computeSectorAverage,
  classifyMovement,
  SECTOR_NAME_VI,
} from "../../domain/services/sectorPeers.js";
import type { DomainType } from "../../../bctc-schema";

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

/** A watchlist entry with the shape expected by generateAlerts + sector context. */
interface WatchlistItem {
  actionCode: string;
  domain: DomainType;
}

/**
 * Read all stock codes + domains from the watchlist table.
 * Returns an empty array if the table is empty or missing.
 */
function getWatchlistEntries(): WatchlistItem[] {
  try {
    const db = getDb();
    const rows = db
      .query<{ code: string; domain: string }, []>(
        "SELECT code, domain FROM watchlist",
      )
      .all();
    return rows.map((r) => ({
      actionCode: r.code,
      domain: (r.domain || "other") as DomainType,
    }));
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

  // ── Step 3: Persist watchlist prices ─────────────────────────────────────
  try {
    await storeMarketPrices(prices);
  } catch (err) {
    logger.warn("[scanMarket] storeMarketPrices failed — signals still run", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 3b: Fetch sector context prices (best-effort) ─────────────────
  const contextStocks = getContextStocksForWatchlist(watchlistEntries);
  let contextPrices: MarketPrice[] = [];

  if (contextStocks.length > 0) {
    try {
      const contextCodes = contextStocks.map((c) => c.code);
      const fetcher: PriceFetcher =
        options.fetchPrices ??
        (async (c) => {
          const { fetchHosePrices } = await import(
            "../../infrastructure/fetchers/hose.js"
          );
          return fetchHosePrices(c, undefined, { force: true });
        });
      contextPrices = await fetcher(contextCodes);

      if (contextPrices.length > 0) {
        try {
          await storeMarketPrices(contextPrices);
        } catch { /* best-effort */ }
      }

      logger.debug("[scanMarket] fetched sector context prices", {
        requested: contextCodes.length,
        received: contextPrices.length,
      });
    } catch (err) {
      logger.debug("[scanMarket] sector context fetch failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ── Build sector averages from context prices ─────────────────────────
  // Group all prices (watchlist + context) by domain
  const pricesByDomain = new Map<DomainType, { code: string; changePct: number }[]>();

  // Add watchlist stock prices to their domains
  const codeToDomain = new Map(watchlistEntries.map((w) => [w.actionCode, w.domain]));
  for (const p of prices) {
    const domain = codeToDomain.get(p.code);
    if (!domain || domain === "other") continue;
    const list = pricesByDomain.get(domain) ?? [];
    list.push({ code: p.code, changePct: p.changePct });
    pricesByDomain.set(domain, list);
  }

  // Add context stock prices to their domains
  const contextCodeToDomain = new Map(contextStocks.map((c) => [c.code, c.domain]));
  for (const p of contextPrices) {
    const domain = contextCodeToDomain.get(p.code);
    if (!domain) continue;
    const list = pricesByDomain.get(domain) ?? [];
    list.push({ code: p.code, changePct: p.changePct });
    pricesByDomain.set(domain, list);
  }

  // Compute sector averages
  const sectorAverages = new Map<DomainType, number>();
  for (const [domain, domainPrices] of pricesByDomain) {
    const avg = computeSectorAverage(domainPrices);
    if (avg !== null) sectorAverages.set(domain, avg);
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

    const detected = detectSignals(snapshot);

    // Filter to only the three price-based signal types
    const priceSignals = detected.filter(
      (s) =>
        s.type === "price_drop" ||
        s.type === "price_surge" ||
        s.type === "volume_spike",
    );

    // Enrich signal messages with sector context
    const domain = codeToDomain.get(price.code);
    if (domain && domain !== "other") {
      const sectorAvg = sectorAverages.get(domain) ?? null;
      const movement = classifyMovement(price.changePct, sectorAvg);
      const sectorName = SECTOR_NAME_VI[domain] ?? domain;

      for (const sig of priceSignals) {
        if (sig.type === "price_drop" || sig.type === "price_surge") {
          const sectorInfo = sectorAvg !== null
            ? `Ngành ${sectorName}: ${sectorAvg >= 0 ? "+" : ""}${sectorAvg}% TB`
            : "";
          const movementTag = movement === "sector_wide"
            ? " (toàn ngành)"
            : movement === "stock_specific"
              ? " (riêng lẻ)"
              : "";
          sig.message = `${sig.message}${movementTag}${sectorInfo ? ` | ${sectorInfo}` : ""}`;
        }
      }
    }

    allSignals.push(...priceSignals);
    result.scanned++;
  }

  // ── Step 5a: Sector-wide decline detection ─────────────────────────────
  // When ≥3 stocks in the same sector all decline, emit a sector_decline signal
  // for each watchlist stock in that sector.
  const SECTOR_DECLINE_MIN_STOCKS = 3;
  const SECTOR_DECLINE_THRESHOLD = -0.5; // each stock must be down at least 0.5%

  for (const [domain, domainPrices] of pricesByDomain) {
    const declining = domainPrices.filter((p) => p.changePct <= SECTOR_DECLINE_THRESHOLD);
    if (declining.length < SECTOR_DECLINE_MIN_STOCKS) continue;

    const sectorName = SECTOR_NAME_VI[domain] ?? domain;
    const avgDrop = declining.reduce((sum, p) => sum + p.changePct, 0) / declining.length;
    const allDecliners = declining
      .sort((a, b) => a.changePct - b.changePct)
      .map((p) => `${p.code} ${p.changePct >= 0 ? "+" : ""}${p.changePct.toFixed(2)}%`)
      .join(", ");

    // Emit a signal for each watchlist stock in this declining sector
    for (const price of prices) {
      const stockDomain = codeToDomain.get(price.code);
      if (stockDomain !== domain) continue;

      allSignals.push({
        type: "price_drop",
        severity: avgDrop <= -1.5 ? "high" : "medium",
        actionCode: price.code,
        message: `⚠️ Ngành ${sectorName} giảm đồng loạt (${declining.length} mã, TB ${avgDrop.toFixed(2)}%): ${allDecliners}`,
        confidence: Math.min(0.9, declining.length / 5),
        detectedAt: new Date().toISOString(),
      });
    }

    logger.info("[scanMarket] sector-wide decline detected", {
      domain,
      decliningCount: declining.length,
      avgDrop: avgDrop.toFixed(2),
    });
  }

  // ── Step 5b: Price-news divergence validation ──────────────────────────
  // Cross-validate news sentiment against actual price action.
  // "Tin tức có thể giả nhưng giá phản ánh tất cả"
  try {
    const db = getDb();
    for (const price of prices) {
      // Get recent news sentiment for this stock from rag_analyses
      let recentTitles: { source_title: string }[] = [];
      try {
        recentTitles = db
          .query<{ source_title: string }, [string]>(
            `SELECT source_title FROM rag_analyses
             WHERE affected_actions LIKE '%' || ? || '%'
               AND created_at > datetime('now', '-4 hours')
             ORDER BY created_at DESC LIMIT 10`,
          )
          .all(price.code);
      } catch { /* table may not exist yet */ }

      if (recentTitles.length === 0) {
        // Check volume anomaly without news
        const avgVol = getAvgVolumeSync(price.code);
        const priceAction: PriceAction = {
          code: price.code,
          changePct: price.changePct,
          volume: price.volume,
          avgVolume: avgVol,
        };
        const validation = validatePriceNews(priceAction, null);
        if (validation.severity === "alert" && validation.insight) {
          // Add as a signal
          allSignals.push({
            type: "volume_spike",
            severity: "high",
            actionCode: price.code,
            message: validation.insight,
            confidence: 0.70,
            detectedAt: new Date().toISOString(),
          });
        }
        continue;
      }

      // Aggregate sentiment from recent titles
      const allText = recentTitles.map((r) => r.source_title).join(". ");
      const sentiment = classifySentiment(allText);

      const priceAction: PriceAction = {
        code: price.code,
        changePct: price.changePct,
        volume: price.volume,
        avgVolume: getAvgVolumeSync(price.code),
      };
      const newsSentiment: NewsSentiment = {
        code: price.code,
        direction: sentiment.direction,
        confidence: sentiment.confidence,
        articleCount: recentTitles.length,
      };

      const validation = validatePriceNews(priceAction, newsSentiment);
      if (validation.severity !== "info" && validation.insight) {
        // Enrich existing signals for this stock with the divergence insight
        for (const sig of allSignals) {
          if (sig.actionCode === price.code) {
            sig.message += ` | ${validation.insight}`;
          }
        }
        logger.info("[scanMarket] price-news divergence detected", {
          code: price.code,
          divergence: validation.divergence,
        });
      }
    }
  } catch (err) {
    logger.debug("[scanMarket] price-news validation failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── Step 5c: Signal Price Validation — enrich signals with confidence_score ──
  // For each price-based signal (price_drop, price_surge, volume_spike),
  // enrich with confidence_score (0–100, derived from signal.confidence * 100)
  // and validated_at timestamp.
  // Filter out signals with confidence_score < 60 to prevent unreliable alerts.
  const validatedSignals: typeof allSignals = [];
  const CONFIDENCE_THRESHOLD = 60; // Min confidence (0–100) to pass to generateAlerts

  for (const signal of allSignals) {
    // Calculate confidence_score from signal's confidence (0..1 → 0..100)
    const confidence_score = Math.round(signal.confidence * 100);
    const validated_at = new Date().toISOString();

    // Enrich signal with validation fields
    signal.confidence_score = confidence_score;
    signal.validated_at = validated_at;

    // Filter: only include signals with confidence_score >= threshold
    if (confidence_score >= CONFIDENCE_THRESHOLD) {
      validatedSignals.push(signal);
      logger.debug("[scanMarket] signal passed validation", {
        actionCode: signal.actionCode,
        signalType: signal.type,
        confidence_score,
      });
    } else {
      logger.debug("[scanMarket] signal filtered: low confidence", {
        actionCode: signal.actionCode,
        signalType: signal.type,
        confidence_score,
        threshold: CONFIDENCE_THRESHOLD,
      });
    }
  }

  // Replace allSignals with validated signals
  allSignals.length = 0;
  allSignals.push(...validatedSignals);

  result.signals = allSignals.length;

  if (allSignals.length === 0) {
    logger.debug("[scanMarket] no signals detected", {
      scanned: result.scanned,
      sectorContextFetched: contextPrices.length,
    });
    return result;
  }

  // ── Step 5c: Conviction scoring — cross-validate all signals per stock ───
  for (const price of prices) {
    const domain = codeToDomain.get(price.code);
    const sectorAvg = domain && domain !== "other" ? sectorAverages.get(domain) ?? undefined : undefined;

    const avgVol = getAvgVolumeSync(price.code);
    const convictionInput: ConvictionInput = {
      code: price.code,
      changePct: price.changePct,
      volume: price.volume,
    };
    if (avgVol > 0) convictionInput.avgVolume = avgVol;
    if (sectorAvg != null) convictionInput.sectorAvgPct = sectorAvg;

    // Enrich conviction with sentiment from recent news about this stock
    try {
      const db = getDb();
      const recentTitles = db
        .query<{ source_title: string }, [string]>(
          `SELECT source_title FROM rag_analyses
           WHERE affected_actions LIKE '%' || ? || '%'
             AND created_at > datetime('now', '-4 hours')
           LIMIT 5`,
        )
        .all(price.code);
      if (recentTitles.length > 0) {
        const allText = recentTitles.map((r) => r.source_title).join(". ");
        const sent = classifySentiment(allText);
        convictionInput.sentimentDirection = sent.direction;
        convictionInput.sentimentConfidence = sent.confidence;
      }
    } catch { /* best-effort */ }

    const conviction = computeConviction(convictionInput);

    // Append conviction summary to relevant signals
    if (conviction.level !== "moderate" && conviction.summary) {
      for (const sig of allSignals) {
        if (sig.actionCode === price.code) {
          sig.message += ` | ${conviction.summary}`;
        }
      }
    }

    // Store conviction history (task 150)
    try {
      const db = getDb();
      const vnNow = new Date(Date.now() + 7 * 3600_000);
      const dateStr = `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, "0")}-${String(vnNow.getUTCDate()).padStart(2, "0")}`;
      db.prepare(`INSERT OR REPLACE INTO conviction_history (symbol, date, peak_score, dominant_signal, created_at)
        VALUES (?, ?, ?, ?, ?)`).run(price.code, dateStr, conviction.score, conviction.direction, new Date().toISOString());
    } catch { /* conviction_history table may not exist */ }
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
    sectorContextFetched: contextPrices.length,
  });

  return result;
}
