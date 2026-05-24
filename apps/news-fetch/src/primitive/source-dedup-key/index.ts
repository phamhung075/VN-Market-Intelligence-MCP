/**
 * source-dedup-key primitive
 *
 * Pure function — no side effects, deterministic for same input.
 * Zero imports from infrastructure, application, or interface layers.
 *
 * Computes a stable dedup key for an article within a single fetch batch.
 * URL-based key when URL is available; headline-based key as fallback.
 */

/** Input type for article key computation. */
export interface ArticleKeyInput {
  url: string | null;
  headline: string;
  source: string;
}

/**
 * Compute a deterministic dedup key for an article.
 *
 * Key strategy:
 * - URL present (non-null, non-empty): key = "url:<normalized-url-without-protocol>"
 * - URL absent: key = "headline:<source>:<lowercased-trimmed-headline>"
 * - URL absent AND headline empty: key = "fallback:<source>:empty"
 *
 * @param article - Article key input (url, headline, source)
 * @returns Deterministic string key for dedup within a batch.
 *
 * @example
 *   computeArticleKey({ url: "https://bloomberg.com/fed-rates", headline: "Fed...", source: "bloomberg" })
 *   // "url:bloomberg.com/fed-rates"
 *
 *   computeArticleKey({ url: null, headline: "Vietnam GDP", source: "reuters" })
 *   // "headline:reuters:vietnam gdp"
 */
export function computeArticleKey(article: ArticleKeyInput): string {
  const { url, headline, source } = article;

  // URL-based key: strip protocol, normalize
  if (url !== null && url.trim() !== '') {
    const normalized = url
      .replace(/^https?:\/\//, '') // strip protocol
      .replace(/\/$/, '')          // strip trailing slash
      .toLowerCase();
    return `url:${normalized}`;
  }

  // Headline-based key
  const trimmedHeadline = headline.trim().toLowerCase();

  if (trimmedHeadline === '') {
    return `fallback:${source}:empty`;
  }

  return `headline:${source}:${trimmedHeadline}`;
}
