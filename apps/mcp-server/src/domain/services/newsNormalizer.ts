/**
 * News Normalizer — Task 061
 *
 * Pure domain function that converts a raw RssItem into a typed AnalysisEntry
 * domain object for consumption by the causal cascade engine.
 *
 * Design notes:
 *  - No async, no I/O, no side effects.
 *  - RssItem is imported from infrastructure/fetchers/rss.ts because it is a
 *    plain data interface with no behavior — permitted per FR-061-7 and the
 *    DDD import boundary note in TECH-004.
 *  - DomainType is imported (transitively, via the sibling modules below)
 *    from bctc-schema.ts (root-level schema).
 *
 * Module split (FACTORY-DOMAIN-split-newsNormalizer, behavior-preserving):
 *  - Types (AnalysisLevel/Sentiment/ImpactDirection/TimeHorizon/AnalysisEntry)
 *    live in `newsNormalizerTypes.ts`.
 *  - Keyword/lookup DATA TABLES live in `newsNormalizerTables.ts`.
 *  - Pure HELPER functions (decodeHtmlEntities, classification/scoring
 *    helpers, decision-résumé builder) live in `newsNormalizerHelpers.ts`.
 *  - This file keeps ONLY the core `normalizeNews()` orchestration algorithm
 *    and re-exports the previously-public surface so every existing
 *    `import ... from "./newsNormalizer.js"` call site is unaffected.
 *
 * Layer: domain/services — must not import from application/ or infrastructure/
 * adapters. Approved exceptions:
 *  - RssItem structural import (plain data, no behavior)
 *  - formatAnalysisNewsSummary from infrastructure/adapters/analysisFormatters (Task 1300b fix)
 */

import type { RssItem } from "../models/shared-types.js";
import { stripSourceAttributionSuffix } from "./stockAliases.js";
import { truncateNewsSummary } from "./textUtils.js";

import type { AnalysisLevel, Sentiment, ImpactDirection, TimeHorizon, AnalysisEntry } from "./newsNormalizerTypes.js";
import {
  GLOBAL_KEYWORDS,
  COUNTRY_KEYWORDS,
  BULLISH_KEYWORDS,
  BEARISH_KEYWORDS,
  DOMAIN_VN_LABEL,
} from "./newsNormalizerTables.js";
import {
  decodeHtmlEntities,
  findKeyword,
  collectKeywords,
  extractStockTickers,
  detectDomains,
  classifyLevel,
  detectSentiment,
  sentimentToDirection,
  levelToTimeHorizon,
  computeImpactScore,
  parsePublishedAt,
  computeConfidence,
  truncateAt120,
  buildDecisionResume,
} from "./newsNormalizerHelpers.js";

// ═══════════════════════════════════════════════════════════════════════════
// Re-exports — preserves the pre-split public API of this module
// ═══════════════════════════════════════════════════════════════════════════

export type { AnalysisLevel, Sentiment, ImpactDirection, TimeHorizon, AnalysisEntry };
export { decodeHtmlEntities, truncateAt120, buildDecisionResume, DOMAIN_VN_LABEL };

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize a raw RSS item into a typed AnalysisEntry.
 *
 * Pure function — no async, no I/O, no side effects.
 *
 * @param item - Raw RSS item from any feed fetcher
 * @returns    - Fully populated AnalysisEntry ready for the cascade engine
 */
export function normalizeNews(item: RssItem): AnalysisEntry {
  // Task 1213: normalize all incoming text to NFC before any processing.
  // Vietnamese text can arrive in NFD (combining diacritics) form from RSS
  // feeds, SSC portal, and VPS proxy scripts. NFD form breaks keyword matching
  // because "Việt Nam" NFD !== "Việt Nam" NFC.
  const title = decodeHtmlEntities((item.title?.trim() ?? "").normalize("NFC"));
  const content = decodeHtmlEntities((item.content?.trim() ?? "").normalize("NFC"));
  const source = item.source?.toLowerCase() ?? "";

  // Combined lowercase text for keyword scanning
  const combinedLower = (title + " " + content).toLowerCase();

  // ── Domain detection ────────────────────────────────────────────────────
  const { domains: affectedDomains, matchedKeywords: domainKeywords } =
    detectDomains(combinedLower);

  // ── Stock ticker extraction ──────────────────────────────────────────────
  // Bug 1311: strip source attribution suffix (e.g. " - MSN", " - Reuters") from
  // title BEFORE NER so attribution tokens are never treated as stock tickers.
  // Only the title carries the suffix; content field does not.
  const cleanTitle = stripSourceAttributionSuffix(title);
  // Use original case (tickers are uppercase)
  const affectedActions = extractStockTickers(cleanTitle + " " + content);

  // ── Level classification ─────────────────────────────────────────────────
  const level = classifyLevel(
    combinedLower,
    source,
    affectedActions.length > 0,
    affectedDomains.length > 0,
  );

  // ── Sentiment ────────────────────────────────────────────────────────────
  const sentiment = detectSentiment(combinedLower);
  const impactDirection = sentimentToDirection(sentiment);

  // ── Collect all matched keywords for tags + impact score ─────────────────
  const globalMatched = collectKeywords(combinedLower, GLOBAL_KEYWORDS);
  const countryMatched = collectKeywords(combinedLower, COUNTRY_KEYWORDS);
  const bullishMatched = collectKeywords(combinedLower, BULLISH_KEYWORDS);
  const bearishMatched = collectKeywords(combinedLower, BEARISH_KEYWORDS);

  const allMatchedKeywords = [
    ...globalMatched,
    ...countryMatched,
    ...domainKeywords,
    ...bullishMatched,
    ...bearishMatched,
  ];

  // ── Impact score ─────────────────────────────────────────────────────────
  const impactScore = computeImpactScore(title, content, allMatchedKeywords);

  // ── Tags (deduplicated, lowercase, max 10) ────────────────────────────────
  const rawTags = [
    ...allMatchedKeywords.map((k) => k.toLowerCase()),
    ...affectedDomains.map((d) => d.toLowerCase()),
    ...affectedActions.map((a) => a.toLowerCase()),
  ];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const t of rawTags) {
    if (!seen.has(t)) {
      seen.add(t);
      tags.push(t);
      if (tags.length >= 10) break;
    }
  }

  // ── Affected countries ───────────────────────────────────────────────────
  const isVietnameseSource = source === "cafef" || source === "vnexpress";
  const hasVietnamKeyword =
    findKeyword(combinedLower, COUNTRY_KEYWORDS) !== null ||
    combinedLower.includes("vietnam") ||
    combinedLower.includes("việt nam");

  let affectedCountries: string[];
  if (isVietnameseSource) {
    affectedCountries = ["VN"];
  } else if (hasVietnamKeyword) {
    affectedCountries = ["VN"];
  } else {
    affectedCountries = [];
  }

  // ── Time horizon ─────────────────────────────────────────────────────────
  const timeHorizon = levelToTimeHorizon(level);

  // ── Summary ──────────────────────────────────────────────────────────────
  const rawSummary =
    title && content
      ? `${title}. ${content}`
      : title
        ? title
        : content;
  const summary = truncateNewsSummary(rawSummary);

  // ── Reasoning ────────────────────────────────────────────────────────────
  const reasoningParts: string[] = [`Source: ${source || "unknown"}. Level: ${level}.`];
  if (level === "global" && globalMatched.length > 0) {
    reasoningParts.push(`Global keywords matched: ${globalMatched.slice(0, 3).join(", ")}.`);
  }
  if (level === "country" && countryMatched.length > 0) {
    reasoningParts.push(`Country keywords matched: ${countryMatched.slice(0, 3).join(", ")}.`);
  }
  if (affectedDomains.length > 0) {
    reasoningParts.push(`Domains detected: ${affectedDomains.join(", ")}.`);
  }
  if (affectedActions.length > 0) {
    reasoningParts.push(`Stocks mentioned: ${affectedActions.join(", ")}.`);
  }
  if (isVietnameseSource && level === "global") {
    reasoningParts.push("Global keyword override on Vietnamese source.");
  }
  if (!isVietnameseSource && level === "global" && globalMatched.length === 0) {
    reasoningParts.push("Source tiebreaker applied (reuters/ap_news → global).");
  }
  const reasoning = reasoningParts.join(" ");

  // ── Confidence ───────────────────────────────────────────────────────────
  const confidence = computeConfidence(level, allMatchedKeywords.length);

  // ── Decision résumé (FR-1 — FEAT-NEWS-DECISION-RESUME) ───────────────────
  const decision_resume = buildDecisionResume(
    sentiment,
    level,
    affectedActions,
    affectedDomains,
    bullishMatched,
    bearishMatched,
  );

  // ── ID ───────────────────────────────────────────────────────────────────
  const id = `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    level,
    sourceTitle: title || "(no title)",
    sourceUrl: item.url ?? "",
    sourceType: "news",
    publishedAt: parsePublishedAt(item.publishedAt),
    sentiment,
    impactScore,
    impactDirection,
    confidence,
    timeHorizon,
    summary,
    reasoning,
    affectedCountries,
    affectedDomains,
    affectedActions,
    parentIds: [],
    tags,
    createdAt: new Date().toISOString(),
    decision_resume,
  };
}
