/**
 * Task 1146 — get_insider_transactions MCP Tool (Sprint 063)
 *
 * Returns insider transaction history from SSC disclosures with on-the-fly
 * streak computation for accumulation patterns.
 * Read path only — write path handled by insiderCheckJob (Task 1143).
 *
 * Layer: interface/mcp/tools — may import infrastructure and domain.
 *
 * @module interface/mcp/tools/insiderTools
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { z } from "zod";
import { getInsiderTransactionsFiltered } from "../../../../infrastructure/db/insiderStore.js";
import { getDb } from "../../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Streak computation (read-path only — mirrors write-path logic in insiderCheckJob)
// ─────────────────────────────────────────────────────────────────────────────

interface StreakResult {
  code: string;
  position: string;
  buyDays: number;
  totalExecutedVolume: number;
  firstDate: string;
  latestDate: string;
  signal: "insider_accumulation";
}

/**
 * Compute accumulation streaks from a set of insider transactions.
 * A streak is defined as >= 2 distinct from_date values where type='buy'
 * and executedVolume > 0, grouped by code + normalised position.
 *
 * @param transactions - Filtered insider transactions from the DB
 */
function computeStreaks(
  transactions: ReturnType<typeof getInsiderTransactionsFiltered>,
): StreakResult[] {
  // Group buy transactions (executed only) by code + normalised position
  const groups = new Map<string, typeof transactions>();
  for (const tx of transactions) {
    if (tx.type !== "buy" || tx.executedVolume <= 0) continue;
    const key = `${tx.code}||${tx.position.toLowerCase().trim()}`;
    const arr = groups.get(key) ?? [];
    arr.push(tx);
    groups.set(key, arr);
  }

  const results: StreakResult[] = [];
  for (const [key, txs] of groups.entries()) {
    const [code, position] = key.split("||") as [string, string];
    const distinctDates = [...new Set(txs.map((t) => t.fromDate))];
    // streak = >= 2 distinct buy days (read-path FR-6 spec)
    if (distinctDates.length < 2) continue;
    distinctDates.sort();
    const totalVol = txs.reduce((s, t) => s + t.executedVolume, 0);
    results.push({
      code,
      position,
      buyDays: distinctDates.length,
      totalExecutedVolume: totalVol,
      firstDate: distinctDates[0]!,
      latestDate: distinctDates[distinctDates.length - 1]!,
      signal: "insider_accumulation",
    });
  }
  return results.sort((a, b) => b.buyDays - a.buyDays);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_insider_transactions MCP tool.
 *
 * @param server    - The McpServer instance to register tools on.
 * @param resolveDb - Optional DB resolver (defaults to getDb for production;
 *                    inject an in-memory DB in tests).
 */
export function registerInsiderTools(
  server: McpServer,
  resolveDb: () => Database = getDb,
): void {
  server.tool(
    "get_insider_transactions",
    "Return insider transaction history from SSC disclosures. " +
      "Includes on-the-fly streak detection for accumulation patterns (>= 2 distinct buy days by same insider). " +
      "If code is omitted, returns all watchlist stocks. " +
      "Data is populated by insiderCheckJob (daily 08:00 VN time, Task 1145). " +
      "Source tier: 1 (primary official — SSC portal congbothongtin.ssc.gov.vn is the official State Securities Commission regulatory portal).",
    {
      code: z
        .string()
        .optional()
        .describe("Stock ticker, e.g. 'VNM'. If omitted, returns all watchlist stocks."),
      days: z
        .number()
        .int()
        .min(1)
        .max(180)
        .optional()
        .default(30)
        .describe("Lookback window in days (1–180). Default 30. FIX-H: extended from 90d to 180d."),
      type: z
        .enum(["buy", "sell", "all"])
        .optional()
        .default("all")
        .describe("Filter by transaction type. Default 'all'."),
    },
    async ({ code, days = 30, type = "all" }) => {
      try {
        const db = resolveDb();
        const lookback = Math.max(1, Math.min(180, days)); // FIX-H: extended from 90d to 180d
        const sinceDate = new Date(Date.now() - lookback * 86_400_000)
          .toISOString()
          .slice(0, 10);

        // Resolve codes: single ticker or all watchlist codes
        let codes: string[] | undefined;
        if (code) {
          codes = [code.toUpperCase().trim()];
        } else {
          type WlRow = { code: string };
          const wl = db
            .prepare<WlRow, []>("SELECT DISTINCT code FROM watchlist")
            .all() as WlRow[];
          codes = wl.map((r) => r.code);
        }

        const filterOpts: {
          codes?: string[];
          sinceDate?: string;
          type?: "buy" | "sell" | "all";
        } = { codes, sinceDate };
        if (type !== "all") {
          filterOpts.type = type;
        }
        const transactions = getInsiderTransactionsFiltered(db, filterOpts);

        const streaks = computeStreaks(transactions);

        const output = {
          source_tier: 1 as const,
          transactions: transactions.map((t) => ({
            code:             t.code,
            insiderName:      t.insiderName,
            position:         t.position,
            type:             t.type,
            executedVolume:   t.executedVolume,
            registeredVolume: t.registeredVolume,
            price:            t.price,
            fromDate:         t.fromDate,
            toDate:           t.toDate,
            fetchedAt:        t.fetchedAt,
          })),
          streaks,
          totalCount:   transactions.length,
          lookbackDays: lookback,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (err) {
        console.error("[get_insider_transactions] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                source_tier: 1 as const,
                error: err instanceof Error ? err.message : String(err),
              }, null, 2),
            },
          ],
        };
      }
    },
  );
}
