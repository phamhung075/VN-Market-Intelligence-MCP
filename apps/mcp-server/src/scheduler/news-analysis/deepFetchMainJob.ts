// deepFetchMainJob.ts — DFR-P2-MCP (Sprint DEEPFETCH-RAG-REDESIGN)
//
// Cron: every 5 min (every-5-min cron expression)
// Config key: CRON_DEEP_FETCH_MAIN / deepFetch.maxPlaywrightPerCycle (default 5)
//
// Drains up to maxPlaywrightPerCycle vps-failed rows from deep_fetch_queue by
// calling the news-fetch microservice Playwright endpoint (Contract B):
//   POST http://localhost:5008/fetch-article { url }
//
// On successful body: writes rag_analyses.body_text + re-indexes LanceDB with
// depth_tier="deep" and id=rag_id+"_deep".
//
// On failure: markExpired (Playwright is heavy — no retry).
//
// Guardrails enforced here:
//   - maxPlaywrightPerCycle cap via pollVpsFailed(db, limit=maxPlaywrightPerCycle)
//   - 4h stale expiry via isStale() inline check
//   - ONLY processes status='vps-failed' rows (never 'pending')
//
// Layer: interface/scheduler — may import from infrastructure.

import { getDb } from "../../infrastructure/db/schema.js";
import { loadMcpConfig } from "../../infrastructure/config.js";
import { logger } from "../../infrastructure/logger.js";
import {
  pollVpsFailed,
  markDone,
  markExpired,
  incrementAttempts,
  isStale,
} from "../../infrastructure/db/deepFetchQueueStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Config helpers (reads from loadMcpConfig() — never hardcoded)
// ─────────────────────────────────────────────────────────────────────────────

function getMaxPlaywrightPerCycle(): number {
  try {
    return loadMcpConfig().deepFetch?.maxPlaywrightPerCycle ?? 5;
  } catch {
    return 5;
  }
}

function getStaleExpiryHours(): number {
  try {
    return loadMcpConfig().deepFetch?.staleExpiryHours ?? 4;
  } catch {
    return 4;
  }
}

function getNewsFetchUrl(): string {
  return Bun.env.NEWS_FETCH_URL ?? "http://localhost:5008";
}

// ─────────────────────────────────────────────────────────────────────────────
// news-fetch fetch-article call (Contract B)
// ─────────────────────────────────────────────────────────────────────────────

interface FetchArticleResponse {
  status: string;
  url?: string;
  body_text?: string;
  published_at?: string;
  reason?: string;
}

async function fetchArticleFromMainServer(
  url: string,
  newsFetchUrl: string,
): Promise<FetchArticleResponse | null> {
  try {
    const response = await fetch(`${newsFetchUrl}/fetch-article`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      logger.debug("[deepFetchMain] HTTP error", { status: response.status, url });
      return null;
    }
    return (await response.json()) as FetchArticleResponse;
  } catch (err) {
    logger.debug("[deepFetchMain] fetch error", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SQLite body_text write + LanceDB re-index
// ─────────────────────────────────────────────────────────────────────────────

function writeBodyText(
  db: ReturnType<typeof getDb>,
  ragId: string,
  bodyText: string,
): void {
  db.prepare(
    `UPDATE rag_analyses SET body_text = ? WHERE id = ?`,
  ).run(bodyText, ragId);
}

interface ShallowMeta {
  level: string | null;
  source_title: string | null;
  summary: string | null;
  tags: string | null;
  affected_actions: string | null;
  published_at: string | null;
  confidence: number | null;
  impact_score: number | null;
}

function fetchShallowMeta(
  db: ReturnType<typeof getDb>,
  ragId: string,
): ShallowMeta | null {
  return db
    .prepare<ShallowMeta, [string]>(
      `SELECT level, source_title, summary, tags, affected_actions,
              published_at, confidence, impact_score
       FROM rag_analyses WHERE id = ?`,
    )
    .get(ragId) ?? null;
}

async function reindexDeep(
  ragId: string,
  domain: string,
  ticker: string | null,
  bodyText: string,
  meta: ShallowMeta | null,
): Promise<void> {
  const { ragIndex } = await import("../../infrastructure/rag/ragHttpClient.js");
  const tags: string[] = (() => {
    try { return JSON.parse(meta?.tags ?? "[]") as string[]; }
    catch { return []; }
  })();
  const affectedActions: string[] = (() => {
    try { return JSON.parse(meta?.affected_actions ?? "[]") as string[]; }
    catch { return []; }
  })();
  const actionCode = affectedActions[0]?.toLowerCase();
  await ragIndex({
    id: ragId + "_deep",
    level: meta?.level ?? "domain",
    title: meta?.source_title ?? "",
    summary: meta?.summary ?? "",
    content: bodyText.slice(0, 4000),
    tags: [...tags, "deep"],
    ...(actionCode !== undefined ? { action_code: actionCode } : {}),
    doc_type: "news",
    depth_tier: "deep",
    source_domain: domain,
    published_at: meta?.published_at ?? "",
    confidence: meta?.confidence ?? 0,
    impact_score: meta?.impact_score ?? 0,
    ticker: ticker ?? "",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Job entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface DeepFetchMainJobResult {
  processed: number;
  done: number;
  expired: number;
}

export interface DeepFetchMainJobDeps {
  db?: ReturnType<typeof getDb>;
  newsFetchUrl?: string;
}

export async function runDeepFetchMainJob(
  deps?: DeepFetchMainJobDeps,
): Promise<DeepFetchMainJobResult> {
  const db = deps?.db ?? getDb();
  const newsFetchUrl = deps?.newsFetchUrl ?? getNewsFetchUrl();
  const maxPerCycle = getMaxPlaywrightPerCycle();
  const staleExpiryHours = getStaleExpiryHours();

  const result: DeepFetchMainJobResult = {
    processed: 0,
    done: 0,
    expired: 0,
  };

  // Only polls vps-failed rows — NEVER pending rows
  const rows = pollVpsFailed(db, maxPerCycle, staleExpiryHours);

  for (const row of rows) {
    result.processed++;

    // Inline stale expiry check
    if (isStale(row, staleExpiryHours)) {
      markExpired(db, row.id);
      result.expired++;
      continue;
    }

    // POST to news-fetch Playwright endpoint (Contract B)
    const resp = await fetchArticleFromMainServer(row.source_url, newsFetchUrl);
    incrementAttempts(db, row.id);

    const bodyText = resp?.body_text ?? "";
    if (!resp || resp.status !== "ok" || !bodyText) {
      // Playwright failure → mark expired (no retry — too heavy)
      markExpired(db, row.id);
      result.expired++;
      logger.debug("[deepFetchMain] expired (playwright failed)", {
        id: row.id,
        url: row.source_url,
        status: resp?.status,
        reason: resp?.reason,
      });
    } else {
      // Write body_text to SQLite
      writeBodyText(db, row.rag_id, bodyText);

      // Re-index into LanceDB with depth_tier="deep"
      try {
        const meta = fetchShallowMeta(db, row.rag_id);
        await reindexDeep(row.rag_id, row.source_domain, row.ticker, bodyText, meta);
      } catch (err) {
        logger.warn("[deepFetchMain] re-index failed (non-fatal)", {
          ragId: row.rag_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      markDone(db, row.id, new Date().toISOString());
      result.done++;

      logger.debug("[deepFetchMain] done", {
        id: row.id,
        domain: row.source_domain,
        bodyLen: bodyText.length,
      });
    }
  }

  if (result.processed > 0) {
    logger.info("[deepFetchMain] cycle complete", result as unknown as Record<string, unknown>);
  }

  return result;
}
