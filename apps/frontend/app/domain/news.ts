/**
 * Domain types for news headline data.
 * Tier 1 of DDD: pure TypeScript — ZERO imports from app/lib/api/ or app/components/.
 *
 * Reflects api-gateway /news/* endpoint response shapes (proxied to news service).
 */

/** A single news headline item as returned by the news service. */
export interface Headline {
  title: string;
  url?: string;
  publishedAt?: string;
  source?: string;
  summary?: string;
}

/** Source label for a headline feed. */
export type NewsSource = "reuters" | "bloomberg";
