/**
 * Cascade impact signals — Poll News (FACTORY-APP-split-pollNews, stage 3:
 * cascade/alert-generation)
 *
 * Converts one entry's causal-chain watchlist impacts into news_mention /
 * insider_trading signals, pushed directly into the batch-level `allSignals`
 * accumulator (mutated by reference — matches the pre-split behaviour where
 * this loop shared the same array across the whole newEntries batch, not a
 * fresh array per entry). Applies the relevance gates (age / sentiment /
 * direct-mention-or-trusted-source / market-wide-cascade-noise) and the
 * per-stock signal cap.
 *
 * Split out of pollNews.ts's pollNews() body (previously inline, lines
 * 301-366 of the pre-stage-3 orchestrator).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { AnalysisEntry } from "../../../domain/services/newsNormalizer.js";
import type { CausalChain } from "../../../domain/services/cascadeEngine.js";
import type { Signal } from "../../../domain/services/signalDetector.js";
import type { SentimentResult } from "../../../domain/services/sentimentClassifier.js";
import type { NewsMentionConfig } from "../../../infrastructure/config.js";
import { detectStocksInText, tickerWholeWordMatch, stripSourceAttributionSuffix } from "../../../domain/services/stockAliases.js";
import { detectInsiderFamilyBuying } from "./insiderDetectors.js";

// Cap news_mention signals per stock per cycle to prevent a flood of cascade
// signals for a single stock (especially problematic when the watchlist has
// only 1-2 stocks).
const MAX_SIGNALS_PER_STOCK_PER_CYCLE = 3;

export interface CascadeImpactSignalsParams {
  entry: AnalysisEntry;
  chain: CausalChain;
  nmCfg: NewsMentionConfig;
  entrySentiment: SentimentResult;
  /** Mutated in place — same array accumulated across the whole batch. */
  allSignals: Signal[];
  /** Mutated in place — same map accumulated across the whole batch. */
  stockSignalCount: Map<string, number>;
}

/**
 * Push zero or more signals for one entry's cascade watchlist impacts.
 * Pure/sync — no I/O, no throw (gates are `continue`-only, never rethrow).
 */
export function pushCascadeImpactSignals(params: CascadeImpactSignalsParams): void {
  const { entry, chain, nmCfg, entrySentiment, allSignals, stockSignalCount } = params;
  const highTrustSources = nmCfg.highTrustSources;
  const maxAgeMs = nmCfg.maxAgeMinutes * 60 * 1000;

  for (const impact of chain.watchlistImpacts) {
    if (impact.confidence <= 0) continue;

    // Gate 1: Article age — skip stale news
    const articleAge = Date.now() - new Date(entry.createdAt).getTime();
    if (articleAge > maxAgeMs) continue;

    // Gate 2: Sentiment — skip neutral articles (no investment signal)
    const sentiment = entrySentiment;
    if (nmCfg.requireNonNeutralSentiment && sentiment.direction === "neutral" && sentiment.confidence < 0.3) continue;

    // Gate 3: Direct stock mention OR (trusted source + strong signal)
    // A direct mention in the article always passes.
    // For cascade-only impacts (no direct mention), require BOTH:
    //   a) trusted source, AND
    //   b) strong non-neutral sentiment (confidence >= 0.5) + high cascade confidence (>= 0.7)
    // This prevents generic macro news from triggering alerts for every stock in every sector.
    const sourceUrl = entry.sourceUrl.toLowerCase();
    const sourceTrusted = highTrustSources.some((s) => sourceUrl.includes(s));
    // FIX-1333: strip " - SOURCE" attribution suffix before ticker matching
    const strippedTitle = stripSourceAttributionSuffix(entry.sourceTitle);
    const titleAndSummary = `${strippedTitle} ${entry.summary}`.toLowerCase();
    // FIX-1304: use whole-word boundary match to prevent prefix collisions
    // e.g. "BID" must NOT fire on "Bidiphar" (BID is a leading substring)
    const tickerMatch = tickerWholeWordMatch(titleAndSummary, impact.actionCode);
    const aliasMatch = tickerMatch
      ? false // short-circuit: ticker already matched, skip alias scan
      : detectStocksInText(titleAndSummary, [impact.actionCode]).length > 0;
    const directMention = tickerMatch || aliasMatch;
    // Gate 3b: Market-wide cascade noise filter — cascade-only impacts
    // from "ảnh hưởng toàn thị trường" are low-signal for individual stocks.
    // Require direct mention for market-wide cascade impacts.
    const isMarketWideCascade = impact.reasoning.includes("market-wide cascade");
    if (directMention) {
      // Always pass — article explicitly mentions this stock
    } else if (isMarketWideCascade) {
      continue; // Market-wide cascade without direct mention — skip (noise)
    } else if (sourceTrusted && sentiment.direction !== "neutral" && sentiment.confidence >= nmCfg.minSentimentConfidence && impact.confidence >= nmCfg.minCascadeConfidence) {
      // Trusted source + strong directional sentiment + high cascade confidence — pass
    } else {
      continue; // Not relevant enough for this stock
    }

    // Per-stock signal cap — prevent flood for single-stock watchlists
    const currentCount = stockSignalCount.get(impact.actionCode) ?? 0;
    if (!directMention && currentCount >= MAX_SIGNALS_PER_STOCK_PER_CYCLE) continue;
    stockSignalCount.set(impact.actionCode, currentCount + 1);

    // Task 1260: Elevate insider/family buying events from news_mention LOW
    // to insider_trading MEDIUM. Vietnamese patterns: "con trai gom cổ phiếu",
    // "người nhà mua vào", etc. These are related-party buying signals — higher
    // investment significance than generic news mentions.
    const isInsiderFamily = detectInsiderFamilyBuying(entry.sourceTitle);
    allSignals.push({
      type: isInsiderFamily ? "insider_trading" : "news_mention",
      severity: isInsiderFamily
        ? "medium"
        : impact.confidence >= 0.8 ? "high" : impact.confidence >= 0.6 ? "medium" : "low",
      actionCode: impact.actionCode,
      message: isInsiderFamily
        ? `[Insider/family buying] ${entry.sourceTitle} — ${impact.reasoning}`
        : `${entry.sourceTitle} — ${impact.reasoning}`,
      confidence: isInsiderFamily ? Math.max(impact.confidence, 0.75) : impact.confidence,
      detectedAt: entry.createdAt,
    });
  }
}
