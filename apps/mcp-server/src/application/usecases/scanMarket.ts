/**
 * Market Scan Use Case — Task 103
 *
 * Orchestrates the market open/close price-scan pipeline:
 *   1. Read all watchlist stock codes from SQLite (via injected repo)
 *   2. Fetch live prices (HOSE) — injectable for tests
 *   3. Persist fetched prices to market_prices + market_prices_history
 *   4. Compute avgVolume from history (suppress if < 5 rows)
 *   5. Run detectSignals for price_drop / price_surge / volume_spike only
 *   6. Generate and persist alerts for affected watchlist stocks
 *
 * Task 1838b: migrated to ScanMarketDeps injection pattern.
 *
 * Layer: application/usecases
 * May import from domain/ and infrastructure/ — must not contain raw HTTP calls.
 */

import { detectSignals } from "../../domain/services/signalDetector.js";
import { VN_OFFSET_MS } from "../../domain/services/timeConstants.js";
import type { MarketSnapshot, SignalContext } from "../../domain/services/signalDetector.js";
import { generateAlerts } from "../../domain/services/alertGenerator.js";
import { storeAlerts } from "../../infrastructure/db/alertStore.js";
import { storeMarketPrices } from "../../infrastructure/fetchers/hose.js";
import type { MarketPrice } from "../../infrastructure/fetchers/hose.js";
import { logger } from "../../infrastructure/logger.js";
import { validatePriceNews, type PriceAction, type NewsSentiment } from "../../domain/services/financial-reports/priceNewsValidator.js";
import { classifySentiment } from "../../domain/services/sentimentClassifier.js";
import { computeConviction, type ConvictionInput } from "../../domain/services/convictionScorer.js";
import { getImfMacroScoreForConviction } from "../services/imfConvictionBridge.js";
import {
  getContextStocksForWatchlist,
  computeSectorAverage,
  classifyMovement,
  SECTOR_NAME_VI,
} from "../../domain/services/sectorPeers.js";
import type { DomainType } from "../../../bctc-schema";
import { getDb } from "../../infrastructure/db/schema.js";
import type {
  IWatchlistRepository,
  IMarketPriceRepository,
} from "../../domain/repositories/index.js";
import { failLoud } from "../../domain/utils/safeQuery.js";

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

/**
 * Dependencies for `scanMarket`.
 * Pass real adapters in production, mocks in tests.
 */
export interface ScanMarketDeps {
  watchlistRepo: IWatchlistRepository;
  marketPriceRepo: IMarketPriceRepository;
  /**
   * Override the price fetcher — defaults to `fetchHosePrices`.
   * Inject a mock in tests to avoid network calls.
   */
  fetchPrices?: PriceFetcher;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the average daily volume for a stock from its price history.
 *
 * Task 1320: excludes today's open session from the rolling average.
 * Backward-compat export for tests that call this function directly.
 *
 * FIX-ERRAUDIT-W2-MCP-DATALAYER: returns null instead of 0 on DB error or
 * insufficient history. 0 is a valid db value (genuinely 0 volume) but collides
 * with the error path. Callers must check for null and DROP the volume dimension
 * rather than feeding avgVolume=0 to detectSignals (which triggers false volume_spike).
 *
 * @param code      - Stock ticker code
 * @param todayUtc  - ISO date string "YYYY-MM-DD" to exclude (default: today UTC).
 * @returns average volume (number), or null if insufficient history or DB error
 */
export function getAvgVolumeSync(code: string, todayUtc?: string): number | null {
  const MIN_HISTORY_ROWS = 5;
  const HISTORY_LIMIT = 20;
  const today = todayUtc ?? new Date().toISOString().substring(0, 10);

  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
  } catch (err) {
    failLoud(err, `scanMarket.getAvgVolumeSync[${code}].getDb`);
    return null;
  }

  try {
    const countRow = db
      .query<{ cnt: number }, [string, string]>(
        `SELECT COUNT(DISTINCT substr(fetched_at, 1, 10)) as cnt
         FROM market_prices_history
         WHERE code = ? AND substr(fetched_at, 1, 10) < ?`,
      )
      .get(code, today);

    if (!countRow || countRow.cnt < MIN_HISTORY_ROWS) {
      // Legit insufficient-history path: return null (drop-dimension), not 0.
      // A genuine 0-volume stock cannot be distinguished from missing history at 0.
      return null;
    }

    const row = db
      .query<{ avg_vol: number | null }, [string, string, number]>(
        `SELECT AVG(day_vol) as avg_vol FROM (
           SELECT MAX(volume) as day_vol
           FROM market_prices_history
           WHERE code = ? AND substr(fetched_at, 1, 10) < ?
           GROUP BY substr(fetched_at, 1, 10)
           ORDER BY substr(fetched_at, 1, 10) DESC
           LIMIT ?
         )`,
      )
      .get(code, today, HISTORY_LIMIT);

    // avg_vol can be null if the sub-query returns no rows (impossible given cnt check above)
    return row?.avg_vol ?? null;
  } catch (err) {
    failLoud(err, `scanMarket.getAvgVolumeSync[${code}]`);
    return null;
  }
}

/** A watchlist entry with the shape expected by generateAlerts + sector context. */
interface WatchlistItem {
  actionCode: string;
  domain: DomainType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main exported use case
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run one complete market scan cycle (open or close).
 *
 * @param deps - Repository dependencies + optional price fetcher
 * @returns    Summary counts: scanned, signals, alerts
 */
export async function scanMarket(
  deps: ScanMarketDeps,
): Promise<MarketScanResult> {
  const result: MarketScanResult = { scanned: 0, signals: 0, alerts: 0 };

  // ── Step 1: Read watchlist ───────────────────────────────────────────────
  let watchlistEntries: WatchlistItem[];
  try {
    const rows = deps.watchlistRepo.getAll();
    watchlistEntries = rows.map((r) => ({
      actionCode: r.code,
      domain: (r.domain || "other") as DomainType,
    }));
  } catch (err) {
    logger.warn("[scanMarket] failed to read watchlist", {
      error: err instanceof Error ? err.message : String(err),
    });
    watchlistEntries = [];
  }

  if (watchlistEntries.length === 0) {
    logger.debug("[scanMarket] watchlist is empty — nothing to scan");
    return result;
  }

  const codes = watchlistEntries.map((w) => w.actionCode);

  // ── Step 1b: Load per-stock thresholds from watchlist table ─────────────
  // Returns a Map<code, {dropPct, risePct}> for stocks that have explicit
  // alert_drop_pct / alert_rise_pct columns set. Stocks not in the map fall
  // back to DEFAULT_DROP_PCT inside detectSignals.
  let watchlistThresholds: Map<string, { dropPct: number; risePct: number }>;
  try {
    watchlistThresholds = deps.watchlistRepo.getThresholds();
  } catch (err) {
    // FIX-ERRAUDIT-W2-MCP-DATALAYER: log via failLoud (was bare catch → silently empty Map)
    failLoud(err, "scanMarket.getThresholds");
    watchlistThresholds = new Map();
  }

  // ── Step 2: Fetch live prices ───────────────────────────────────────────
  let prices: MarketPrice[];

  try {
    const fetcher: PriceFetcher =
      deps.fetchPrices ??
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
        deps.fetchPrices ??
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
  const today = new Date().toISOString().substring(0, 10);

  for (const price of prices) {
    const avgVolume = deps.marketPriceRepo.getAvgVolume(price.code, today, 20, 5);

    const snapshot: MarketSnapshot = {
      actionCode: price.code,
      price: price.price,
      previousPrice: price.previousPrice,
      volume: price.volume,
      avgVolume,
    };

    // Build per-stock SignalContext: inject watchlist thresholds when present.
    // If no explicit threshold row exists for this code, context has no
    // watchlistThresholds field → detectSignals falls back to DEFAULT_DROP_PCT.
    const stockThresholds = watchlistThresholds.get(price.code);
    const signalContext: SignalContext | undefined = stockThresholds
      ? {
          watchlistThresholds: {
            dropPct: stockThresholds.dropPct,
            risePct: stockThresholds.risePct,
            impactScore: 0, // impact_score override not used for price signals
          },
        }
      : undefined;

    const detected = detectSignals(snapshot, signalContext);

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
    for (const price of prices) {
      // Get recent news sentiment for this stock from rag_analyses
      const recentNews = deps.marketPriceRepo.getRecentNewsTitles(price.code, 4, 10);

      if (recentNews.length === 0) {
        // Check volume anomaly without news
        const avgVol = deps.marketPriceRepo.getAvgVolume(price.code, today, 20, 5);
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
      const allText = recentNews.map((r) => r.sourceTitle).join(". ");
      const sentiment = classifySentiment(allText);

      const priceAction: PriceAction = {
        code: price.code,
        changePct: price.changePct,
        volume: price.volume,
        avgVolume: deps.marketPriceRepo.getAvgVolume(price.code, today, 20, 5),
      };
      const newsSentiment: NewsSentiment = {
        code: price.code,
        direction: sentiment.direction,
        confidence: sentiment.confidence,
        articleCount: recentNews.length,
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
  // Dimension 7: IMF macro — hoist outside loop (same value for all stocks per scan cycle)
  let imfMacroScore: number | undefined;
  try {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    imfMacroScore = getImfMacroScoreForConviction(getDb());
  } catch { /* best-effort — neutral if bridge fails */ }

  for (const price of prices) {
    const domain = codeToDomain.get(price.code);
    const sectorAvg = domain && domain !== "other" ? sectorAverages.get(domain) ?? undefined : undefined;

    const avgVol = deps.marketPriceRepo.getAvgVolume(price.code, today, 20, 5);
    const convictionInput: ConvictionInput = {
      code: price.code,
      changePct: price.changePct,
      volume: price.volume,
    };
    if (avgVol > 0) convictionInput.avgVolume = avgVol;
    if (sectorAvg != null) convictionInput.sectorAvgPct = sectorAvg;

    // Enrich conviction with sentiment from recent news about this stock
    try {
      const recentNews = deps.marketPriceRepo.getRecentNewsTitles(price.code, 4, 5);
      if (recentNews.length > 0) {
        const allText = recentNews.map((r) => r.sourceTitle).join(". ");
        const sent = classifySentiment(allText);
        convictionInput.sentimentDirection = sent.direction;
        convictionInput.sentimentConfidence = sent.confidence;
      }
    } catch { /* best-effort */ }

    if (imfMacroScore !== undefined) {
      convictionInput.imfMacroScore = imfMacroScore;
    }

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
      const vnNow = new Date(Date.now() + VN_OFFSET_MS);
      const dateStr = `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, "0")}-${String(vnNow.getUTCDate()).padStart(2, "0")}`;
      deps.marketPriceRepo.upsertConvictionHistory({
        symbol: price.code,
        date: dateStr,
        peakScore: conviction.score,
        dominantSignal: conviction.direction,
        createdAt: new Date().toISOString(),
      });
    } catch { /* conviction_history table may not exist */ }
  }

  // ── Step 6: Generate and persist alerts ──────────────────────────────────
  const alerts = generateAlerts(allSignals, watchlistEntries);
  result.alerts = alerts.length;

  if (alerts.length > 0) {
    try {
      const { getDb } = await import("../../infrastructure/db/schema.js");
      storeAlerts(alerts, getDb());
      logger.info("[scanMarket] alerts stored", {
        count: alerts.length,
        codes: alerts.map((a) => a.actionCode),
      });
      for (const a of alerts) {
        logger.info(`[scanMarket] alert_written ticker=${a.actionCode} type=${a.signals[0]?.type ?? "unknown"} severity=${a.severity} notified_telegram=0 — emission_bridge_to_agent_signals=MISSING (1876a/B1 pending)`);
      }
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
