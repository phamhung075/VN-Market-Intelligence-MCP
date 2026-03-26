/**
 * Infrastructure — Base RSS Feed Parser
 *
 * Parses RSS 2.0 XML feeds using cheerio (which handles XML just fine).
 * This module is source-agnostic — it can be reused by any RSS feed fetcher.
 *
 * Layer: infrastructure/fetchers — may use HTTP libs, must not import domain/.
 */

import * as cheerio from "cheerio";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A single item parsed from an RSS feed.
 */
export interface RssItem {
  /** Article headline. */
  title: string;
  /** Canonical URL to the full article. */
  url: string;
  /** Publication timestamp as a raw string from the feed (e.g. RFC 2822 date). */
  publishedAt: string;
  /** Article summary / description (may contain HTML entities). */
  content: string;
  /**
   * Source identifier set by the caller (e.g. 'cafef').
   * parseRssFeed() always emits '' — callers must set it after parsing.
   */
  source: string;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parses a raw RSS 2.0 XML string and returns the list of items.
 *
 * Uses cheerio with `xmlMode: true` so it handles XML namespaces and CDATA
 * sections correctly. Items with an empty title AND empty url are skipped.
 *
 * @param xml - Raw RSS XML string (UTF-8).
 * @returns Array of RssItem. Empty array on empty input or parse failure.
 */
export function parseRssFeed(xml: string): RssItem[] {
  if (!xml || !xml.trim()) {
    return [];
  }

  try {
    // cheerio with xmlMode parses XML / RSS correctly
    const $ = cheerio.load(xml, { xmlMode: true });
    const items: RssItem[] = [];

    $("item").each((_idx, el) => {
      const $el = $(el);

      const title = $el.find("title").first().text().trim();
      const url = $el.find("link").first().text().trim();
      const publishedAt = $el.find("pubDate").first().text().trim();
      const content =
        $el.find("description").first().text().trim() ||
        $el.find("content\\:encoded").first().text().trim() ||
        $el.find("encoded").first().text().trim();

      // Skip items that have neither title nor url
      if (!title && !url) {
        return;
      }

      items.push({
        title,
        url,
        publishedAt,
        content,
        source: "", // caller sets the source (e.g. 'cafef')
      });
    });

    return items;
  } catch (err) {
    logger.error("[rss] failed to parse RSS feed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
