/**
 * Task 1117 — record_evidence_fragment MCP Tool
 *
 * Provides the `record_evidence_fragment` tool for analysis agents to
 * write directional evidence fragments to the prediction engine store.
 *
 * Part of the Prediction Engine Phase A (Sprint 057).
 *
 * Usage by analysis agents:
 *   - News Scout (01): news_sentiment_macro, news_sentiment_stock
 *   - BCTC Collector (03): bctc_revenue_growth, bctc_pe_ratio, bctc_debt_equity
 *   - Market Watcher (04): price_momentum_5d, price_momentum_20d
 *   - Alert Commander (05): aggregated signals
 *   - Any agent: kinh_dich_signal
 *
 * @module interface/mcp/tools/evidenceTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  insertEvidenceFragment,
} from "../../../infrastructure/db/evidenceFragmentStore.js";
import { getDb } from "../../../infrastructure/db/schema.js";

/**
 * Register the evidence fragment tool on an McpServer instance.
 *
 * @param server - The McpServer instance to register tools on
 * @param db     - Optional database injection (defaults to getDb() for production)
 */
export function registerEvidenceTools(
  server: McpServer,
  db?: Database,
): void {
  const resolveDb = () => db ?? getDb();

  // ── record_evidence_fragment ──────────────────────────────────────────────
  server.tool(
    "record_evidence_fragment",
    "Store a directional evidence fragment for a stock from an analysis agent. " +
      "Called by News Scout, BCTC Collector, Market Watcher, Alert Commander, and other agents " +
      "to accumulate bullish/bearish/neutral evidence per stock. " +
      "The nightly evidence accumulator aggregates these into evidence_scores. " +
      "evidence_type examples: news_sentiment_macro, news_sentiment_stock, bctc_revenue_growth, " +
      "bctc_pe_ratio, bctc_debt_equity, price_momentum_5d, price_momentum_20d, kinh_dich_signal.",
    {
      stock: z
        .string()
        .min(1)
        .describe("Stock ticker, e.g. 'VCB'"),
      evidence_type: z
        .string()
        .min(1)
        .describe(
          "Type of evidence. Examples: news_sentiment_macro, news_sentiment_stock, " +
          "bctc_revenue_growth, bctc_pe_ratio, bctc_debt_equity, " +
          "price_momentum_5d, price_momentum_20d, kinh_dich_signal",
        ),
      direction: z
        .enum(["bullish", "bearish", "neutral"])
        .describe("Direction of the evidence signal"),
      magnitude: z
        .number()
        .min(0)
        .max(1)
        .describe("Strength of the evidence: 0.0 (weak) to 1.0 (strong)"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe("Confidence in this evidence: 0.0 to 1.0"),
      source_agent: z
        .string()
        .min(1)
        .describe("Agent producing this fragment, e.g. '04-market-watcher'"),
      ttl_days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe("Days before this fragment expires. Default: 30"),
    },
    async ({
      stock,
      evidence_type,
      direction,
      magnitude,
      confidence,
      source_agent,
      ttl_days,
    }) => {
      try {
        const database = resolveDb();
        const id = insertEvidenceFragment(database, {
          stock: stock.toUpperCase().trim(),
          evidence_type,
          direction,
          magnitude,
          confidence,
          source_agent,
          ttl_days: ttl_days ?? 30,
        });

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Fragment recorded: id=${id}\n` +
                `Stock: ${stock.toUpperCase().trim()}\n` +
                `Type: ${evidence_type}\n` +
                `Direction: ${direction} (magnitude=${magnitude.toFixed(2)}, confidence=${confidence.toFixed(2)})\n` +
                `Agent: ${source_agent}\n` +
                `TTL: ${ttl_days ?? 30} days`,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error recording evidence fragment: ${msg}`,
            },
          ],
        };
      }
    },
  );
}
