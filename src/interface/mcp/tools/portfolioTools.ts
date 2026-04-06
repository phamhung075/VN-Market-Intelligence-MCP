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
import { buildPositionLine, buildActionNote } from "../../../domain/services/decisionNoteSynthesizer.js";
import { listOpenPositions } from "../../../infrastructure/db/positionStore.js";
import { fetchHosePrices, type MarketPrice } from "../../../infrastructure/fetchers/hose.js";
import { fetchHnxPrices, fetchUpcomPrices } from "../../../infrastructure/fetchers/hnx.js";
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

        // Fetch LIVE prices grouped by exchange (force: true → works after hours)
        const priceMap = new Map<string, PriceRow>();
        let priceSource = "live";
        try {
          const hoseCodes: string[] = [];
          const hnxCodes: string[] = [];
          const upcomCodes: string[] = [];
          for (const w of watchlist) {
            const ex = (w.exchange || "HOSE").toUpperCase();
            if (ex === "HNX") hnxCodes.push(w.code);
            else if (ex === "UPCOM") upcomCodes.push(w.code);
            else hoseCodes.push(w.code);
          }

          // Hard 8s cap on the whole live-price fan-out (#706: tool was
          // timing out at 60s when one fetcher stalled). DB fallback below
          // fills any missing codes — better stale than no answer.
          const withDeadline = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
            new Promise((resolve) => {
              const t = setTimeout(() => resolve(fallback), ms);
              p.then((v) => { clearTimeout(t); resolve(v); })
                .catch(() => { clearTimeout(t); resolve(fallback); });
            });

          const [hoseRes, hnxRes, upcomRes] = await Promise.all([
            hoseCodes.length > 0
              ? withDeadline(fetchHosePrices(hoseCodes, undefined, { force: true }), 8_000, [] as MarketPrice[])
              : Promise.resolve([] as MarketPrice[]),
            hnxCodes.length > 0
              ? withDeadline(fetchHnxPrices(hnxCodes, undefined, { force: true }), 8_000, [] as MarketPrice[])
              : Promise.resolve([] as MarketPrice[]),
            upcomCodes.length > 0
              ? withDeadline(fetchUpcomPrices(upcomCodes, undefined, { force: true }), 8_000, [] as MarketPrice[])
              : Promise.resolve([] as MarketPrice[]),
          ]);

          for (const p of [...hoseRes, ...hnxRes, ...upcomRes]) {
            priceMap.set(p.code, { code: p.code, price: p.price, change_pct: p.changePct, volume: p.volume });
          }
        } catch (err) {
          logger.warn("[get_portfolio_conviction] Live price fetch failed, falling back to DB", {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Fallback: fill any missing codes from DB (stale but better than nothing)
        for (const w of watchlist) {
          if (!priceMap.has(w.code)) {
            const row = db
              .query<PriceRow & { updated_at?: string }, [string]>(
                "SELECT code, price, change_pct, volume, updated_at FROM market_prices WHERE code = ?",
              )
              .get(w.code);
            if (row) {
              priceMap.set(w.code, row);
              priceSource = "mixed"; // some from DB
            }
          }
        }

        // Get sector peer prices for context (DB is acceptable here — peers are context, not primary)
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

        // Build index of open positions keyed by stock code
        let positionMap = new Map<string, { shares: number; avgPrice: number; pnlPct: number; currentPrice: number }>();
        try {
          const positions = listOpenPositions(db);
          for (const pos of positions) {
            if (pos.currentPrice != null) {
              positionMap.set(pos.code, {
                shares: pos.shares,
                avgPrice: pos.avgPrice,
                pnlPct: pos.unrealizedPnlPct,
                currentPrice: pos.currentPrice,
              });
            }
          }
        } catch { /* positions table may not exist yet */ }

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
          positionLine: string;
          actionNote: string;
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

          // Position P&L line and action note
          const pos = positionMap.get(w.code) ?? null;
          const positionLine = buildPositionLine(pos);
          const actionNote = buildActionNote({
            convictionScore: conviction.score,
            pnlPct: pos ? pos.pnlPct : null,
            direction: conviction.direction,
          });

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
            positionLine,
            actionNote,
          });
        }

        // Sort by conviction score descending
        results.sort((a, b) => b.score - a.score);

        // Format output
        const lines: string[] = [
          "=== Portfolio Conviction Dashboard ===",
          `Generated: ${new Date().toISOString()}`,
          `Price source: ${priceSource === "live" ? "Live API" : "Mixed (some from DB cache)"}`,
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
          lines.push(`  ${r.positionLine}`);
          lines.push(`  ${r.actionNote}`);
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
