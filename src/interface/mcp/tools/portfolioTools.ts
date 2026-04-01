/**
 * Portfolio Tools — MCP tool for on-demand portfolio conviction view
 *
 * Tools registered:
 *   1. get_portfolio_conviction — ranked watchlist by conviction score
 *
 * @module interface/mcp/tools/portfolioTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import { computeConviction } from "../../../domain/services/convictionScorer.js";
import { getSectorPeers, SECTOR_NAME_VI } from "../../../domain/services/sectorPeers.js";
import { logger } from "../../../infrastructure/logger.js";
import type { DomainType } from "../../../../bctc-schema";

// ─────────────────────────────────────────────────────────────────────────────
// Row types
// ─────────────────────────────────────────────────────────────────────────────

interface WatchlistRow {
  code: string;
  domain: string;
  exchange: string;
}

interface PriceRow {
  code: string;
  price: number;
  change_pct: number;
  volume: number;
}

interface ConvictionHistoryRow {
  peak_score: number;
  date: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerPortfolioTools(server: McpServer): void {

  server.tool(
    "get_portfolio_conviction",
    "Returns a ranked conviction dashboard for all watchlist stocks. " +
      "Each stock shows: conviction score (0-1), signal direction, sector peer movement, " +
      "open alert count, and 7-day conviction trend. Stocks ranked by conviction score descending. " +
      "Use this to get a full portfolio health check at any time.",
    {},
    async () => {
      try {
        await initDatabase();
        const db = getDb();

        // Get watchlist
        const watchlist = db
          .query<WatchlistRow, []>("SELECT code, domain, exchange FROM watchlist ORDER BY code")
          .all();

        if (watchlist.length === 0) {
          return { content: [{ type: "text" as const, text: "Watchlist trống — thêm cổ phiếu trước." }] };
        }

        // Get latest prices
        const priceMap = new Map<string, PriceRow>();
        for (const w of watchlist) {
          const price = db
            .query<PriceRow, [string]>(
              "SELECT code, price, change_pct, volume FROM market_prices WHERE code = ?",
            )
            .get(w.code);
          if (price) priceMap.set(w.code, price);
        }

        // Get sector peer prices for context
        const sectorAvgMap = new Map<string, number>();
        const domains = new Set(watchlist.map((w) => w.domain as DomainType));
        for (const domain of domains) {
          if (domain === "other") continue;
          const peers = getSectorPeers(domain as DomainType);
          const peerPrices: number[] = [];
          for (const peer of peers) {
            const p = db
              .query<{ change_pct: number }, [string]>(
                "SELECT change_pct FROM market_prices WHERE code = ?",
              )
              .get(peer.code);
            if (p?.change_pct != null) peerPrices.push(p.change_pct);
          }
          if (peerPrices.length > 0) {
            const avg = peerPrices.reduce((s, v) => s + v, 0) / peerPrices.length;
            sectorAvgMap.set(domain, Math.round(avg * 100) / 100);
          }
        }

        // Build conviction results
        const results: {
          code: string;
          domain: string;
          score: number;
          level: string;
          direction: string;
          summary: string;
          price: number | null;
          changePct: number | null;
          sectorAvg: number | null;
          sectorName: string;
          openAlerts: number;
          trend: number[];
        }[] = [];

        for (const w of watchlist) {
          const price = priceMap.get(w.code);
          const sectorAvg = sectorAvgMap.get(w.domain) ?? null;

          const input: Parameters<typeof computeConviction>[0] = { code: w.code };
          if (price?.change_pct != null) input.changePct = price.change_pct;
          if (price?.volume != null) input.volume = price.volume;
          if (sectorAvg != null) input.sectorAvgPct = sectorAvg;
          const conviction = computeConviction(input);

          // Open alerts count
          let openAlerts = 0;
          try {
            const row = db
              .query<{ cnt: number }, [string]>(
                "SELECT COUNT(*) as cnt FROM alerts WHERE affected_actions_json LIKE '%' || ? || '%' AND resolved_at IS NULL",
              )
              .get(w.code);
            openAlerts = row?.cnt ?? 0;
          } catch { /* resolved_at may not exist */ }

          // 7-day conviction trend
          let trend: number[] = [];
          try {
            const rows = db
              .query<ConvictionHistoryRow, [string]>(
                "SELECT peak_score, date FROM conviction_history WHERE symbol = ? ORDER BY date DESC LIMIT 7",
              )
              .all(w.code);
            trend = rows.reverse().map((r) => r.peak_score);
          } catch { /* table may not exist */ }

          results.push({
            code: w.code,
            domain: w.domain,
            score: conviction.score,
            level: conviction.level,
            direction: conviction.direction,
            summary: conviction.summary,
            price: price?.price ?? null,
            changePct: price?.change_pct ?? null,
            sectorAvg,
            sectorName: SECTOR_NAME_VI[w.domain as DomainType] ?? w.domain,
            openAlerts,
            trend,
          });
        }

        // Sort by conviction score descending
        results.sort((a, b) => b.score - a.score);

        // Format output
        const lines: string[] = [
          "=== Portfolio Conviction Dashboard ===",
          `Generated: ${new Date().toISOString()}`,
          "",
        ];

        for (const r of results) {
          const priceStr = r.price ? `${r.price.toLocaleString("en-US")} VND` : "N/A";
          const chgStr = r.changePct != null ? `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%` : "";
          const sectorStr = r.sectorAvg != null ? `Ngành ${r.sectorName}: ${r.sectorAvg >= 0 ? "+" : ""}${r.sectorAvg}%` : "";
          const alertStr = r.openAlerts > 0 ? ` | ⚠️ ${r.openAlerts} alert` : "";
          const trendStr = r.trend.length >= 2 ? ` | trend: [${r.trend.map((t) => t.toFixed(2)).join(",")}]` : "";

          lines.push(`${r.code} — ${r.level.toUpperCase()} (${r.score.toFixed(2)})`);
          lines.push(`  ${priceStr} ${chgStr} | ${sectorStr}${alertStr}${trendStr}`);
          lines.push(`  ${r.summary}`);
          lines.push("");
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } catch (err) {
        logger.error("[get_portfolio_conviction] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [{ type: "text" as const, text: `Error: ${(err as Error).message}` }],
        };
      }
    },
  );
}
