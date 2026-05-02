/**
 * Task 277 — get_sector_comparison MCP Tool
 *
 * Benchmarks a watchlist stock's valuation (PE/PB/ROE) and price performance
 * against its sector peers using data stored in local SQLite tables.
 *
 * Data sources (all local SQLite — no network):
 *   - watchlist            — target stock's domain classification
 *   - vnstock_financials   — PE, PB, ROE for target + peers
 *   - market_prices        — latest price, change_pct
 *   - vnstock_trading_stats — foreign flow (foreignVolume)
 *
 * Output: plain-text Vietnamese comparison, no Markdown, no emojis.
 *
 * Layer: interface/mcp/tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { sqlInClause } from "../../../../infrastructure/db/sqlHelpers.js";
import { logger } from "../../../../infrastructure/logger.js";
import {
  getSectorPeers,
  SECTOR_NAME_VI,
} from "../../../../domain/services/sectorPeers.js";
import {
  compareToSector,
  median,
  type ValuationTier,
} from "../../../../domain/services/sectorValuationComparator.js";
import type { DomainType } from "../../../../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal row shapes (SQLite query results)
// ─────────────────────────────────────────────────────────────────────────────

interface WatchlistRow {
  code: string;
  domain: string;
}

interface VnstockFinancialsRow {
  code: string;
  pe: number | null;
  pb: number | null;
  roe: number | null;
}

interface MarketPriceRow {
  code: string;
  price: number | null;
  change_pct: number | null;
}

interface TradingStatsRow {
  code: string;
  foreign_volume: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data access helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get watchlist entry for a specific stock code.
 */
function getWatchlistEntry(code: string): WatchlistRow | null {
  const db = getDb();
  return db
    .query<WatchlistRow, [string]>(
      "SELECT code, domain FROM watchlist WHERE code = ?",
    )
    .get(code) ?? null;
}

/**
 * Fetch latest vnstock_financials for a list of codes.
 * Returns a map: code → VnstockFinancialsRow.
 */
function fetchVnstockFinancials(codes: string[]): Map<string, VnstockFinancialsRow> {
  const db = getDb();
  const map = new Map<string, VnstockFinancialsRow>();
  if (codes.length === 0) return map;

  // Check if vnstock_financials table exists (may not in older DB states)
  const tableCheck = db
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    )
    .get("vnstock_financials");

  if (!tableCheck) return map;

  const placeholders = sqlInClause(codes.length);
  try {
    // Get latest row per code by (year_report DESC, quarter DESC)
    const rows = db
      .query<VnstockFinancialsRow & { year_report: number; quarter: number }, string[]>(
        `SELECT code, pe, pb, roe, year_report, quarter
         FROM vnstock_financials
         WHERE code IN (${placeholders})
           AND (code, year_report, quarter) IN (
             SELECT code, MAX(year_report), MAX(quarter)
             FROM vnstock_financials
             WHERE code IN (${placeholders})
             GROUP BY code
           )`,
      )
      .all(...codes, ...codes);

    for (const row of rows) {
      if (!map.has(row.code)) {
        map.set(row.code, { code: row.code, pe: row.pe, pb: row.pb, roe: row.roe });
      }
    }
  } catch (err) {
    logger.warn("[get_sector_comparison] vnstock_financials query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return map;
}

/**
 * Fetch latest market prices for a list of codes.
 * Returns a map: code → MarketPriceRow.
 */
function fetchMarketPrices(codes: string[]): Map<string, MarketPriceRow> {
  const db = getDb();
  const map = new Map<string, MarketPriceRow>();
  if (codes.length === 0) return map;

  const placeholders = sqlInClause(codes.length);
  try {
    const rows = db
      .query<MarketPriceRow, string[]>(
        `SELECT code, price, change_pct FROM market_prices WHERE code IN (${placeholders})`,
      )
      .all(...codes);
    for (const row of rows) map.set(row.code, row);
  } catch (err) {
    logger.warn("[get_sector_comparison] market_prices query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return map;
}

/**
 * Fetch latest trading stats (for foreign flow) for a list of codes.
 * Returns a map: code → TradingStatsRow.
 */
function fetchTradingStats(codes: string[]): Map<string, TradingStatsRow> {
  const db = getDb();
  const map = new Map<string, TradingStatsRow>();
  if (codes.length === 0) return map;

  const tableCheck = db
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    )
    .get("vnstock_trading_stats");

  if (!tableCheck) return map;

  const placeholders = sqlInClause(codes.length);
  try {
    const rows = db
      .query<TradingStatsRow, string[]>(
        `SELECT code, foreign_volume
         FROM vnstock_trading_stats
         WHERE code IN (${placeholders})`,
      )
      .all(...codes);
    for (const row of rows) map.set(row.code, row);
  } catch (err) {
    logger.warn("[get_sector_comparison] vnstock_trading_stats query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Format a ratio value to 1 decimal, or "N/A" if null. */
function fmtRatio(v: number | null | undefined): string {
  if (v == null) return "N/A";
  return v.toFixed(1);
}

/** Format a percentage with sign (e.g. +1.2% or -0.9%). */
function fmtPct(v: number | null | undefined): string {
  if (v == null) return "N/A";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

/** Format ROE as percentage to 1 decimal. */
function fmtRoe(v: number | null | undefined): string {
  if (v == null) return "N/A";
  return `${v.toFixed(1)}%`;
}

/** Format foreign volume in thousands (e.g. +2.3M or -500K shares). */
function fmtForeignFlow(v: number | null | undefined): string {
  if (v == null) return "N/A";
  const abs = Math.abs(v);
  const sign = v >= 0 ? "+" : "-";
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1)}M cp`;
  }
  if (abs >= 1_000) {
    return `${sign}${(abs / 1_000).toFixed(0)}K cp`;
  }
  return `${sign}${abs} cp`;
}

/**
 * Translate ValuationTier to Vietnamese label with premium/discount delta.
 */
function fmtTier(
  tier: ValuationTier,
  stockVal: number | null,
  medianVal: number | null,
): string {
  if (stockVal == null || medianVal == null || medianVal === 0) return "";
  const deltaPct = Math.round(((stockVal - medianVal) / medianVal) * 100);
  const sign = deltaPct >= 0 ? "+" : "";
  switch (tier) {
    case "premium":
      return `PREMIUM ${sign}${deltaPct}%`;
    case "discount":
      return `DISCOUNT ${sign}${deltaPct}%`;
    case "inline":
      return "NGANG BANG";
  }
}

/** Describe ROE position relative to sector median without a tier. */
function fmtRoeVsMedian(roe: number | null, medianRoe: number | null): string {
  if (roe == null || medianRoe == null) return "";
  if (roe > medianRoe) return "TREN MEDIAN";
  if (roe < medianRoe) return "DUOI MEDIAN";
  return "NGANG BANG";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main output builder (exported for unit testing)
// ─────────────────────────────────────────────────────────────────────────────

export interface SectorComparisonInput {
  code: string;
  domain: DomainType;
  financials: Map<string, VnstockFinancialsRow>;
  prices: Map<string, MarketPriceRow>;
  tradingStats: Map<string, TradingStatsRow>;
  peerCodes: string[];
}

/**
 * Build the Vietnamese sector comparison output string.
 * Pure function — no I/O. Exported for unit testing.
 */
export function buildSectorComparisonOutput(input: SectorComparisonInput): string {
  const { code, domain, financials, prices, tradingStats, peerCodes } = input;
  const sectorName = SECTOR_NAME_VI[domain] ?? domain;
  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`=== SO SANH NGANH: ${code} (${sectorName}) ===`);
  lines.push("");

  // ── Valuation comparison section ──────────────────────────────────────────
  const targetFin = financials.get(code);

  // Build peer valuation list (peers only, exclude target for median computation)
  const peerValuations = peerCodes
    .filter((p) => p !== code)
    .map((p) => {
      const f = financials.get(p);
      return {
        code: p,
        pe: f?.pe ?? 0,
        pb: f?.pb ?? 0,
        roe: f?.roe ?? 0,
      };
    })
    .filter((p) => p.pe > 0 || p.pb > 0 || p.roe > 0); // at least one metric present

  // All stocks (target + peers) for median (include target in sector median pool)
  const allValuations = [
    ...peerCodes.map((p) => {
      const f = financials.get(p);
      return { code: p, pe: f?.pe ?? 0, pb: f?.pb ?? 0, roe: f?.roe ?? 0 };
    }),
  ];

  if (targetFin) {
    const targetValuation = {
      code,
      pe: targetFin.pe ?? 0,
      pb: targetFin.pb ?? 0,
      roe: targetFin.roe ?? 0,
    };

    if (peerValuations.length > 0) {
      // Compute comparison vs sector peers (excluding target itself)
      const comparison = compareToSector(targetValuation, peerValuations);

      // Compute sector medians including target for display
      const allPesWithTarget = allValuations.map((v) => v.pe).filter((v) => v > 0);
      const allPbsWithTarget = allValuations.map((v) => v.pb).filter((v) => v > 0);
      const allRoesWithTarget = allValuations.map((v) => v.roe).filter((v) => v > 0);

      const medPe = comparison.sectorMedianPe;
      const medPb = comparison.sectorMedianPb;
      const medRoe = comparison.sectorMedianRoe;

      // Suppress unused variable warnings
      void allPesWithTarget;
      void allPbsWithTarget;
      void allRoesWithTarget;

      lines.push(`${code} vs Median nganh:`);

      if (targetFin.pe != null) {
        const peTier = fmtTier(comparison.peVsSector, targetFin.pe, medPe);
        lines.push(`  PE: ${fmtRatio(targetFin.pe)} vs ${fmtRatio(medPe)} (${peTier})`);
      } else {
        lines.push(`  PE: N/A vs ${fmtRatio(medPe)}`);
      }

      if (targetFin.pb != null) {
        const pbTier = fmtTier(comparison.pbVsSector, targetFin.pb, medPb);
        lines.push(`  PB: ${fmtRatio(targetFin.pb)} vs ${fmtRatio(medPb)} (${pbTier})`);
      } else {
        lines.push(`  PB: N/A vs ${fmtRatio(medPb)}`);
      }

      if (targetFin.roe != null) {
        const roeLabel = fmtRoeVsMedian(targetFin.roe, medRoe);
        lines.push(`  ROE: ${fmtRoe(targetFin.roe)} vs ${fmtRoe(medRoe)} (${roeLabel})`);
      } else {
        lines.push(`  ROE: N/A vs ${fmtRoe(medRoe)}`);
      }
    } else {
      // No peer data available — show target values, no comparison
      lines.push(`${code} (không đủ dữ liệu peers để so sánh):`);
      lines.push(`  PE: ${fmtRatio(targetFin.pe)}`);
      lines.push(`  PB: ${fmtRatio(targetFin.pb)}`);
      lines.push(`  ROE: ${fmtRoe(targetFin.roe)}`);
    }
  } else {
    lines.push(`${code}: Chưa có dữ liệu tài chính (N/A)`);
    lines.push(`  PE: N/A | PB: N/A | ROE: N/A`);
  }

  lines.push("");

  // ── Price section ─────────────────────────────────────────────────────────
  const allCodes = [code, ...peerCodes.filter((p) => p !== code)];
  const targetPrice = prices.get(code);

  const peerChanges = allCodes
    .filter((p) => p !== code)
    .map((p) => prices.get(p)?.change_pct)
    .filter((v): v is number => v != null);

  const sectorAvgChange = peerChanges.length > 0
    ? peerChanges.reduce((a, b) => a + b, 0) / peerChanges.length
    : null;

  lines.push("Giá hôm nay:");
  const targetChangeLine = `  ${code}: ${fmtPct(targetPrice?.change_pct)}`;
  const sectorAvgLine = sectorAvgChange != null
    ? ` | Nganh TB: ${fmtPct(sectorAvgChange)}`
    : "";

  // Describe sector direction
  let sectorDirection = "";
  if (sectorAvgChange != null) {
    if (sectorAvgChange < -0.5) sectorDirection = " (toàn ngành giảm)";
    else if (sectorAvgChange > 0.5) sectorDirection = " (toàn ngành tăng)";
    else sectorDirection = " (ngành ổn định)";
  }

  lines.push(`${targetChangeLine}${sectorAvgLine}${sectorDirection}`);
  lines.push("");

  // ── Foreign flow section ──────────────────────────────────────────────────
  const targetStats = tradingStats.get(code);
  const peerFlows = peerCodes
    .filter((p) => p !== code)
    .map((p) => tradingStats.get(p)?.foreign_volume)
    .filter((v): v is number => v != null);

  if (targetStats?.foreign_volume != null || peerFlows.length > 0) {
    lines.push("Dòng tiền nước ngoài (5 phiên):");
    const targetFlow = fmtForeignFlow(targetStats?.foreign_volume);

    const sectorNetFlow = peerFlows.length > 0
      ? fmtForeignFlow(peerFlows.reduce((a, b) => a + b, 0) / peerFlows.length)
      : "N/A";

    // Compare target vs sector
    let flowComparison = "";
    if (targetStats?.foreign_volume != null && peerFlows.length > 0) {
      const avgPeerFlow = peerFlows.reduce((a, b) => a + b, 0) / peerFlows.length;
      const targetFv = targetStats.foreign_volume;
      if (targetFv > 0 && avgPeerFlow <= 0) {
        flowComparison = ` (${code} MẠNH HƠN ngành)`;
      } else if (targetFv < 0 && avgPeerFlow >= 0) {
        flowComparison = ` (${code} YẾU HƠN ngành)`;
      } else if (targetFv > avgPeerFlow) {
        flowComparison = ` (${code} MẠNH HƠN ngành)`;
      } else if (targetFv < avgPeerFlow) {
        flowComparison = ` (${code} YẾU HƠN ngành)`;
      }
    }

    lines.push(`  ${code}: ${targetFlow} net | Nganh: ${sectorNetFlow} net${flowComparison}`);
    lines.push("");
  }

  // ── Peer detail section ───────────────────────────────────────────────────
  lines.push("Chi tiết peers:");

  const peersToShow = peerCodes.filter((p) => p !== code).slice(0, 8);

  if (peersToShow.length === 0) {
    lines.push("  (Không có dữ liệu peers)");
  } else {
    for (const peerCode of peersToShow) {
      const pf = financials.get(peerCode);
      const pp = prices.get(peerCode);
      const peStr = pf?.pe != null ? `PE=${fmtRatio(pf.pe)}` : "PE=N/A";
      const pbStr = pf?.pb != null ? `PB=${fmtRatio(pf.pb)}` : "PB=N/A";
      const roeStr = pf?.roe != null ? `ROE=${Math.round(pf.roe)}%` : "ROE=N/A";
      const changeStr = pp?.change_pct != null ? fmtPct(pp.change_pct) : "N/A";
      lines.push(`  ${peerCode}: ${peStr} ${pbStr} ${roeStr} | ${changeStr}`);
    }
  }

  lines.push("");
  lines.push(`Cap nhat: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_sector_comparison MCP tool on the given server instance.
 *
 * @param server - McpServer instance to register the tool on.
 */
export function registerSectorComparisonTools(server: McpServer): void {
  server.tool(
    "get_sector_comparison",
    "Compare a watchlist stock against its sector peers: PE/PB/ROE vs sector median, price performance, and foreign flow. Stock must be on the watchlist.",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .describe("Stock ticker code to benchmark against its sector (e.g. \"VCB\", \"FPT\")"),
    },
    async ({ code: rawCode }) => {
      const code = rawCode.toUpperCase().trim();

      try {
        await initDatabase();

        // 1. Look up target stock on watchlist
        const watchlistEntry = getWatchlistEntry(code);
        if (!watchlistEntry) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Lỗi: ${code} không có trong watchlist. Chỉ so sánh được các cổ phiếu trong danh sách theo dõi.`,
              },
            ],
          };
        }

        const domain = watchlistEntry.domain as DomainType;

        // 2. Get all sector peers (include target stock itself in list for context)
        const peers = getSectorPeers(domain);
        const peerCodes = peers.map((p) => p.code);

        // All codes to fetch data for: target + all peers
        const allCodes = Array.from(new Set([code, ...peerCodes]));

        // 3-5. Fetch all data in parallel
        const [financials, prices, tradingStats] = await Promise.all([
          Promise.resolve(fetchVnstockFinancials(allCodes)),
          Promise.resolve(fetchMarketPrices(allCodes)),
          Promise.resolve(fetchTradingStats(allCodes)),
        ]);

        // 6-7. Build output
        const output = buildSectorComparisonOutput({
          code,
          domain,
          financials,
          prices,
          tradingStats,
          peerCodes,
        });

        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (err) {
        logger.error("[get_sector_comparison] Error", {
          code,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi so sánh ngành cho ${code}: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
