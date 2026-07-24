/**
 * News Normalizer — Type Declarations (FACTORY-DOMAIN-split-newsNormalizer)
 *
 * Pure type module: the `AnalysisLevel` / `Sentiment` / `ImpactDirection` /
 * `TimeHorizon` unions plus the `AnalysisEntry` domain interface consumed by
 * `newsNormalizer.ts` and the cascade engine.
 *
 * This is a verbatim, behavior-preserving extraction — no field added,
 * removed, renamed, or retyped. The normalization ALGORITHM stays in
 * `newsNormalizer.ts`; `newsNormalizer.ts` re-exports these types unchanged
 * so every existing `import ... from "./newsNormalizer.js"` call site keeps
 * working without modification.
 *
 * Layer: domain/services — must not import from application/ or infrastructure/.
 */

import type { DomainType } from "../../../bctc-schema.js";

export type AnalysisLevel = "global" | "country" | "domain" | "action";
export type Sentiment = "bullish" | "bearish" | "neutral";
export type ImpactDirection = "up" | "down" | "neutral";
export type TimeHorizon = "short" | "medium" | "long";

export interface AnalysisEntry {
  /** Unique identifier: `analysis-${Date.now()}-${random}` */
  id: string;
  level: AnalysisLevel;
  /** RssItem.title or '(no title)' if empty */
  sourceTitle: string;
  /** RssItem.url */
  sourceUrl: string;
  /** 'news' for RSS items, 'prediction_market' for Polymarket signals */
  sourceType: "news" | "prediction_market";
  /** ISO 8601 timestamp derived from RssItem.publishedAt */
  publishedAt: string;
  sentiment: Sentiment;
  /** 0–10 integer */
  impactScore: number;
  impactDirection: ImpactDirection;
  /** 0–1 confidence estimate */
  confidence: number;
  timeHorizon: TimeHorizon;
  /** (title + '. ' + content).slice(0, 500) */
  summary: string;
  /** Short classification justification */
  reasoning: string;
  /** ['VN'] for Vietnamese sources by default */
  affectedCountries: string[];
  affectedDomains: DomainType[];
  /** Matched VN stock tickers */
  affectedActions: string[];
  /** Always [] at normalization time */
  parentIds: string[];
  /** Matched keywords, deduplicated, lowercase, max 10 */
  tags: string[];
  createdAt: string;
  /** Plain-Vietnamese one-liner "vì sao tốt/xấu" — null for neutral sentiment.
   *  Optional for backwards compat with manually-constructed test fixtures.
   *  normalizeNews() always sets this field; manual constructions default undefined → NULL in DB. */
  decision_resume?: string | null;
}
