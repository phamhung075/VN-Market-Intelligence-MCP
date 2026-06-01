/**
 * Task 083 — Analysis MCP Tools
 *
 * Interface layer: registers three MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. fetch_and_analyze       — fetch RSS from all sources, normalize, store in SQLite + RAG
 *   2. run_impact_chain        — run causal cascade engine on a news headline
 *   3. search_similar_context  — RAG semantic search for similar past analyses
 *                                (Task 1107: recency_days parameter, recency_weight re-ranking)
 *
 * All tools call `initDatabase()` lazily on first use so the module can be
 * imported without side effects.
 *
 * @module interface/mcp/tools/analysis
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
// G5-INVERSE REMEDIATION (P1-F): appendKinhDich replaced with HTTP client call.
// kinhDichWrapper.ts is DEPRECATED — callers must use kinh-dich-service:5005 via clients.ts.
import { getKinhDichReading } from "../../../../infrastructure/microservices/clients.js";
import { fetchCafeF } from "../../../../infrastructure/fetchers/cafef.js";
import { fetchVnExpress } from "../../../../infrastructure/fetchers/vnexpress.js";
// fetchReuters removed — rewired to news-fetch microservice HTTP (G5b, Phase 1)
// See: apps/mcp-server/src/_deprecated/fetchers/reuters.ts for rollback reference
import type { RssItem } from "../../../../infrastructure/fetchers/rss.js";
import { fetchVnEconomy } from "../../../../infrastructure/fetchers/vneconomy.js";
import { normalizeNews } from "../../../../domain/services/newsNormalizer.js";
import { runImpactChain } from "../../../../application/usecases/runImpactChain.js";
// G5b (P2-F): rewired from direct LanceDB retriever.ts → HTTP client ragHttpClient.ts
// rag-service (port 5002) is now the single LanceDB writer (R-1 resolved).
import { ragSearch, ragIndex } from "../../../../infrastructure/rag/ragHttpClient.js";
import type { RagSearchResultDTO } from "../../../../infrastructure/rag/ragHttpClient.js";
import type { SearchResult } from "../../../../domain/models/shared-types.js";
import { applyRecencyWeighting } from "../../../../domain/services/recencyWeighter.js";
import type { WatchlistEntry } from "../../../../domain/services/cascadeEngine.js";
import type { DomainType } from "../../../../../bctc-schema.js";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row type for watchlist queries
// ─────────────────────────────────────────────────────────────────────────────

interface WatchlistRow {
  code: string;
  exchange: string;
  domain: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// G5-inverse: HTTP-routed kinh-dich block formatter
// Replaces appendKinhDich() which was reading from local SQLite (G5 violation).
// Now routes via kinh-dich-service:5005 via clients.ts.
//
// TSH-6 (honest-omit): two distinct failure paths:
//   - service-down (throw / non-200) → OMIT block entirely, log warn
//   - genuine data-short (200 OK, empty/null hexagram fields) → honest VN line
// ─────────────────────────────────────────────────────────────────────────────

/** Honest Vietnamese fallback: only emitted when the service is UP but data is insufficient. */
const KINH_DICH_DATA_SHORT_ANALYSIS = "\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ.";

/** Append per-stock hexagram reading to baseOutput via HTTP (replaces appendKinhDich). */
async function appendStockHexagramHttp(code: string, baseOutput: string): Promise<string> {
  if (!code) return baseOutput;
  try {
    const reading = await getKinhDichReading(code, 30);
    // Genuine data-short: service reachable but no valid hexagram returned.
    if (!reading.hexagram || !reading.name) {
      return baseOutput + KINH_DICH_DATA_SHORT_ANALYSIS;
    }
    const confStr = reading.confidence != null && !isNaN(reading.confidence)
      ? `${Math.round(reading.confidence * 100)}%` : "";
    const block = [
      `\n---`,
      `Kinh Dịch: ${reading.name} (${reading.hexagram}) — ${reading.signal}`,
      ...(confStr ? [`Độ tin cậy: ${confStr}`] : []),
    ].join("\n");
    return baseOutput + block;
  } catch (error) {
    // Service-down (ECONNREFUSED, timeout, non-200): omit block entirely.
    logger.warn("[kinhdich] service unreachable — omitting hexagram block", {
      fn: "appendStockHexagramHttp",
      code,
      error: error instanceof Error ? error.message : String(error),
    });
    return baseOutput;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a single analysis entry for display.
 */
function formatAnalysisEntry(entry: ReturnType<typeof normalizeNews>): string {
  const sentimentIcon: Record<string, string> = {
    bullish: "[BULLISH]",
    bearish: "[BEARISH]",
    neutral: "[NEUTRAL]",
  };

  const icon = sentimentIcon[entry.sentiment] ?? `[${entry.sentiment.toUpperCase()}]`;
  const ts = entry.publishedAt.slice(0, 16);
  const domains = entry.affectedDomains.join(", ") || "—";
  const actions = entry.affectedActions.join(", ") || "—";

  return [
    `[${entry.level.toUpperCase()}] ${icon} ${ts} | impact: ${entry.impactScore}/10 ${entry.impactDirection}`,
    `  Source  : ${entry.sourceTitle}`,
    `  Domains : ${domains}`,
    `  Stocks  : ${actions}`,
    `  Summary : ${entry.summary.slice(0, 120)}${entry.summary.length > 120 ? "…" : ""}`,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the three analysis MCP tools on a McpServer instance.
 *
 * @param server - The McpServer instance to register tools on.
 */
export function registerAnalysisTools(server: McpServer): void {

  // ── 1. fetch_and_analyze ──────────────────────────────────────────────────
  server.tool(
    "fetch_and_analyze",
    "Fetch live news from RSS sources (CafeF, VnExpress, Reuters/AP News), " +
      "normalize each item into a structured AnalysisEntry, store in SQLite RAG memory and vector store, " +
      "and return a formatted summary of the market intelligence gathered. " +
      "Source tier: 2 (aggregator — all 4 RSS sources are news aggregators; no official government source).",
    {
      sources: z
        .array(z.enum(["cafef", "vnexpress", "reuters", "vneconomy"]))
        .default(["cafef", "vnexpress", "reuters", "vneconomy"])
        .describe("Which RSS sources to fetch from (default: all four)"),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe("Maximum total number of news items to analyze (default: 20)"),
    },
    async ({ sources, limit }) => {

      try {
        await initDatabase();
        const db = getDb();

        // ── Step 1: Fetch from all requested sources in parallel ─────────────
        // REC-1 (FA-FIX P0): per-source outer timeout budgets — each source is
        //   wrapped in Promise.race with a fallback-to-[] sentinel so a slow or
        //   dead upstream never holds the whole batch hostage.
        //   cafef=10s, vnexpress=10s, vneconomy=12s (2 serial feeds), reuters=15s.
        // REC-2 (FA-FIX P0): Promise.allSettled replaces Promise.all — a
        //   rejected/timed-out slot logs and contributes [] while others continue.

        /**
         * Wraps a fetch promise with a per-source outer timeout budget.
         * On timeout the source contributes an empty array (same as a network error).
         */
        function withSourceTimeout(
          promise: Promise<RssItem[]>,
          budgetMs: number,
          sourceName: string,
        ): Promise<RssItem[]> {
          const timeout = new Promise<RssItem[]>((resolve) =>
            setTimeout(() => {
              logger.warn(`[fetch_and_analyze] source timeout — ${sourceName} exceeded ${budgetMs}ms budget`, {
                source: sourceName,
                budgetMs,
              });
              resolve([]);
            }, budgetMs),
          );
          return Promise.race([promise, timeout]);
        }

        const fetchPromises: Promise<RssItem[]>[] = [];

        if (sources.includes("cafef")) {
          fetchPromises.push(withSourceTimeout(fetchCafeF(), 10_000, "cafef"));
        }
        if (sources.includes("vnexpress")) {
          fetchPromises.push(withSourceTimeout(fetchVnExpress(), 10_000, "vnexpress"));
        }
        if (sources.includes("reuters")) {
          // G5b HTTP rewire: delegate to news-fetch microservice (local Docker network).
          // REC-1: tightened from 30_000 → 15_000 (news-fetch is a local Docker call,
          //         not a geo-blocked external API; 30s was too generous).
          const NEWS_FETCH_BASE = Bun.env['NEWS_FETCH_URL'] ?? 'http://news-fetch:5008';
          const reutersFetch = fetch(`${NEWS_FETCH_BASE}/reuters/headlines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ maxItems: limit }),
            signal: AbortSignal.timeout(15_000),
          })
            .then((res) => res.json() as Promise<{ articles: Array<{ headline: string; url: string | null; publishedAt: string | null; source: string }> }>)
            .then((data): RssItem[] =>
              (data.articles ?? []).map((a) => ({
                title: a.headline,
                url: a.url ?? '',
                publishedAt: a.publishedAt ?? '',
                content: '',
                source: 'reuters',
              }))
            )
            .catch((err): RssItem[] => {
              logger.warn('[fetch_and_analyze] news-fetch reuters HTTP call failed', {
                error: err instanceof Error ? err.message : String(err),
              });
              return [];
            });
          // Outer 15s budget on top of the AbortSignal (belt-and-suspenders).
          fetchPromises.push(withSourceTimeout(reutersFetch, 15_000, "reuters"));
        }
        if (sources.includes("vneconomy")) {
          // vneconomy runs 2 RSS feeds serially inside fetchVnEconomy — budget the pair.
          fetchPromises.push(withSourceTimeout(fetchVnEconomy(), 12_000, "vneconomy"));
        }

        // REC-2 (FA-FIX P0): allSettled — rejected/timed-out slots contribute []
        const settled = await Promise.allSettled(fetchPromises);
        const rejectedSources = settled
          .map((r, i) => (r.status === "rejected" ? i : -1))
          .filter((i) => i >= 0);
        if (rejectedSources.length > 0) {
          logger.warn("[fetch_and_analyze] some sources rejected", {
            rejectedCount: rejectedSources.length,
          });
        }
        const allItems = settled
          .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
          .slice(0, limit);

        if (allItems.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({
                  source_tier: 2 as const,
                  text: `No news items fetched from sources: ${sources.join(", ")}.\nThis may be due to network unavailability or empty feeds.`,
                  fetchedAt: new Date().toISOString(),
                }, null, 2),
              },
            ],
          };
        }

        // ── Step 2: Normalize each item → AnalysisEntry ──────────────────────
        const entries = allItems.map((item) => normalizeNews(item));

        // ── Step 3: Persist to rag_analyses (SQLite) ─────────────────────────
        const insert = db.prepare(
          `INSERT OR IGNORE INTO rag_analyses
             (id, created_at, level, source_url, source_title, source_type,
              published_at, sentiment, impact_score, impact_direction, confidence,
              time_horizon, summary, reasoning,
              affected_countries, affected_domains, affected_actions, parent_ids, tags)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        for (const entry of entries) {
          try {
            insert.run(
              entry.id,
              entry.createdAt,
              entry.level,
              entry.sourceUrl,
              entry.sourceTitle,
              entry.sourceType,
              entry.publishedAt,
              entry.sentiment,
              entry.impactScore,
              entry.impactDirection,
              entry.confidence,
              entry.timeHorizon,
              entry.summary,
              entry.reasoning,
              JSON.stringify(entry.affectedCountries),
              JSON.stringify(entry.affectedDomains),
              JSON.stringify(entry.affectedActions),
              JSON.stringify(entry.parentIds),
              JSON.stringify(entry.tags),
            );
          } catch (dbErr) {
            logger.warn("[fetch_and_analyze] SQLite insert failed for entry", {
              id: entry.id,
              error: dbErr instanceof Error ? dbErr.message : String(dbErr),
            });
          }
        }

        // ── Step 4: Insert into vector store (best-effort, parallel) ─────────
        // Sprint 053 / report 1026: serial inserts of 30 items at ~2s each
        // (embedding + LanceDB write) blew the MCP 60s timeout. Run them in
        // parallel — the embedding model + LanceDB tolerate concurrent calls
        // and the wall-clock collapses to roughly the slowest single insert.
        //
        // REC-3 (FA-FIX P1): switched from Promise.all → Promise.allSettled so
        //   a single ragIndex timeout (AbortSignal 8s in ragHttpClient) degrades
        //   gracefully — the other entries continue and the SQLite rows are
        //   already committed. An OOM rag-service restart cannot stall this step.
        const ragSettled = await Promise.allSettled(
          entries.map(async (entry) => {
            // G5b: ragIndex delegates to rag-service HTTP /index (port 5002)
            // AbortSignal.timeout(8_000) is now set inside ragHttpClient.ts (REC-3).
            await ragIndex({
              id: entry.id,
              content: entry.summary,
              tags: entry.tags,
              level: entry.level,
              title: entry.sourceTitle,
              summary: entry.summary,
              ...(entry.affectedActions.length > 0
                ? { action_code: entry.affectedActions[0] }
                : {}),
            });
          }),
        );
        const ragFailCount = ragSettled.filter((r) => r.status === "rejected").length;
        if (ragFailCount > 0) {
          logger.warn("[fetch_and_analyze] some RAG index calls failed (degraded gracefully)", {
            failed: ragFailCount,
            total: entries.length,
          });
        }

        // ── Step 5: Format output ─────────────────────────────────────────────
        const header = `Analysis — ${entries.length} item${entries.length !== 1 ? "s" : ""} fetched and analyzed`;
        const lines = [header, "", ...entries.map(formatAnalysisEntry)];

        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            source_tier: 2 as const,
            text: lines.join("\n"),
            fetchedAt: new Date().toISOString(),
          }, null, 2) }],
        };
      } catch (err) {
        logger.error("[fetch_and_analyze] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                source_tier: 2 as const,
                error: `Error fetching and analyzing news: ${(err as Error).message}`,
              }, null, 2),
            },
          ],
        };
      }
    },
  );

  // ── 2. run_impact_chain ───────────────────────────────────────────────────
  server.tool(
    "run_impact_chain",
    "Run the causal cascade engine on a news headline or event text. " +
      "Traces the impact from global/macro level down through affected sectors " +
      "to specific stocks in your watchlist. Returns the full reasoning chain " +
      "with confidence scores at each level.",
    {
      newsText: z
        .string()
        .min(1)
        .max(500)
        .describe("Event or news headline to analyze (Vietnamese or English)"),
      includeWatchlist: z
        .boolean()
        .default(true)
        .describe("Whether to include watchlist stocks in the impact chain (default: true)"),
    },
    async ({ newsText, includeWatchlist: includeWatchlistRaw }) => {
      const includeWatchlist = includeWatchlistRaw ?? true;

      try {
        await initDatabase();
        const db = getDb();

        // ── Step 1: Build watchlist ───────────────────────────────────────────
        let watchlist: WatchlistEntry[] = [];

        if (includeWatchlist) {
          const rows = db
            .prepare("SELECT code, exchange, domain FROM watchlist")
            .all() as WatchlistRow[];

          watchlist = rows.map((row) => ({
            actionCode: row.code,
            domain: row.domain as DomainType,
            exchange: row.exchange,
          }));
        }

        // ── Step 2: Run cascade ───────────────────────────────────────────────
        const chain = await runImpactChain({ newsText, watchlist });

        // ── Step 3: Format output ─────────────────────────────────────────────
        const lines: string[] = [
          `=== Causal Chain — ${chain.seedTitle.slice(0, 80)} ===`,
          `ID: ${chain.id}`,
          `Created: ${chain.createdAt.slice(0, 16)}`,
          "",
        ];

        if (chain.entries.length === 0) {
          lines.push("No causal chain entries generated.");
        } else {
          lines.push(`--- Chain Entries (${chain.entries.length}) ---`);
          for (const entry of chain.entries) {
            const sentimentIcon: Record<string, string> = {
              bullish: "[BULLISH]",
              bearish: "[BEARISH]",
              neutral: "[NEUTRAL]",
            };
            const icon = sentimentIcon[entry.sentiment] ?? `[${entry.sentiment.toUpperCase()}]`;
            const domains = entry.affectedDomains.join(", ") || "—";
            const actions = entry.affectedActions.join(", ") || "—";

            lines.push(`[${entry.level.toUpperCase()}] ${icon} ${entry.title}`);
            lines.push(`  Domains : ${domains}`);
            lines.push(`  Stocks  : ${actions}`);
            lines.push(`  Impact  : ${entry.impactScore}/10 | Confidence: ${(entry.confidence * 100).toFixed(0)}%`);
            lines.push(`  Reason  : ${entry.reasoning.slice(0, 200)}${entry.reasoning.length > 200 ? "…" : ""}`);
            lines.push("");
          }
        }

        if (chain.watchlistImpacts.length > 0) {
          lines.push(`--- Watchlist Impacts (${chain.watchlistImpacts.length} stocks) ---`);
          for (const impact of chain.watchlistImpacts) {
            const directionIcon: Record<string, string> = {
              up: "[UP]",
              down: "[DOWN]",
              neutral: "[NEUTRAL]",
            };
            const icon = directionIcon[impact.impactDirection] ?? "[?]";
            let stockSummary =
              `${impact.actionCode.padEnd(6)} [${impact.domain}] ${icon} ` +
              `Confidence: ${(impact.confidence * 100).toFixed(0)}%\n` +
              `  ${impact.reasoning.slice(0, 160)}`;
            // G5-INVERSE (P1-F): HTTP-routed via kinh-dich-service:5005 (was local SQLite)
            stockSummary = await appendStockHexagramHttp(impact.actionCode, stockSummary);
            lines.push(stockSummary);
          }
          lines.push("");
        } else {
          lines.push("No watchlist stocks directly affected by this event.");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[run_impact_chain] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error running impact chain: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 3. search_similar_context ─────────────────────────────────────────────
  server.tool(
    "search_similar_context",
    "Semantically search the RAG memory for past analyses similar to a query. " +
      "Useful for finding historical precedents and building context around an event. " +
      "Supports filtering by analysis level (global/country/domain/action) " +
      "or specific stock code. Results are re-ranked by recency-weighted score " +
      "(REQ_056 Fix C): final_score = cosine_similarity * recency_weight, where " +
      "recency_weight = max(0.1, 1.0 - (age_days / recency_days) * 0.9).",
    {
      query: z
        .string()
        .min(1)
        .max(300)
        .describe("Free-text search query (Vietnamese or English)"),
      level: z
        .enum(["global", "country", "domain", "action"])
        .optional()
        .describe("Filter results to a specific level in the causal hierarchy"),
      actionCode: z
        .string()
        .regex(/^[A-Z0-9]{1,10}$/, "actionCode must be 1–10 uppercase letters/digits (e.g. VCB)")
        .optional()
        .describe("Filter results to entries for a specific stock code, e.g. VCB"),
      k: z.coerce
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe("Maximum number of results to return (default: 5)"),
      recency_days: z.coerce
        .number()
        .int()
        .min(1)
        .max(3650)
        .default(90)
        .describe(
          "Recency window in days for decay scoring (default: 90). " +
            "Results older than this window are progressively down-ranked. " +
            "Formula: recency_weight = max(0.1, 1.0 - (age_days / recency_days) * 0.9). " +
            "final_score = cosine_similarity * recency_weight.",
        ),
    },
    async ({ query, level, actionCode, k: kRaw, recency_days: recencyDaysRaw }) => {
      const k = kRaw ?? 5;
      const recencyDays = recencyDaysRaw ?? 90;

      try {
        // ── Search vector store ───────────────────────────────────────────────
        // Fetch up to k*3 (capped at 20) raw results so that recency re-ranking
        // has a larger pool to choose from before trimming to the final k.
        // Build options object without undefined keys (exactOptionalPropertyTypes)
        const rawK = Math.min(k * 3, 20);
        // G5b: call rag-service via HTTP; map response to SearchResult shape
        const ragResponse = await ragSearch({
          query,
          limit: rawK,
          ...(level !== undefined ? { level } : {}),
          ...(actionCode !== undefined ? { action_code: actionCode } : {}),
        });
        const rawResults: SearchResult[] = ragResponse.results.map(
          (r: RagSearchResultDTO): SearchResult => ({
            id: r.id,
            level: r.level,
            title: r.title,
            summary: r.summary,
            tags: r.tags,
            actionCode: r.action_code,
            createdAt: r.created_at,
            distance: r.distance,
          }),
        );

        if (rawResults.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No similar context found.",
              },
            ],
          };
        }

        // ── Apply recency weighting and trim to k ─────────────────────────────
        const scored = applyRecencyWeighting(rawResults, recencyDays);
        const results = scored.slice(0, k);

        // ── Format results ────────────────────────────────────────────────────
        const header =
          `Similar Context — ${results.length} result${results.length !== 1 ? "s" : ""} ` +
          `for: "${query.slice(0, 60)}${query.length > 60 ? "…" : ""}" (recency_days=${recencyDays})`;
        const lines = [header, ""];

        for (const result of results) {
          const scoreStr = result.finalScore.toFixed(3);
          const weightStr = result.recencyWeight.toFixed(2);
          const simStr = result.similarity.toFixed(3);
          const summary = (result.summary ?? "").slice(0, 120);
          lines.push(
            `[${result.level.toUpperCase()}] score: ${scoreStr} (sim=${simStr}, recency_weight=${weightStr}) | ` +
              `${summary}${(result.summary ?? "").length > 120 ? "…" : ""}`,
          );
          lines.push(`  ${result.title}`);
          if (result.actionCode) lines.push(`  Stock: ${result.actionCode}`);
          lines.push(`  Created: ${result.createdAt.slice(0, 10)}`);
          lines.push("");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[search_similar_context] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching context: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
