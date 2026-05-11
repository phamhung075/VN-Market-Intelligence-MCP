/**
 * MCP Tool — get_imf_signals (Task 1296b)
 *
 * Interface layer: registers the `get_imf_signals` MCP tool.
 *
 * Tool behaviour:
 *   1. Reads latest IMF indicators from DB cache (no live fetch)
 *   2. Optionally filters by indicator code
 *   3. Classifies overall macro sentiment
 *   4. Returns structured JSON with indicators + sentiment + last_updated
 *
 * No live HTTP calls — uses cached data from imfIndicatorPollerJob (6h cycle).
 * For fresh data, the poller must have run recently.
 *
 * @module interface/mcp/tools/macro/imfSignals
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getLatestImfIndicators } from "../../../../application/services/imfDataFetcher.js";
import { classifyImfIndicators } from "../../../../domain/services/imfDataClassifier.js";
import { IMF_HISTORICAL_BASELINE } from "../../../../domain/models/imfIndicators.js";
import { logger } from "../../../../infrastructure/logger.js";

// ── Tool registration ─────────────────────────────────────────────────────────

/**
 * Register the `get_imf_signals` tool with the MCP server.
 *
 * @param server - MCP server instance
 */
export function registerImfSignalsTool(server: McpServer): void {
  server.tool(
    "get_imf_signals",
    "Fetch latest IMF economic indicators and macro sentiment classification for VN market analysis. Returns global growth forecasts, inflation indicators, and sector impact scores derived from IMF DataMapper API data (refreshed every 6 hours).",
    {
      indicator_code: z
        .string()
        .optional()
        .describe(
          "Optional: filter by specific IMF indicator code (e.g. 'NGDP_RPCH' for GDP growth, 'PCPI_ADVEC' for inflation, 'POILAPSP' for oil price forecast)",
        ),
      days_back: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe("Not used for filtering (IMF data refreshed every 6h); reserved for future historical queries. Default: shows all cached data."),
    },
    async (input) => {
      try {
        // Fetch cached IMF indicators
        let indicators = await getLatestImfIndicators();

        // Optional filter by code
        if (input.indicator_code) {
          const filterCode = input.indicator_code.toUpperCase();
          indicators = indicators.filter((ind) =>
            ind.code.toUpperCase() === filterCode,
          );
        }

        // Classify macro sentiment
        const classification = classifyImfIndicators({
          indicators,
          historicalBaseline: IMF_HISTORICAL_BASELINE,
        });

        const response = {
          indicators: indicators.map((ind) => ({
            code: ind.code,
            name: ind.name,
            value: ind.value,
            published_at: ind.publishedAt,
            age_in_days: ind.ageInDays,
            yoy_change: ind.yoyChange,
            source: ind.source,
            confidence: ind.confidence,
          })),
          sentiment: {
            score: classification.sentiment,
            classification: classification.classification,
            confidence: classification.confidence,
            reasoning: classification.reasoning,
            sector_impacts: classification.sectorImpacts,
          },
          last_updated: new Date().toISOString(),
          data_count: indicators.length,
          note:
            indicators.length === 0
              ? "No IMF data cached yet — run imfIndicatorPollerJob to populate"
              : `${indicators.length} indicator(s) available`,
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("[get_imf_signals] error", { error: message });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: message, indicators: [], data_count: 0 }, null, 2),
            },
          ],
        };
      }
    },
  );
}
