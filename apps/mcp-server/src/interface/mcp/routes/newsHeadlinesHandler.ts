/**
 * Interface — GET /mcp/api/news/headlines
 *
 * Serves news headlines from the rag_analyses DB cache in the `articles`
 * envelope expected by the Remix frontend parseHeadlines() client parser.
 *
 * This is a thin wrapper over the existing newsFetchLiveHandler DB query,
 * returning `articles` instead of `rows` to match the frontend shape.
 *
 * Query params:
 *   source — reuters | bloomberg | cafef | vnexpress | vneconomy | all (default: all)
 *   limit  — integer 1–50 (default: 15)
 *
 * Response shape (matches parseHeadlines envelope):
 *   { source, count, articles: [{ title, url, publishedAt, source }] }
 *
 * Error cases:
 *   400 — invalid source param
 *   500 — DB error
 *
 * DI contract: db injected by caller (server.ts). No getDb() here.
 * Existing /api/news-fetch/live is NOT affected — it stays as-is.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

const VALID_SOURCES = ["reuters", "bloomberg", "cafef", "vnexpress", "vneconomy", "all"] as const;
type Source = (typeof VALID_SOURCES)[number];

const DEFAULT_LIMIT = 15;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;

interface RagRow {
  source_title: string | null;
  source_url: string | null;
  published_at: string | null;
  created_at: string;
}

export function buildSql(source: Source): string {
  const cols = `SELECT source_title, source_url, published_at, created_at
  FROM rag_analyses`;
  const tail = `ORDER BY created_at DESC LIMIT ?`;

  if (source === "reuters") return `${cols} WHERE source_url LIKE '%reuters.com%' ${tail}`;
  if (source === "bloomberg") return `${cols} WHERE source_url LIKE '%bloomberg.com%' ${tail}`;
  if (source === "cafef") return `${cols} WHERE source_url LIKE '%cafef%' ${tail}`;
  if (source === "vnexpress") return `${cols} WHERE source_url LIKE '%vnexpress%' ${tail}`;
  if (source === "vneconomy") return `${cols} WHERE source_url LIKE '%vneconomy%' ${tail}`;
  return `${cols} ${tail}`;
}

function deriveProvider(url: string | null): string {
  if (!url) return "other";
  if (url.includes("reuters.com")) return "reuters";
  if (url.includes("bloomberg.com")) return "bloomberg";
  if (url.includes("cafef")) return "cafef";
  if (url.includes("vnexpress")) return "vnexpress";
  if (url.includes("vneconomy")) return "vneconomy";
  return "other";
}

export function handleNewsHeadlines(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rawSource = url.searchParams.get("source") ?? "all";
    const rawLimit = url.searchParams.get("limit") ?? String(DEFAULT_LIMIT);

    if (!VALID_SOURCES.includes(rawSource as Source)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: `Invalid source: "${rawSource}". Must be reuters, bloomberg, cafef, vnexpress, vneconomy, or all.`,
        }),
      );
      return;
    }
    const source = rawSource as Source;

    const parsedLimit = parseInt(rawLimit, 10);
    const limit = Number.isNaN(parsedLimit)
      ? DEFAULT_LIMIT
      : Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, parsedLimit));

    const sql = buildSql(source);
    const rawRows = db.prepare(sql).all(limit) as RagRow[];

    const articles = rawRows.map((r) => ({
      title: r.source_title,
      url: r.source_url,
      publishedAt: r.published_at ?? r.created_at,
      source: source === "all" ? deriveProvider(r.source_url) : source,
    }));

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ source, count: articles.length, articles }));
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
