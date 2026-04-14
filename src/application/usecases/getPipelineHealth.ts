/**
 * getPipelineHealth — application use case
 *
 * Returns a point-in-time diagnostic snapshot of the news pipeline:
 *   - rag_analyses row counts for today/yesterday (GMT+7 boundary)
 *   - last insert timestamp + staleness in minutes
 *   - per-source hostname breakdown (today's rows)
 *   - VPS push count (last 24h, null if table absent)
 *   - evening report last mtime (filesystem)
 *
 * All external I/O is injectable for testing:
 *   db, nowMs, reportsDir
 *
 * Spec: docs/TECH_075.md
 * Task: 1189
 */

import type { Database } from "bun:sqlite";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../../infrastructure/logger.js";

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface GetPipelineHealthOptions {
  /** Current epoch ms. Injected in tests; defaults to Date.now() in production. */
  nowMs?: number;
  /** SQLite handle. Injected in tests; defaults to getDb() lazy-loaded in production. */
  db?: Database;
  /** Absolute path to the reports directory. Injected in tests; defaults to process.cwd() + "/reports". */
  reportsDir?: string;
}

export interface PipelineHealthResult {
  /** ISO 8601 timestamp of when this snapshot was taken. */
  generatedAt: string;

  ragRows: {
    /** Row count in rag_analyses inserted today (GMT+7 day boundary). */
    today: number;
    /** Row count in rag_analyses inserted yesterday (GMT+7 day boundary). */
    yesterday: number;
    /** ISO 8601 timestamp of the most recent row, or null if table is empty. */
    lastInsertedAt: string | null;
    /** Minutes since lastInsertedAt, clamped to >= 0, or null if no rows exist. */
    staleMins: number | null;
  };

  /** Per-source breakdown of today's rows, sorted by count DESC. Empty array if no rows today. */
  sources: Array<{
    source: string;   // hostname e.g. "cafef.vn" or "(unknown)"
    count: number;
  }>;

  /**
   * Count of successful news pushes from vps_push_log in the last 24h.
   * null means the vps_push_log table does not exist yet (pre-production).
   * 0 means the table exists but no ok pushes in 24h (pipeline failure signal).
   */
  vpsPushLast24h: number | null;

  /** ISO 8601 mtime of the newest reports/*-evening.json file, or null if none exist. */
  eveningReportLastRun: string | null;
}

// ── Internal row types ────────────────────────────────────────────────────────

interface CountRow { cnt: number }
interface CreatedAtRow { created_at: string }
interface SourceUrlRow { source_url: string | null }

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDomain(sourceUrl: string | null | undefined): string {
  if (!sourceUrl) return "(unknown)";
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "(unknown)";
  }
}

function getEveningReportLastRun(reportsDir: string): string | null {
  try {
    const entries = readdirSync(reportsDir)
      .filter((f) => f.endsWith("-evening.json"))
      .map((f) => ({ f, mtime: statSync(join(reportsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return entries.length > 0 ? new Date(entries[0]!.mtime).toISOString() : null;
  } catch {
    return null;
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function getPipelineHealth(
  options: GetPipelineHealthOptions = {},
): Promise<PipelineHealthResult> {
  // Resolve DB lazily (mirrors assembleEveningSummary.ts pattern)
  const db =
    options.db ??
    (await (async () => {
      const { getDb } = await import("../../infrastructure/db/schema.js");
      return getDb();
    })());

  const nowMs = options.nowMs ?? Date.now();
  const reportsDir = options.reportsDir ?? join(process.cwd(), "reports");

  // ── GMT+7 day boundary ─────────────────────────────────────────────────────
  const OFFSET_MS = 7 * 3600 * 1000;
  const todayStartUtcMs =
    Math.floor((nowMs + OFFSET_MS) / 86_400_000) * 86_400_000 - OFFSET_MS;
  const yesterdayStartUtcMs = todayStartUtcMs - 86_400_000;
  const todayStartIso = new Date(todayStartUtcMs).toISOString();
  const yesterdayStartIso = new Date(yesterdayStartUtcMs).toISOString();

  // ── FR-1: Row counts (today + yesterday) ──────────────────────────────────
  const todayRow = db.query<CountRow, [string]>(
    "SELECT COUNT(*) AS cnt FROM rag_analyses WHERE created_at >= ?",
  ).get(todayStartIso);

  const yesterdayRow = db.query<CountRow, [string, string]>(
    "SELECT COUNT(*) AS cnt FROM rag_analyses WHERE created_at >= ? AND created_at < ?",
  ).get(yesterdayStartIso, todayStartIso);

  // ── FR-2: Last insert + staleness ─────────────────────────────────────────
  const lastRow = db.query<CreatedAtRow, []>(
    "SELECT created_at FROM rag_analyses ORDER BY created_at DESC LIMIT 1",
  ).get();

  const lastMs = lastRow ? Date.parse(lastRow.created_at) : null;
  const staleMins = lastMs !== null
    ? Math.max(0, Math.floor((nowMs - lastMs) / 60_000))
    : null;

  // ── FR-3: Per-source breakdown (today's rows) ──────────────────────────────
  const sourceRows = db.query<SourceUrlRow, [string]>(
    "SELECT source_url FROM rag_analyses WHERE created_at >= ?",
  ).all(todayStartIso);

  const domainMap = new Map<string, number>();
  for (const row of sourceRows) {
    const domain = extractDomain(row.source_url);
    domainMap.set(domain, (domainMap.get(domain) ?? 0) + 1);
  }
  const sources = Array.from(domainMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  // ── FR-4: VPS push count (last 24h) — safety pattern ──────────────────────
  let vpsPushLast24h: number | null;
  const since24hIso = new Date(nowMs - 24 * 3_600_000).toISOString();
  try {
    const vpsRow = db.query<CountRow, [string]>(
      `SELECT COUNT(*) AS cnt
       FROM vps_push_log
       WHERE service = 'news'
         AND status  = 'ok'
         AND pushed_at >= ?`,
    ).get(since24hIso);
    vpsPushLast24h = vpsRow?.cnt ?? 0;
  } catch {
    // Table does not exist yet — pre-production environment.
    vpsPushLast24h = null;
    logger.warn("[getPipelineHealth] vps_push_log not found — returning null");
  }

  // ── FR-5: Evening report last mtime (filesystem) ───────────────────────────
  const eveningReportLastRun = getEveningReportLastRun(reportsDir);

  return {
    generatedAt: new Date(nowMs).toISOString(),
    ragRows: {
      today: todayRow?.cnt ?? 0,
      yesterday: yesterdayRow?.cnt ?? 0,
      lastInsertedAt: lastRow?.created_at ?? null,
      staleMins,
    },
    sources,
    vpsPushLast24h,
    eveningReportLastRun,
  };
}
