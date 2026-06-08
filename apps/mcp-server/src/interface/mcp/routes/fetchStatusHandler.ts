/**
 * Interface — GET /api/fetch-status
 *
 * Aggregated fetch operations status for the dashboard enrich panel.
 * Returns per-source article freshness, VPS proxy health, and BCTC queue counts.
 *
 * Response shape:
 *   {
 *     sources: [
 *       {
 *         id: string,           // source slug, e.g. "cafef"
 *         lastArticleAt: string | null,  // ISO timestamp of most-recent article
 *         ageMs: number | null,          // ms since lastArticleAt, or null
 *         count24h: number,              // articles inserted in last 24h
 *         status: "fresh" | "stale" | "no-data"
 *       }
 *     ],
 *     vpsProxy: {
 *       [service: string]: {
 *         last_push: string | null,
 *         stale: boolean,
 *         pushes_24h: number,
 *         errors_24h: number
 *       }
 *     },
 *     bctcPipeline: {
 *       pending: number,
 *       done: number,
 *       failed: number,
 *       deferred_infra: number,        // historical HIST-VPS-BACKFILL rows; sources gone/geo-dead
 *       blocked_pdf_extractor: number  // gated on A-20 architect fix (CPU-cgroup starvation)
 *     },
 *     fetchedAt: string   // ISO timestamp when this response was assembled
 *   }
 *
 * Staleness thresholds:
 *   fresh   — ageMs < 2h  (< 7_200_000 ms)
 *   stale   — ageMs 2h–12h
 *   no-data — lastArticleAt null
 *
 * Data sources:
 *   - sources[]     : rag_analyses table, GROUP BY source slug
 *   - vpsProxy{}    : getVpsProxyHealth() from vpsPushLogStore.ts
 *   - bctcPipeline{}: bctc_vps_queue table status counts
 *
 * Guard: source_url IS NOT NULL enforced in SQL WHERE clause (R-5).
 * DI contract: db injected by caller (server.ts). No getDb() here.
 * DDD Layer: interface/http (consistent with vpsProxyHealthHandler.ts).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { getVpsProxyHealth } from "../../../infrastructure/db/vpsPushLogStore.js";

// Age thresholds in milliseconds
const FRESH_THRESHOLD_MS = 2 * 60 * 60 * 1000;   // 2 hours
const STALE_THRESHOLD_MS = 12 * 60 * 60 * 1000;  // 12 hours (beyond = very stale, still "stale")

/**
 * Source slugs that are permanently retired and must be excluded from the
 * fetch-status serving surface.  These IDs no longer have live fetchers and
 * would otherwise appear as permanent VERY-STALE noise in the dashboard.
 *
 * Historical DB rows for these sources are preserved — only the enumeration
 * layer (the HAVING clause in querySourceAges) is changed.
 *
 * Dead-source rationale (CLEAN-DEAD-SOURCE-IDS):
 *   news       — bare "news" slug from legacy hostname pattern; no live fetcher.
 *   cafef1     — retired alternate domain cafef1.vn; replaced by cafef.vn.
 *   vnexpress1 — retired alternate domain vnexpress1.net.
 *   shared-url — synthetic slug from stale push-pipeline format bugs; no live producer.
 *   vnbusiness — vnbusiness.vn RSS; VPS fetcher retired.
 *   vietnambiz — vietnambiz.vn RSS; VPS fetcher retired.
 */
export const DEAD_SOURCE_SLUGS: ReadonlyArray<string> = [
  "news",
  "cafef1",
  "vnexpress1",
  "shared-url",
  "vnbusiness",
  "vietnambiz",
];

/**
 * Derive a human-readable source slug from a URL.
 * e.g. "https://cafef.vn/..." → "cafef"
 *      "https://www.vnexpress.net/..." → "vnexpress"
 * Returns null for malformed/null URLs.
 */
export function deriveSourceSlug(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    // Strip "www." prefix
    const clean = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
    // Take first segment before "." (e.g. "cafef.vn" → "cafef")
    const slug = clean.split(".")[0];
    return slug && slug.length > 0 ? slug : null;
  } catch {
    return null;
  }
}

/**
 * Compute freshness status from ageMs.
 */
export function computeFreshnessStatus(ageMs: number | null): "fresh" | "stale" | "no-data" {
  if (ageMs === null) return "no-data";
  if (ageMs < FRESH_THRESHOLD_MS) return "fresh";
  return "stale";
}

interface SourceAgeRow {
  source_slug: string;
  last_article_at: string;
  count_24h: number;
}

interface BctcQueueCounts {
  pending: number;
  done: number;
  failed: number;
  /** Historical HIST-VPS-BACKFILL rows; sources gone/geo-dead; non-actionable by design. */
  deferred_infra: number;
  /** Q1-2026 rows gated on A-20 architect fix (pdf-extractor CPU-cgroup starvation). */
  blocked_pdf_extractor: number;
}

/**
 * Query per-source article freshness from rag_analyses.
 *
 * Groups by source slug (derived via SQLite substr/instr pattern).
 * Only rows with non-null source_url are included (R-5 guard).
 *
 * NOTE: SQLite lacks regex; we use a best-effort slug extraction:
 *   1. Strip leading "https://" or "http://"
 *   2. Strip "www." prefix if present
 *   3. Take chars up to first "."
 * This covers all VN news sources (cafef.vn, vnexpress.net, etc.).
 */
function querySourceAges(db: Database, now: Date): SourceAgeRow[] {
  // Extract slug: take part of host before first "."
  // source_url format: "https://cafef.vn/...", "https://www.vnexpress.net/..."
  // Step 1: strip scheme → "cafef.vn/..." or "www.vnexpress.net/..."
  // Step 2: strip "www." if present
  // Step 3: take substring up to first "."
  //
  // SQLite expression:
  //   CASE WHEN stripped LIKE 'www.%'
  //     THEN substr(stripped, 5, instr(substr(stripped,5), '.') - 1)
  //     ELSE substr(stripped, 1, instr(stripped, '.') - 1)
  //   END
  // where stripped = substr(source_url, instr(source_url, '//') + 2)
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const sql = `
    SELECT
      CASE
        WHEN substr(source_url, instr(source_url, '//') + 2) LIKE 'www.%'
          THEN substr(
                 substr(source_url, instr(source_url, '//') + 2 + 4),
                 1,
                 instr(substr(source_url, instr(source_url, '//') + 2 + 4), '.') - 1
               )
        ELSE substr(
               substr(source_url, instr(source_url, '//') + 2),
               1,
               instr(substr(source_url, instr(source_url, '//') + 2), '.') - 1
             )
      END AS source_slug,
      MAX(created_at) AS last_article_at,
      COUNT(CASE WHEN created_at >= ? THEN 1 END) AS count_24h
    FROM rag_analyses
    WHERE source_url IS NOT NULL
      AND source_url LIKE 'http%'
    GROUP BY source_slug
    HAVING source_slug IS NOT NULL
      AND source_slug != ''
      AND source_slug NOT IN (${DEAD_SOURCE_SLUGS.map(() => "?").join(",")})
    ORDER BY last_article_at DESC
  `;

  // Parameters: cutoff (for count_24h) + all 6 dead source slug values for NOT IN
  return db.prepare(sql).all(cutoff, ...DEAD_SOURCE_SLUGS) as SourceAgeRow[];
}

/**
 * Query BCTC VPS queue counts by status.
 *
 * Includes explicit non-actionable statuses introduced by FIX-BCTC-VPS-QUEUE-STALE-TRIAGE:
 *   deferred_infra        — historical HIST-VPS-BACKFILL rows; sources geo-dead; not retryable.
 *   blocked_pdf_extractor — Q1-2026 rows gated on A-20 architect fix; re-queue after arch fix.
 * C-16 auditor check counts only `pending` rows >72h; non-actionable rows excluded by their status.
 */
function queryBctcCounts(db: Database): BctcQueueCounts {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'pending'               THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'done'                  THEN 1 ELSE 0 END) AS done,
         SUM(CASE WHEN status = 'failed'                THEN 1 ELSE 0 END) AS failed,
         SUM(CASE WHEN status = 'deferred_infra'        THEN 1 ELSE 0 END) AS deferred_infra,
         SUM(CASE WHEN status = 'blocked_pdf_extractor' THEN 1 ELSE 0 END) AS blocked_pdf_extractor
       FROM bctc_vps_queue`,
    )
    .get() as {
      pending: number | null;
      done: number | null;
      failed: number | null;
      deferred_infra: number | null;
      blocked_pdf_extractor: number | null;
    } | null;

  return {
    pending: row?.pending ?? 0,
    done: row?.done ?? 0,
    failed: row?.failed ?? 0,
    deferred_infra: row?.deferred_infra ?? 0,
    blocked_pdf_extractor: row?.blocked_pdf_extractor ?? 0,
  };
}

export function handleFetchStatus(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
): void {
  try {
    // 1. Per-source article freshness
    const sourceRows = querySourceAges(db, now);
    const sources = sourceRows.map((row) => {
      const ageMs = row.last_article_at
        ? now.getTime() - new Date(row.last_article_at).getTime()
        : null;
      return {
        id: row.source_slug,
        lastArticleAt: row.last_article_at ?? null,
        ageMs,
        count24h: row.count_24h,
        status: computeFreshnessStatus(ageMs),
      };
    });

    // 2. VPS proxy health (reuse existing store function)
    const vpsRaw = getVpsProxyHealth(db);
    const vpsProxy: Record<string, { last_push: string | null; stale: boolean; pushes_24h: number; errors_24h: number }> = {};
    for (const svc of vpsRaw) {
      const ageMs = svc.lastPushAt ? now.getTime() - new Date(svc.lastPushAt).getTime() : null;
      // Use 2h threshold for vpsProxy stale (consistent with sources freshness)
      const stale = ageMs === null ? true : ageMs > FRESH_THRESHOLD_MS;
      vpsProxy[svc.service] = {
        last_push: svc.lastPushAt,
        stale,
        pushes_24h: svc.pushes24h,
        errors_24h: svc.errors24h ?? 0,
      };
    }

    // 3. BCTC pipeline counts
    const bctcPipeline = queryBctcCounts(db);

    const body = {
      sources,
      vpsProxy,
      bctcPipeline,
      fetchedAt: now.toISOString(),
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
