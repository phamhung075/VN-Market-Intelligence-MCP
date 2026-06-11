/**
 * newsSentimentHandler.ts — GET /api/news-sentiment
 *
 * MAW-P1-1a: Serve synthesised news items with sentiment for the frontend
 * workbench.  Mirrors the MAW-P0-2 (market-digest) read-path pattern.
 *
 * Source: `rag_analyses` SQLite table (mcp-server owns market.db).
 * The table is populated by pollNews / VPS push-news pipeline and carries:
 *   – source_title / source_url / published_at / created_at
 *   – sentiment (positive | neutral | negative)
 *   – impact_score (0–10), impact_direction (bullish | bearish | neutral)
 *   – confidence (0–1)
 *   – summary, tags (JSON array of affected tickers/domains)
 *   – affected_domains (JSON array of domain strings)
 *
 * Staleness policy (project policy — never silently stale):
 *   – Each item carries `source_ts` (published_at ?? created_at) so the
 *     frontend can render a freshness badge.
 *   – The envelope carries `generated_at` (server-clock) and
 *     `oldest_item_ts` (earliest source_ts in the result set).
 *   – `stale_served: true` is set when the newest item is older than
 *     STALE_THRESHOLD_HOURS (6h).  The response is still 200 — the flag is
 *     for the frontend badge, not an error condition.
 *
 * Response shape (200 OK):
 *   {
 *     generated_at:   string,   // ISO 8601 server clock
 *     stale_served:   boolean,  // true when newest item > 6h old
 *     oldest_item_ts: string | null,
 *     count:          number,
 *     items: [
 *       {
 *         id:               string,          // rag_analyses.id
 *         title:            string | null,
 *         source:           string | null,   // URL
 *         source_ts:        string,          // published_at ?? created_at
 *         sentiment:        "positive" | "negative" | "neutral" | null,
 *         sentiment_score:  number | null,   // 0–10 (impact_score repurposed)
 *         impact_direction: string | null,   // bullish | bearish | neutral
 *         confidence:       number | null,   // 0–1
 *         affected_tickers: string[],        // extracted from tags JSON
 *         affected_sectors: string[],        // extracted from affected_domains JSON
 *         impact_summary:   string | null    // summary field (omitted if null/empty)
 *       },
 *       ...
 *     ]
 *   }
 *
 * 200 + empty items[] when no rows exist (no error).
 * 500 on DB error.
 *
 * DDD Layer: interface — imports only from bun:sqlite (DB type), never from
 * domain/.  db is injected by server.ts.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Items newer than this are "fresh". Older → stale_served = true. */
export const STALE_THRESHOLD_HOURS = 6;

/** Default item count to return. */
const DEFAULT_LIMIT = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Raw SQLite row from rag_analyses. */
interface RagAnalysisRow {
  id: string;
  source_title: string | null;
  source_url: string | null;
  published_at: string | null;
  created_at: string;
  sentiment: string | null;
  impact_score: number | null;
  impact_direction: string | null;
  confidence: number | null;
  summary: string | null;
  tags: string | null;          // JSON array of strings
  affected_domains: string | null; // JSON array of strings
}

/** One news+sentiment item in the response envelope. */
export interface NewsSentimentItem {
  id: string;
  title: string | null;
  source: string | null;
  source_ts: string;
  sentiment: string | null;
  sentiment_score: number | null;
  impact_direction: string | null;
  confidence: number | null;
  affected_tickers: string[];
  affected_sectors: string[];
  impact_summary: string | null;
}

/** Full response body for GET /api/news-sentiment. */
export interface NewsSentimentResponse {
  generated_at: string;
  stale_served: boolean;
  oldest_item_ts: string | null;
  count: number;
  items: NewsSentimentItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a stored JSON array string into a string[].
 * Returns [] on any parse failure — never throws.
 */
function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((v) => typeof v === "string");
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Determine whether a tag is already stored as an uppercase exchange ticker
 * (2–5 uppercase letters, exactly).
 * Tags written in lowercase (e.g. "gdp", "vietnam") are NOT tickers — they
 * are plain keywords. Real ticker tags stored by the agent pipeline are
 * already uppercase (e.g. "FPT", "VCB").
 * We deliberately do NOT call toUpperCase() before this check so that
 * lowercase keyword tags are excluded.
 */
function isUppercaseTicker(s: string): boolean {
  return /^[A-Z]{2,5}$/.test(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core query — exported for testability
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query the last `limit` rag_analyses rows, newest first.
 * Returns structured NewsSentimentItem[].
 */
export function queryNewsSentiment(
  db: Database,
  limit = DEFAULT_LIMIT,
): NewsSentimentItem[] {
  const clampedLimit = Math.min(50, Math.max(1, limit));

  const rows = db
    .prepare<RagAnalysisRow, [number]>(
      `SELECT id, source_title, source_url, published_at, created_at,
              sentiment, impact_score, impact_direction, confidence,
              summary, tags, affected_domains
       FROM rag_analyses
       WHERE source_url IS NOT NULL
         AND source_url != ''
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(clampedLimit);

  return rows.map((row) => {
    const source_ts = row.published_at ?? row.created_at;

    // Tags can contain tickers OR plain keywords.
    // Real ticker tags from the agent pipeline are stored already uppercase
    // (e.g. "FPT", "VCB"). Plain keywords like "gdp", "vietnam" are stored
    // lowercase. We only classify a tag as a ticker if it is already in
    // uppercase — no normalisation, to avoid "gdp" → "GDP" false positives.
    const allTags = parseJsonArray(row.tags);
    const affected_tickers = allTags.filter(isUppercaseTicker);

    const affected_sectors = parseJsonArray(row.affected_domains);

    const impact_summary =
      row.summary && row.summary.trim().length > 0 ? row.summary.trim() : null;

    return {
      id: row.id,
      title: row.source_title,
      source: row.source_url,
      source_ts,
      sentiment: row.sentiment,
      sentiment_score: row.impact_score,
      impact_direction: row.impact_direction,
      confidence: row.confidence,
      affected_tickers,
      affected_sectors,
      impact_summary,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/news-sentiment.
 *
 * @param _req - Incoming HTTP request (unused)
 * @param res  - HTTP response
 * @param db   - SQLite database instance (injected by server.ts)
 * @param now  - Optional clock override for testability (defaults to new Date())
 */
export function handleGetNewsSentiment(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
): void {
  try {
    const items = queryNewsSentiment(db, DEFAULT_LIMIT);

    // Staleness: check if newest item is older than threshold
    let stale_served = false;
    let oldest_item_ts: string | null = null;

    if (items.length > 0) {
      // Items are ordered newest first. newest = items[0], oldest = items[last].
      const newestTs = items[0]!.source_ts;
      const oldestTs = items[items.length - 1]!.source_ts;
      oldest_item_ts = oldestTs;

      const newestDate = new Date(newestTs);
      const ageMs = now.getTime() - newestDate.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      stale_served = ageHours > STALE_THRESHOLD_HOURS;
    }

    const body: NewsSentimentResponse = {
      generated_at: now.toISOString(),
      stale_served,
      oldest_item_ts,
      count: items.length,
      items,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
