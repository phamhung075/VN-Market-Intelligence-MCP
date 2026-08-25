/**
 * Trade-relationship signals — Poll News (FACTORY-APP-split-pollNews, stage
 * 3: cascade/alert-generation)
 *
 * Country-to-stock impact analysis that goes beyond sector cascade rules
 * ("Middle East peace" → VNM, 8% export exposure to Iraq). Auto-learns new
 * trade relationships from the article text, then pushes any qualifying
 * trade-impact signals into the same batch-level `allSignals` accumulator
 * used by the cascade-impact loop — skipping a stock already covered by a
 * cascade news_mention signal for this entry.
 *
 * Self-contained: catches its own errors (best-effort, silent — matches the
 * pre-split behaviour) and never rethrows to the caller.
 *
 * Split out of pollNews.ts's pollNews() body (previously inline, lines
 * 369-404 of the pre-stage-3 orchestrator).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { AnalysisEntry } from "../../../domain/services/newsNormalizer.js";
import type { WatchlistEntry } from "../../../domain/services/cascadeEngine.js";
import type { Signal } from "../../../domain/services/signalDetector.js";
import type { SentimentResult } from "../../../domain/services/sentimentClassifier.js";
import type { NewsMentionConfig } from "../../../infrastructure/config.js";

export interface TradeRelationshipSignalsParams {
  entry: AnalysisEntry;
  watchlist: WatchlistEntry[];
  nmCfg: NewsMentionConfig;
  entrySentiment: SentimentResult;
  /** Mutated in place — same array accumulated across the whole batch. */
  allSignals: Signal[];
}

/**
 * Best-effort — any failure (missing table, malformed profile data) is
 * caught internally and silently swallowed, matching the pre-split
 * behaviour: trade-relationship analysis must never abort the poll cycle
 * nor surface a log line of its own.
 */
export async function pushTradeRelationshipSignals(params: TradeRelationshipSignalsParams): Promise<void> {
  const { entry, watchlist, nmCfg, entrySentiment, allSignals } = params;
  const maxAgeMs = nmCfg.maxAgeMinutes * 60 * 1000;

  try {
    const { analyzeTradeImpact } = await import("../../../domain/services/tradeRelationships.js");
    const { detectAndLearnTradeRelationship } = await import("../../../infrastructure/db/tradeStore.js");

    // Auto-learn new trade relationships from news
    const wlCodes = new Set(watchlist.map((w) => w.actionCode));
    detectAndLearnTradeRelationship(`${entry.sourceTitle} ${entry.summary}`, wlCodes);

    // Analyze trade impact
    const tradeImpacts = analyzeTradeImpact(
      `${entry.sourceTitle} ${entry.summary}`,
      watchlist.map((w) => w.actionCode),
    );

    for (const ti of tradeImpacts) {
      // Skip if already covered by cascade (same stock already has a signal)
      const alreadyCovered = allSignals.some(
        (s) => s.actionCode === ti.code && s.type === "news_mention",
      );
      if (alreadyCovered) continue;

      // Gate: trade impacts also require non-neutral sentiment + article freshness
      const tradeArticleAge = Date.now() - new Date(entry.createdAt).getTime();
      if (tradeArticleAge > maxAgeMs) continue;
      if (nmCfg.requireNonNeutralSentiment && entrySentiment.direction === "neutral" && entrySentiment.confidence < 0.3) continue;

      allSignals.push({
        type: "news_mention",
        severity: ti.revenuePct >= 15 ? "high" : ti.revenuePct >= 5 ? "medium" : "low",
        actionCode: ti.code,
        message: `${entry.sourceTitle} — ${ti.reasoning}`,
        confidence: Math.min(0.9, ti.revenuePct / 100 + 0.3),
        detectedAt: entry.createdAt,
      });
    }
  } catch { /* trade analysis best-effort */ }
}
