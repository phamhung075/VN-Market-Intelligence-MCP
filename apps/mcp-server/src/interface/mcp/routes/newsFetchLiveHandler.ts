/**
 * Interface — GET /api/news-fetch/live route handler
 *
 * Returns recent news article rows stored in rag_analyses.
 * Supports all providers including VN sources (cafef, vnexpress, vneconomy).
 * Provider is derived from source_url domain — source_type is always the
 * literal "news" (discriminator), NOT the provider.
 *
 * No auth required — public news headlines, consistent with all other GET /api/* read routes.
 * CORS Access-Control-Allow-Origin: * is applied globally in server.ts — not repeated here.
 *
 * DI contract: db injected by caller (server.ts handleRequest). No getDb() here.
 *
 * Query params:
 *   source  reuters | bloomberg | cafef | vnexpress | vneconomy | all  (default: all)
 *   limit   integer 1–50              (default: 20, clamped server-side)
 *
 * Response shape (success):
 *   { ok: true, source, count, rows: [{ headline, url, published_at, sentiment,
 *     impact_direction, impact_score, created_at, _provider? }] }
 *
 * Error shape:
 *   { ok: false, error: string }
 *   HTTP 400 for invalid source param; HTTP 500 for DB error.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";

const VALID_SOURCES = ["reuters", "bloomberg", "cafef", "vnexpress", "vneconomy", "all"] as const;
type Source = (typeof VALID_SOURCES)[number];

const DEFAULT_LIMIT = 20;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;

/** Row shape returned by the SELECT query */
interface RagRow {
  source_title: string | null;
  source_url: string | null;
  published_at: string | null;
  sentiment: string | null;
  impact_direction: string | null;
  impact_score: number | null;
  created_at: string;
}

/** Public display shape for a single article row */
export interface ArticleRow {
  headline: string | null;
  url: string | null;
  published_at: string | null;
  sentiment: string | null;
  impact_direction: string | null;
  impact_score: number | null;
  created_at: string;
  /** Only present when source=all — transparent derivation from url, never fabricated */
  _provider?: "reuters" | "bloomberg" | "cafef" | "vnexpress" | "vneconomy" | "other";
}

function buildSql(source: Source): string {
  const cols = `SELECT source_title, source_url, published_at, sentiment,
       impact_direction, impact_score, created_at
  FROM rag_analyses`;
  const tail = `ORDER BY created_at DESC LIMIT ?`;

  if (source === "reuters") {
    return `${cols} WHERE source_url LIKE '%reuters%' ${tail}`;
  }
  if (source === "bloomberg") {
    return `${cols} WHERE source_url LIKE '%bloomberg%' ${tail}`;
  }
  if (source === "cafef") {
    return `${cols} WHERE source_url LIKE '%cafef%' ${tail}`;
  }
  if (source === "vnexpress") {
    return `${cols} WHERE source_url LIKE '%vnexpress%' ${tail}`;
  }
  if (source === "vneconomy") {
    return `${cols} WHERE source_url LIKE '%vneconomy%' ${tail}`;
  }
  // all — no WHERE filter; returns every stored row regardless of provider
  return `${cols} ${tail}`;
}

function deriveProvider(url: string | null): "reuters" | "bloomberg" | "cafef" | "vnexpress" | "vneconomy" | "other" {
  if (!url) return "other";
  if (url.includes("reuters")) return "reuters";
  if (url.includes("bloomberg")) return "bloomberg";
  if (url.includes("cafef")) return "cafef";
  if (url.includes("vnexpress")) return "vnexpress";
  if (url.includes("vneconomy")) return "vneconomy";
  return "other";
}

export function handleNewsFetchLive(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    const rawSource = url.searchParams.get("source") ?? "all";
    const rawLimit = url.searchParams.get("limit") ?? String(DEFAULT_LIMIT);

    // Validate source
    if (!VALID_SOURCES.includes(rawSource as Source)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: `Invalid source: "${rawSource}". Must be reuters, bloomberg, cafef, vnexpress, vneconomy, or all.` }));
      return;
    }
    const source = rawSource as Source;

    // Parse and clamp limit — never concatenated into SQL
    const parsedLimit = parseInt(rawLimit, 10);
    const limit = Number.isNaN(parsedLimit)
      ? DEFAULT_LIMIT
      : Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, parsedLimit));

    const sql = buildSql(source);
    const rawRows = db.prepare(sql).all(limit) as RagRow[];

    const rows: ArticleRow[] = rawRows.map((r) => {
      const row: ArticleRow = {
        headline: r.source_title,
        url: r.source_url,
        published_at: r.published_at,
        sentiment: r.sentiment,
        impact_direction: r.impact_direction,
        impact_score: r.impact_score,
        created_at: r.created_at,
      };
      if (source === "all") {
        row._provider = deriveProvider(r.source_url);
      }
      return row;
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, source, count: rows.length, rows }));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  }
}
