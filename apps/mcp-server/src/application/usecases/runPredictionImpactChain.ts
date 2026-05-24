/**
 * Run Prediction Impact Chain — Task 173 (Application Layer)
 *
 * Wires prediction market signals into the standard causal cascade pipeline.
 *
 * For each HIGH or CRITICAL PredictionSignal:
 *   1. Convert signal → AnalysisEntry (via buildPredictionEntry)
 *   2. Call buildCausalChain() with the entry + watchlist
 *   3. Return the resulting CausalChain[]
 *
 * The caller (predictionMarketJob) is responsible for storing the resulting
 * watchlistImpacts and forwarding HIGH/CRITICAL impacts to alertGenerator.
 *
 * Design notes:
 *  - Only HIGH and CRITICAL signals are forwarded to the cascade engine.
 *    LOW and MEDIUM signals are silently skipped.
 *  - buildPredictionEntry() is exported for unit testing.
 *  - RAG retriever is injectable for testing (no real I/O in tests).
 *  - The sentiment is derived from yesPriceCurr:
 *      yesPrice >= 0.6 → bearish  (bad event is likely)
 *      yesPrice <= 0.4 → bullish  (bad event is unlikely)
 *      otherwise       → neutral
 *  - The impactScore is scaled by confidence × 10, clamped 1–10.
 *  - affectedDomains and affectedActions are populated via mapPredictionToVn()
 *    from predictionCascadeMapper.
 *
 * Layer: application/usecases
 */

import { buildCausalChain } from "../../domain/services/cascadeEngine.js";
import { TelegramMessageFactory } from "../../infrastructure/notifiers/telegramMessageFactory.js";
import type { WatchlistEntry, CausalChain, SearchResult } from "../../domain/services/cascadeEngine.js";
import { mapPredictionToVn } from "../../domain/services/predictionCascadeMapper.js";
import type { PredictionSignal } from "../../domain/services/predictionSignalDetector.js";
import type { AnalysisEntry } from "../../domain/services/newsNormalizer.js";
import { logger } from "../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Injectable RAG retriever (same shape as in runImpactChain.ts).
 */
export type RagRetriever = (
  query: string,
  options?: { k?: number },
) => Promise<SearchResult[]>;

export interface RunPredictionImpactChainInput {
  /** Prediction signals to process (only HIGH/CRITICAL will be forwarded). */
  signals: PredictionSignal[];
  /** User's watchlist stocks. */
  watchlist: WatchlistEntry[];
  /**
   * Optional RAG retriever override.
   * Defaults to real searchContext from infrastructure. Pass a mock in tests.
   */
  ragRetriever?: RagRetriever;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: buildPredictionEntry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert a PredictionSignal into an AnalysisEntry for use with buildCausalChain.
 *
 * Sentiment derivation:
 *   yesPrice >= 0.6 → "bearish"  (bad event is likely → negative market impact)
 *   yesPrice <= 0.4 → "bullish"  (bad event is unlikely → positive market impact)
 *   otherwise       → "neutral"
 *
 * @param signal - The prediction market signal to convert
 * @returns      - AnalysisEntry ready for buildCausalChain
 */
export function buildPredictionEntry(signal: PredictionSignal): AnalysisEntry {
  // ── Sentiment from yesPrice ──────────────────────────────────────────────
  const sentiment: "bullish" | "bearish" | "neutral" =
    signal.yesPriceCurr >= 0.6
      ? "bearish"
      : signal.yesPriceCurr <= 0.4
        ? "bullish"
        : "neutral";

  // ── Impact score: confidence × 10, clamped to [1, 10] ───────────────────
  const rawScore = signal.confidence * 10;
  const impactScore = Math.max(1, Math.min(10, Math.round(rawScore)));

  // ── Map question text → affected VN sectors/stocks ───────────────────────
  const mappings = mapPredictionToVn(signal.marketQuestion, []);
  const affectedDomains = Array.from(
    new Set(mappings.flatMap((m) => m.sectors)),
  );
  const affectedActions = Array.from(
    new Set(mappings.flatMap((m) => m.stocks)),
  );

  // ── Impact direction from sentiment ──────────────────────────────────────
  const impactDirection =
    sentiment === "bullish" ? "up" : sentiment === "bearish" ? "down" : "neutral";

  // ── Severity to time horizon: critical/high → short; medium → medium; low → long
  const timeHorizon: "short" | "medium" | "long" =
    signal.severity === "critical" || signal.severity === "high"
      ? "short"
      : signal.severity === "medium"
        ? "medium"
        : "long";

  const summary =
    `[Prediction Market] ${signal.marketQuestion} | ` +
    `YES: ${(signal.yesPriceCurr * 100).toFixed(1)}% | ` +
    TelegramMessageFactory.formatSignalReasoning(signal.reasoning);

  return {
    id: `pred-${signal.marketId}-${Date.now()}`,
    level: "global",
    sourceType: "prediction_market",
    sourceTitle: signal.marketQuestion,
    sourceUrl: `https://polymarket.com/event/${signal.marketId}`,
    publishedAt: signal.detectedAt,
    sentiment,
    impactScore,
    impactDirection,
    confidence: signal.confidence,
    timeHorizon,
    summary,
    reasoning:
      `Prediction market signal (${signal.signalType}, ${signal.severity}): ` +
      signal.reasoning,
    affectedCountries: ["VN"],
    affectedDomains,
    affectedActions,
    parentIds: [],
    tags: [signal.signalType, signal.severity, "prediction_market"],
    createdAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: runPredictionImpactChain
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the causal cascade pipeline for all HIGH/CRITICAL prediction signals.
 *
 * Filters out LOW and MEDIUM signals before processing.
 * For each qualifying signal, builds an AnalysisEntry and calls buildCausalChain.
 * Returns one CausalChain per processed signal.
 *
 * @param input - Signals, watchlist, optional RAG retriever
 * @returns     - Array of CausalChain (one per HIGH/CRITICAL signal)
 */
export async function runPredictionImpactChain(
  input: RunPredictionImpactChainInput,
): Promise<CausalChain[]> {
  // ── Filter to HIGH/CRITICAL only ─────────────────────────────────────────
  const qualifying = input.signals.filter(
    (s) => s.severity === "high" || s.severity === "critical",
  );

  if (qualifying.length === 0) {
    logger.debug("[runPredictionImpactChain] no HIGH/CRITICAL signals — skipping cascade");
    return [];
  }

  logger.info(
    `[runPredictionImpactChain] processing ${qualifying.length} HIGH/CRITICAL signals`,
  );

  const retriever: RagRetriever = input.ragRetriever ?? defaultRagRetriever;
  const results: CausalChain[] = [];

  for (const signal of qualifying) {
    try {
      // ── Build AnalysisEntry from prediction signal ──────────────────────
      const entry = buildPredictionEntry(signal);

      // ── Fetch RAG context (best-effort) ────────────────────────────────
      let ragResults: SearchResult[] = [];
      try {
        ragResults = await retriever(entry.summary, { k: 3 });
      } catch (err) {
        logger.warn(
          "[runPredictionImpactChain] RAG retrieval failed — proceeding without context",
          { marketId: signal.marketId, error: err instanceof Error ? err.message : String(err) },
        );
      }

      // ── Build causal chain (pure domain call) ──────────────────────────
      const chain = buildCausalChain(entry, input.watchlist, ragResults);
      results.push(chain);

      logger.info(
        `[runPredictionImpactChain] chain built for ${signal.marketId} — ` +
          `${chain.watchlistImpacts.length} watchlist impacts`,
      );
    } catch (err) {
      logger.error(
        "[runPredictionImpactChain] failed to process signal",
        { marketId: signal.marketId, error: err instanceof Error ? err.message : String(err) },
      );
      // Continue with remaining signals — never throw
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Private: default RAG retriever (lazy-loaded to avoid circular imports)
// ─────────────────────────────────────────────────────────────────────────────

// G5b (P2-F): rewired from searchContext (direct LanceDB) to ragSearch (HTTP boundary).
async function defaultRagRetriever(
  query: string,
  options?: { k?: number },
): Promise<SearchResult[]> {
  try {
    const { ragSearch } = await import("../../infrastructure/rag/ragHttpClient.js");
    const response = await ragSearch({
      query,
      ...(options?.k !== undefined ? { limit: options.k } : {}),
    });
    return response.results.map((r) => ({
      id: r.id,
      level: r.level,
      title: r.title,
      summary: r.summary,
      tags: r.tags,
      actionCode: r.action_code,
      createdAt: r.created_at,
      distance: r.distance,
    }));
  } catch (err) {
    logger.warn("[runPredictionImpactChain] defaultRagRetriever failed to reach rag-service", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
