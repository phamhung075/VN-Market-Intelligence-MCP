// deepFetchVpsJob.ts — DFR-P2-MCP (Sprint DEEPFETCH-RAG-REDESIGN)
//
// Cron: every 5 min (every-5-min cron expression)
// Config key: CRON_DEEP_FETCH_VPS / deepFetch.maxPerCycle (default 10)
//
// Drains up to maxPerCycle pending rows from deep_fetch_queue by calling
// the VPS proxy endpoint (Contract A):
//   GET VPS_PROXY_URL/proxy/article-body?url=<encoded>
//
// On successful body: writes rag_analyses.body_text + re-indexes LanceDB
// with depth_tier="deep" and id=rag_id+"_deep".
//
// On empty body or HTTP error: markVpsFailed.
//
// Guardrails enforced here:
//   - maxPerCycle cap via pollPending(db, limit=maxPerCycle)
//   - per-domain daily cap via checkDomainDailyCap()
//   - 4h stale expiry via isStale() inline check
//   - politeness delay 1500-2500 ms between fetches
//
// Layer: interface/scheduler — may import from infrastructure and application.

import { getDb } from "../../infrastructure/db/schema.js";
import { loadMcpConfig } from "../../infrastructure/config.js";
import { logger } from "../../infrastructure/logger.js";
import {
  pollPending,
  markDone,
  markVpsFailed,
  markExpired,
  incrementAttempts,
  checkDomainDailyCap,
  incrementDomainCounter,
  isStale,
} from "../../infrastructure/db/deepFetchQueueStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Config helpers (reads from loadMcpConfig() — never hardcoded)
// ─────────────────────────────────────────────────────────────────────────────

function getMaxPerCycle(): number {
  try {
    return loadMcpConfig().deepFetch?.maxPerCycle ?? 10;
  } catch {
    return 10;
  }
}

function getDomainDailyCap(domain: string): number {
  try {
    return loadMcpConfig().deepFetch?.domainDailyCap?.[domain] ?? 50;
  } catch {
    return 50;
  }
}

function getStaleExpiryHours(): number {
  try {
    return loadMcpConfig().deepFetch?.staleExpiryHours ?? 4;
  } catch {
    return 4;
  }
}

function getVpsProxyUrl(): string {
  return Bun.env.VPS_PROXY_URL ?? "http://125.212.251.27:8765";
}

function humanDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((res) => setTimeout(res, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// VPS fetch (Contract A)
// ─────────────────────────────────────────────────────────────────────────────

interface VpsArticleBodyResponse {
  status: string;
  url?: string;
  source_domain?: string;
  title?: string;
  body_text?: string;
  published_at?: string;
  fetched_at?: string;
  reason?: string;
}

async function fetchFromVps(
  url: string,
  vpsProxyUrl: string,
): Promise<VpsArticleBodyResponse | null> {
  try {
    const endpoint = `${vpsProxyUrl}/proxy/article-body?url=${encodeURIComponent(url)}`;
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      logger.debug("[deepFetchVps] HTTP error", { status: response.status, url });
      return null;
    }
    return (await response.json()) as VpsArticleBodyResponse;
  } catch (err) {
    logger.debug("[deepFetchVps] fetch error", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LanceDB re-index (upsert, NO delete — blueprint §1f)
// ─────────────────────────────────────────────────────────────────────────────

interface RagDeepEntry {
  ragId: string;
  domain: string;
  bodyText: string;
  ticker?: string | null;
  originalData: {
    level?: string;
    title?: string;
    summary?: string;
    tags?: string[];
    actionCode?: string;
    publishedAt?: string;
    confidence?: number;
    impactScore?: number;
  };
}

async function reindexDeep(entry: RagDeepEntry): Promise<void> {
  const { ragIndex } = await import("../../infrastructure/rag/ragHttpClient.js");
  const actionCode = entry.originalData.actionCode;
  await ragIndex({
    id: entry.ragId + "_deep",
    level: entry.originalData.level ?? "domain",
    title: entry.originalData.title ?? "",
    summary: entry.originalData.summary ?? "",
    content: entry.bodyText.slice(0, 4000),
    tags: [...(entry.originalData.tags ?? []), "deep"],
    ...(actionCode !== undefined ? { action_code: actionCode } : {}),
    doc_type: "news",
    depth_tier: "deep",
    source_domain: entry.domain,
    published_at: entry.originalData.publishedAt ?? "",
    confidence: entry.originalData.confidence ?? 0,
    impact_score: entry.originalData.impactScore ?? 0,
    ticker: entry.ticker ?? "",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SQLite body_text write
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

// ─────────────────────────────────────────────────────────────────────────────
// Fetch shallow metadata for re-index (best-effort)
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Job entry point
// ─────────────────────────────────────────────────────────────────────────────

export interface DeepFetchVpsJobResult {
  processed: number;
  done: number;
  failed: number;
  expired: number;
  skippedCap: number;
}

export interface DeepFetchVpsJobDeps {
  db?: ReturnType<typeof getDb>;
  vpsProxyUrl?: string;
}

export async function runDeepFetchVpsJob(
  deps?: DeepFetchVpsJobDeps,
): Promise<DeepFetchVpsJobResult> {
  const db = deps?.db ?? getDb();
  const vpsProxyUrl = deps?.vpsProxyUrl ?? getVpsProxyUrl();
  const maxPerCycle = getMaxPerCycle();
  const staleExpiryHours = getStaleExpiryHours();

  const result: DeepFetchVpsJobResult = {
    processed: 0,
    done: 0,
    failed: 0,
    expired: 0,
    skippedCap: 0,
  };

  const rows = pollPending(db, maxPerCycle, staleExpiryHours);
  const rowCount = rows.length;

  for (let i = 0; i < rowCount; i++) {
    const row = rows[i]!;
    result.processed++;

    // Inline stale check (belt-and-suspenders: pollPending already filters,
    // but queued_at strings may lack timezone suffix on some rows)
    if (isStale(row, staleExpiryHours)) {
      markExpired(db, row.id);
      result.expired++;
      continue;
    }

    // Per-domain daily cap check
    const cap = getDomainDailyCap(row.source_domain);
    if (!checkDomainDailyCap(db, row.source_domain, cap)) {
      result.skippedCap++;
      logger.debug("[deepFetchVps] domain cap reached", {
        domain: row.source_domain,
        cap,
      });
      continue;
    }

    // Fetch from VPS (Contract A)
    const vpsResp = await fetchFromVps(row.source_url, vpsProxyUrl);
    incrementAttempts(db, row.id);

    const bodyText = vpsResp?.body_text ?? "";
    if (!vpsResp || vpsResp.status !== "ok" || !bodyText) {
      markVpsFailed(db, row.id);
      result.failed++;
      logger.debug("[deepFetchVps] vps-failed", {
        id: row.id,
        url: row.source_url,
        status: vpsResp?.status,
        reason: vpsResp?.reason,
      });
    } else {
      // Write body_text to SQLite
      writeBodyText(db, row.rag_id, bodyText);

      // Re-index into LanceDB with depth_tier="deep" (NO delete, _deep suffix)
      try {
        const meta = fetchShallowMeta(db, row.rag_id);
        const tags: string[] = (() => {
          try { return JSON.parse(meta?.tags ?? "[]") as string[]; }
          catch { return []; }
        })();
        const affectedActions: string[] = (() => {
          try { return JSON.parse(meta?.affected_actions ?? "[]") as string[]; }
          catch { return []; }
        })();
        const actionCode0 = affectedActions[0]?.toLowerCase();
        await reindexDeep({
          ragId: row.rag_id,
          domain: row.source_domain,
          bodyText,
          ticker: row.ticker,
          originalData: {
            level: meta?.level ?? "domain",
            title: meta?.source_title ?? "",
            summary: meta?.summary ?? "",
            tags,
            ...(actionCode0 !== undefined ? { actionCode: actionCode0 } : {}),
            publishedAt: meta?.published_at ?? "",
            confidence: meta?.confidence ?? 0,
            impactScore: meta?.impact_score ?? 0,
          },
        });
      } catch (err) {
        logger.warn("[deepFetchVps] re-index failed (non-fatal)", {
          ragId: row.rag_id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      markDone(db, row.id, new Date().toISOString());
      incrementDomainCounter(db, row.source_domain);
      result.done++;

      logger.debug("[deepFetchVps] done", {
        id: row.id,
        domain: row.source_domain,
        bodyLen: bodyText.length,
      });
    }

    // Politeness delay between fetches (skip after last row)
    if (i < rows.length - 1) {
      await humanDelay(1500, 2500);
    }
  }

  if (result.processed > 0 || result.skippedCap > 0) {
    logger.info("[deepFetchVps] cycle complete", result as unknown as Record<string, unknown>);
  }

  return result;
}
