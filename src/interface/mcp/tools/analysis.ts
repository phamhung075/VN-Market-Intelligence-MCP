/**
 * Task 083 — Analysis MCP Tools
 *
 * Interface layer: registers three MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. fetch_and_analyze       — fetch RSS from all sources, normalize, store in SQLite + RAG
 *   2. run_impact_chain        — run causal cascade engine on a news headline
 *   3. search_similar_context  — RAG semantic search for similar past analyses
 *
 * All tools call `initDatabase()` lazily on first use so the module can be
 * imported without side effects.
 *
 * @module interface/mcp/tools/analysis
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import { fetchCafeF } from "../../../infrastructure/fetchers/cafef.js";
import { fetchVnExpress } from "../../../infrastructure/fetchers/vnexpress.js";
import { fetchReuters } from "../../../infrastructure/fetchers/reuters.js";
import { fetchVnEconomy } from "../../../infrastructure/fetchers/vneconomy.js";
import { normalizeNews } from "../../../domain/services/newsNormalizer.js";
import { runImpactChain } from "../../../application/usecases/runImpactChain.js";
import { searchContext, insertAnalysis } from "../../../infrastructure/rag/retriever.js";
import type { SearchResult } from "../../../infrastructure/rag/retriever.js";
import type { WatchlistEntry } from "../../../domain/services/cascadeEngine.js";
import type { DomainType } from "../../../../bctc-schema.js";
import { logger } from "../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row type for watchlist queries
// ─────────────────────────────────────────────────────────────────────────────

interface WatchlistRow {
  code: string;
  exchange: string;
  domain: string;
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
      "and return a formatted summary of the market intelligence gathered.",
    {
      sources: z
        .array(z.enum(["cafef", "vnexpress", "reuters", "vneconomy"]))
        .default(["cafef", "vnexpress", "reuters", "vneconomy"])
        .describe("Which RSS sources to fetch from (default: all four)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(20)
        .describe("Maximum total number of news items to analyze (default: 20)"),
    },
    async ({ sources: sourcesRaw, limit: limitRaw }) => {
      const sources = sourcesRaw ?? ["cafef", "vnexpress", "reuters", "vneconomy"];
      const limit = limitRaw ?? 20;

      try {
        await initDatabase();
        const db = getDb();

        // ── Step 1: Fetch from all requested sources in parallel ─────────────
        const fetchPromises: Promise<Awaited<ReturnType<typeof fetchCafeF>>>[] = [];
        if (sources.includes("cafef")) fetchPromises.push(fetchCafeF());
        if (sources.includes("vnexpress")) fetchPromises.push(fetchVnExpress());
        if (sources.includes("reuters")) fetchPromises.push(fetchReuters());
        if (sources.includes("vneconomy")) fetchPromises.push(fetchVnEconomy());

        const results = await Promise.all(fetchPromises);
        const allItems = results.flat().slice(0, limit);

        if (allItems.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No news items fetched from sources: ${sources.join(", ")}.\nThis may be due to network unavailability or empty feeds.`,
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

        // ── Step 4: Insert into vector store (best-effort) ───────────────────
        for (const entry of entries) {
          try {
            await insertAnalysis({
              id: entry.id,
              level: entry.level,
              title: entry.sourceTitle,
              summary: entry.summary,
              tags: entry.tags,
              ...(entry.affectedActions.length > 0
                ? { actionCode: entry.affectedActions[0] }
                : {}),
            });
          } catch (ragErr) {
            logger.warn("[fetch_and_analyze] RAG insert failed for entry", {
              id: entry.id,
              error: ragErr instanceof Error ? ragErr.message : String(ragErr),
            });
            // Continue — SQLite row was already committed
          }
        }

        // ── Step 5: Format output ─────────────────────────────────────────────
        const header = `Analysis — ${entries.length} item${entries.length !== 1 ? "s" : ""} fetched and analyzed`;
        const lines = [header, "", ...entries.map(formatAnalysisEntry)];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[fetch_and_analyze] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching and analyzing news: ${(err as Error).message}`,
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
            lines.push(
              `${impact.actionCode.padEnd(6)} [${impact.domain}] ${icon} ` +
              `Confidence: ${(impact.confidence * 100).toFixed(0)}%`,
            );
            lines.push(`  ${impact.reasoning.slice(0, 160)}`);
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
      "or specific stock code.",
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
        .optional()
        .describe("Filter results to entries for a specific stock code, e.g. VCB"),
      k: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(5)
        .describe("Maximum number of results to return (default: 5)"),
    },
    async ({ query, level, actionCode, k: kRaw }) => {
      const k = kRaw ?? 5;

      try {
        // ── Search vector store ───────────────────────────────────────────────
        // Build options object without undefined keys (exactOptionalPropertyTypes)
        const searchOptions: import("../../../infrastructure/rag/retriever.js").SearchOptions = { k };
        if (level !== undefined) searchOptions.level = level;
        if (actionCode !== undefined) searchOptions.actionCode = actionCode;
        const results: SearchResult[] = await searchContext(query, searchOptions);

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No similar context found.",
              },
            ],
          };
        }

        // ── Format results ────────────────────────────────────────────────────
        const header = `Similar Context — ${results.length} result${results.length !== 1 ? "s" : ""} for: "${query.slice(0, 60)}${query.length > 60 ? "…" : ""}"`;
        const lines = [header, ""];

        for (const result of results) {
          const distStr = result.distance.toFixed(3);
          const summary = (result.summary ?? "").slice(0, 120);
          lines.push(
            `[${result.level.toUpperCase()}] distance: ${distStr} | ${summary}${(result.summary ?? "").length > 120 ? "…" : ""}`,
          );
          lines.push(`  ${result.title}`);
          if (result.actionCode) lines.push(`  Stock: ${result.actionCode}`);
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
