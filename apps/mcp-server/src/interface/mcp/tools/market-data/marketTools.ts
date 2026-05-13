/**
 * Task 084 — Market MCP Tools
 *
 * Interface layer: registers two MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. get_market_snapshot  — fetch live prices from HOSE, HNX, UPCOM in parallel
 *   2. get_patterns         — query historical pattern summary from rag_analyses
 *
 * IMPORTANT: search_similar_context is NOT registered here — it is already
 * owned by registerAnalysisTools (analysis.ts). Registering it again would
 * cause a duplicate tool name error in McpServer.
 *
 * @module interface/mcp/tools/market
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { fetchHosePrices, fetchVnIndex, type MarketPrice } from "../../../../infrastructure/fetchers/hose.js";
import { fetchHnxPrices, fetchUpcomPrices } from "../../../../infrastructure/fetchers/hnx.js";
import { getPatternSummary } from "../../../../application/usecases/getPatternSummary.js";
import { logger } from "../../../../infrastructure/logger.js";
import type { HttpClient } from "../../../../infrastructure/fetchers/ssc.js";
import { appendKinhDich } from "../../../../domain/services/kinhDich/kinhDichWrapper.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface MarketPriceRow {
  code: string;
  exchange: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a single MarketPrice into a display line.
 *
 * Example output:
 *   VCB   88,000.0 VND  +1.15%  Vol: 1,500,000
 */
function formatPrice(p: MarketPrice): string {
  const sign = p.changePct >= 0 ? "+" : "";
  const price = p.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const vol = p.volume.toLocaleString("en-US");
  return `  ${p.code.padEnd(8)} ${price} VND  ${sign}${p.changePct.toFixed(2)}%  Vol: ${vol}`;
}

/**
 * Format an exchange section header + prices.
 * Returns empty string if prices array is empty.
 */
function formatExchangeSection(exchange: string, prices: MarketPrice[]): string {
  if (prices.length === 0) return "";
  const lines = [`[${exchange}]`];
  for (const p of prices) {
    lines.push(formatPrice(p));
  }
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register market MCP tools: get_market_snapshot, get_patterns.
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerMarketTools(server: McpServer): void {

  // ── 1. get_market_snapshot ─────────────────────────────────────────────────
  server.tool(
    "get_market_snapshot",
    "Fetch live market prices from all Vietnamese exchanges (HOSE, HNX, UPCOM). " +
      "Optionally provide a list of stock codes to look up; if omitted or empty, " +
      "only the VN-Index benchmark is fetched. Each exchange fetch is error-isolated " +
      "so a single exchange failure does not block results from the others. " +
      "Source tier: 2 (aggregator — VnDirect finfo-api v4 re-aggregates HOSE/HNX/UPCOM exchange data).",
    {
      codes: z
        .array(z.string().min(1).max(10))
        .optional()
        .describe(
          "Optional list of stock tickers to fetch (e.g. [\"VCB\", \"ACB\"]). " +
          "If empty or absent, only VN-Index is returned.",
        ),
      // Test-only injection parameters (ignored in production — unknown keys are stripped by Zod)
      _testHoseClient: z.any().optional(),
      _testHnxClient: z.any().optional(),
      _testUpcomClient: z.any().optional(),
    },
    async (args) => {
      const { codes, _testHoseClient, _testHnxClient, _testUpcomClient } = args as {
        codes?: string[];
        _testHoseClient?: HttpClient;
        _testHnxClient?: HttpClient;
        _testUpcomClient?: HttpClient;
      };

      try {
        await initDatabase();
        const db = getDb();

        // ── Classify stock codes by exchange ──────────────────────────────────
        const codesProvided = (codes ?? []).filter(Boolean);

        let hoseCodes: string[] = [];
        let hnxCodes: string[] = [];
        let upcomCodes: string[] = [];

        if (codesProvided.length > 0) {
          // Query the market_prices table to determine each code's exchange.
          // Unknown codes (not in market_prices) default to HOSE.
          let knownRows: MarketPriceRow[] = [];
          try {
            knownRows = db
              .query<MarketPriceRow, []>(
                "SELECT code, exchange FROM market_prices",
              )
              .all();
          } catch {
            // market_prices may not have exchange column yet — treat all as HOSE
          }

          const exchangeMap = new Map<string, string>();
          for (const row of knownRows) {
            exchangeMap.set(row.code.toUpperCase(), row.exchange);
          }

          for (const code of codesProvided) {
            const exchange = exchangeMap.get(code.toUpperCase()) ?? "HOSE";
            if (exchange === "HNX") hnxCodes.push(code);
            else if (exchange === "UPCOM") upcomCodes.push(code);
            else hoseCodes.push(code); // HOSE is default
          }
        }

        // ── Fetch all exchanges in parallel (each error-isolated) ─────────────
        const generatedAt = new Date().toISOString();

        // User-initiated MCP calls always use force: true to bypass
        // trading-session guards — the user expects data even after hours.
        const forceOpts = { force: true };

        const [vnIndexResult, hoseResult, hnxResult, upcomResult] =
          await Promise.all([
            // Fetch VN-Index: use test client if injected, otherwise dedicated
            // vnmarket_prices endpoint (more reliable than the stock endpoint).
            (_testHoseClient
              ? fetchHosePrices(["VNINDEX"], _testHoseClient, { force: true })
              : fetchVnIndex("VNINDEX").then((idx) => (idx ? [idx] : [] as MarketPrice[]))
            ).catch((err) => {
                logger.warn("[get_market_snapshot] VN-Index fetch failed", {
                  error: err instanceof Error ? err.message : String(err),
                });
                return [] as MarketPrice[];
              }),
            // Fetch requested HOSE stocks (force: true → works after hours)
            hoseCodes.length > 0
              ? fetchHosePrices(hoseCodes, _testHoseClient, _testHoseClient ? { force: true } : forceOpts).catch((err) => {
                  logger.warn("[get_market_snapshot] HOSE fetch failed", {
                    error: err instanceof Error ? err.message : String(err),
                  });
                  return [] as MarketPrice[];
                })
              : Promise.resolve([] as MarketPrice[]),
            // Fetch requested HNX stocks
            hnxCodes.length > 0
              ? fetchHnxPrices(hnxCodes, _testHnxClient, forceOpts).catch((err) => {
                  logger.warn("[get_market_snapshot] HNX fetch failed", {
                    error: err instanceof Error ? err.message : String(err),
                  });
                  return [] as MarketPrice[];
                })
              : Promise.resolve([] as MarketPrice[]),
            // Fetch requested UPCOM stocks
            upcomCodes.length > 0
              ? fetchUpcomPrices(upcomCodes, _testUpcomClient, forceOpts).catch((err) => {
                  logger.warn("[get_market_snapshot] UPCOM fetch failed", {
                    error: err instanceof Error ? err.message : String(err),
                  });
                  return [] as MarketPrice[];
                })
              : Promise.resolve([] as MarketPrice[]),
          ]);

        // ── Build output ──────────────────────────────────────────────────────
        const lines: string[] = [];

        // VN-Index header
        const vnIndex = vnIndexResult.find((p) => p.code === "VNINDEX");
        if (vnIndex) {
          const sign = vnIndex.changePct >= 0 ? "+" : "";
          lines.push(
            `VN-Index: ${vnIndex.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}  ${sign}${vnIndex.changePct.toFixed(2)}%`,
          );
        } else {
          lines.push("VN-Index: N/A");
        }

        lines.push("");

        if (codesProvided.length === 0) {
          lines.push("No stock codes requested. Provide `codes` to see individual prices.");
        } else {
          // HOSE section
          const hoseSection = formatExchangeSection("HOSE", hoseResult);
          if (hoseSection) lines.push(hoseSection);

          // HNX section
          const hnxSection = formatExchangeSection("HNX", hnxResult);
          if (hnxSection) {
            if (hoseSection) lines.push("");
            lines.push(hnxSection);
          }

          // UPCOM section
          const upcomSection = formatExchangeSection("UPCOM", upcomResult);
          if (upcomSection) {
            if (hoseSection || hnxSection) lines.push("");
            lines.push(upcomSection);
          }

          if (!hoseSection && !hnxSection && !upcomSection) {
            lines.push("No price data returned for the requested codes.");
          }
        }

        lines.push("");
        lines.push(`Generated: ${generatedAt}`);

        // ── Append Kinh Dich: MARKET-wide hexagram ───────────────────────────────
        // Append the VN-Index / market aggregate hexagram to the full snapshot.
        // Per-stock hexagram readings are appended as a Kinh Dich section block.
        let text = lines.join("\n");
        text = await appendKinhDich("MARKET", text, db);

        // Per-stock hexagram readings for all requested codes (best-effort)
        if (codesProvided.length > 0) {
          for (const code of codesProvided) {
            const stockSummary = `${code}`;
            const withHex = await appendKinhDich(code, stockSummary, db);
            // Only append if there is actual hexagram data (not just fallback repeated)
            if (withHex !== stockSummary) {
              text = text + "\n" + withHex.slice(stockSummary.length);
            }
          }
        }

        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            source_tier: 2 as const,
            text,
            fetchedAt: generatedAt,
          }, null, 2) }],
        };
      } catch (err) {
        logger.error("[get_market_snapshot] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                source_tier: 2 as const,
                error: `Error fetching market snapshot: ${(err as Error).message}`,
              }, null, 2),
            },
          ],
        };
      }
    },
  );

  // ── 2. get_patterns ────────────────────────────────────────────────────────
  server.tool(
    "get_patterns",
    "Query historical precedents from RAG memory for a specific stock and event keyword. " +
      "Returns aggregate statistics: average impact score, dominant direction, and a list of " +
      "matching past analyses. Useful for understanding how a stock has historically responded " +
      "to similar events.",
    {
      stockCode: z
        .string()
        .min(1)
        .max(10)
        .describe("Stock ticker to search for, e.g. \"GAS\""),
      eventKeyword: z
        .string()
        .min(1)
        .max(100)
        .describe("Event keyword to match in past analysis headlines/summaries, e.g. \"oil price\""),
      lookbackHours: z.coerce
        .number()
        .int()
        .min(1)
        .max(8760)
        .default(168)
        .describe("How many hours to look back (default: 168 = 1 week; max: 8760 = 1 year)"),
    },
    async ({ stockCode, eventKeyword, lookbackHours: lookbackHoursRaw }) => {
      const lookbackHours = lookbackHoursRaw ?? 168;

      try {
        const summary = await getPatternSummary(stockCode, eventKeyword, lookbackHours);

        if (summary === null) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No historical precedents found for stock "${stockCode}" matching keyword "${eventKeyword}" in the last ${lookbackHours} hours.`,
              },
            ],
          };
        }

        // ── Format output ─────────────────────────────────────────────────────
        const lines: string[] = [
          `=== Historical Patterns: ${summary.stockCode} / "${summary.eventKeyword}" ===`,
          `Lookback: ${summary.lookbackHours} hours  |  Precedents found: ${summary.precedents.length}`,
          `Avg Impact Score: ${summary.avgImpactPct.toFixed(2)}/10  |  Dominant Direction: ${summary.dominantDirection.toUpperCase()}`,
          "",
          "--- Precedents ---",
        ];

        for (const p of summary.precedents) {
          const dateStr = p.date.slice(0, 16).replace("T", " ");
          const dirSymbol = p.impactDirection === "up" ? "[UP]" : p.impactDirection === "down" ? "[DOWN]" : "[NEUTRAL]";
          lines.push(
            `${dateStr}  ${dirSymbol}  Score: ${p.impactScore}/10  ${p.headline.slice(0, 80)}${p.headline.length > 80 ? "…" : ""}`,
          );
        }

        lines.push("");
        lines.push(`Generated: ${summary.generatedAt}`);

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[get_patterns] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving patterns: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
