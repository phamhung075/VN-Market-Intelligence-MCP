/**
 * Infrastructure — Telegram /news Command Handler (FACTORY-INFRA-split-telegramCommands)
 *
 * Extracted verbatim from telegramCommands.ts's handleNews + its private
 * helpers (sentimentLabel, midnightVietnamAsUtcInline) — zero query/logic
 * drift, including the dedup/fallback/chunking behavior.
 *
 * @module infrastructure/notifiers/telegram/newsHandler
 */

import type { Database } from "bun:sqlite";
import { VN_OFFSET_MS } from "../../../domain/services/timeConstants.js";
import { stripHtml, chunkStories } from "./format.js";

/** Map sentiment column value to plain Vietnamese label. */
function sentimentLabel(raw: string | null | undefined): string {
  switch (raw) {
    case "positive":
    case "tích cực":
      return "tích cực";
    case "negative":
    case "tiêu cực":
      return "tiêu cực";
    case "neutral":
    case "trung tính":
      return "trung tính";
    default:
      return "trung tính";
  }
}

/** Inline midnight-Vietnam-as-UTC arithmetic (mirrors assembleEveningSummary.ts). */
function midnightVietnamAsUtcInline(): string {
  const now = new Date();
  const vnNow = new Date(now.getTime() + VN_OFFSET_MS);
  const midnight = new Date(
    Date.UTC(
      vnNow.getUTCFullYear(),
      vnNow.getUTCMonth(),
      vnNow.getUTCDate(),
      0,
      0,
      0,
      0,
    ) - VN_OFFSET_MS,
  );
  return midnight.toISOString();
}

/**
 * /news [N] — query rag_analyses for today's stories (UTC+7 midnight), format
 * as plain Vietnamese digest. Returns `texts[]` for chunked delivery.
 *
 * Primary query (no-arg): all of today's rows — NO LIMIT (full-day coverage).
 * Explicit /news N: clamps to MIN(MAX_LIMIT_EXPLICIT, N).
 * Fallback (zero today-rows): most-recent FALLBACK_LIMIT rows, no date constraint.
 * Header changes to "Tin tức gần đây" when fallback is active.
 *
 * Dedup: collapse same-story duplicates (normalized source_title key);
 * keep highest-impact copy (impact_score DESC, then created_at DESC, then longer summary).
 * HTML: stripHtml applied to source_title and summary before render.
 */
export function handleNews(db: Database, args: string[]): { texts: string[] } {
  /** Cap for an explicit /news N request — no cap on the default full-day query. */
  const MAX_LIMIT_EXPLICIT = 200;
  const MIN_LIMIT = 1;
  /** Fallback path (no today-rows) stays capped at 20 (stale multi-day data). */
  const FALLBACK_LIMIT = 20;

  // Parse optional count argument
  // null = uncapped (default full-day query); number = explicit user cap
  let explicitLimit: number | null = null;
  if (args[0] !== undefined) {
    const parsed = parseInt(args[0], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      explicitLimit = Math.min(MAX_LIMIT_EXPLICIT, Math.max(MIN_LIMIT, parsed));
    }
    // parsed <= 0 or NaN → treat as no-arg (uncapped)
  }

  interface NewsRow {
    source_title: string | null;
    source_url: string | null;
    summary: string | null;
    sentiment: string | null;
    impact_direction: string | null;
    impact_score: number | null;
    created_at: string;
  }

  let rows: NewsRow[] = [];
  let isFallback = false;

  try {
    const midnight = midnightVietnamAsUtcInline();

    if (explicitLimit !== null) {
      // Explicit /news N path — apply LIMIT
      rows = db
        .prepare<NewsRow, [string, number]>(
          `SELECT source_title, source_url, summary, sentiment, impact_direction, impact_score, created_at
           FROM rag_analyses
           WHERE created_at >= ?
           ORDER BY impact_score DESC, created_at DESC
           LIMIT ?`,
        )
        .all(midnight, explicitLimit);
    } else {
      // Default no-arg path — fetch ALL of today's rows (no LIMIT)
      rows = db
        .prepare<NewsRow, [string]>(
          `SELECT source_title, source_url, summary, sentiment, impact_direction, impact_score, created_at
           FROM rag_analyses
           WHERE created_at >= ?
           ORDER BY impact_score DESC, created_at DESC`,
        )
        .all(midnight);
    }

    // Fallback: most-recent FALLBACK_LIMIT rows regardless of date
    if (rows.length === 0) {
      isFallback = true;
      rows = db
        .prepare<NewsRow, [number]>(
          `SELECT source_title, source_url, summary, sentiment, impact_direction, impact_score, created_at
           FROM rag_analyses
           ORDER BY impact_score DESC, created_at DESC
           LIMIT ?`,
        )
        .all(FALLBACK_LIMIT);
    }
  } catch {
    // DB error (e.g. table not yet created) — return friendly fallback
    return { texts: ["Chưa có tin hôm nay."] };
  }

  // Empty DB entirely
  if (rows.length === 0) {
    return { texts: ["Chưa có tin hôm nay."] };
  }

  // ── Dedup: collapse same-story duplicates (normalized source_title key) ──
  // Rows are already ordered by impact_score DESC, created_at DESC from SQL.
  // First occurrence of each normalized key wins (highest-impact copy).
  // Null/empty titles each get a unique Symbol key (treated as individual stories).

  function normalizeTitle(raw: string | null | undefined): string | null {
    if (raw == null) return null;
    const stripped = stripHtml(raw);
    if (!stripped) return null;
    // lowercase → collapse whitespace → strip trailing punctuation
    const normalized = stripped
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.,!?;:]+$/, "");
    return normalized || null;
  }

  const seenKeys = new Map<string, true>();
  const dedupedRows: NewsRow[] = [];

  for (const row of rows) {
    const key = normalizeTitle(row.source_title);
    if (key === null) {
      // Null or empty-after-normalize: each is unique — always keep
      dedupedRows.push(row);
    } else {
      if (!seenKeys.has(key)) {
        seenKeys.set(key, true);
        dedupedRows.push(row);
      }
      // duplicate — skip (SQL order guarantees highest-impact comes first)
    }
  }

  // Build header using POST-DEDUP count
  const headerLabel = isFallback ? "Tin tức gần đây" : "Tin tức hôm nay";
  const header = `${headerLabel} (${dedupedRows.length} bài):`;

  // Build per-story blocks (HTML stripped from title and summary)
  const storyBlocks: string[] = dedupedRows.map((row) => {
    // Strip HTML from title before display
    const strippedTitle = stripHtml(row.source_title);
    const titleLine = strippedTitle || "(không có tiêu đề)";

    const lines: string[] = [titleLine];

    // One-line gist from summary (strip HTML, then truncate at 200 chars plain text)
    if (row.summary != null && row.summary.length > 0) {
      const plainSummary = stripHtml(row.summary);
      if (plainSummary.length > 0) {
        const gist =
          plainSummary.length > 200
            ? plainSummary.slice(0, 200) + "…"
            : plainSummary;
        lines.push(gist);
      }
    }

    // Sentiment label (plain Vietnamese — no raw English, no numeric score)
    lines.push(`Cảm xúc: ${sentimentLabel(row.sentiment)}`);

    return lines.join("\n");
  });

  // Chunk stories into Telegram-safe messages (<= 4096 chars each)
  const chunks = chunkStories(header, storyBlocks, 4096);

  return { texts: chunks };
}
