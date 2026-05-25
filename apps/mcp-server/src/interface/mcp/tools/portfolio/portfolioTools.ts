/**
 * Portfolio Tools — MCP tool for on-demand portfolio conviction view
 *
 * Tools registered:
 *   1. get_portfolio_conviction — ranked watchlist by conviction score
 *
 * Optimization (Task 283): all DB reads are batched BEFORE the result-building
 * loop. The loop itself contains zero db.query() / db.prepare() calls.
 * appendKinhDich is eliminated; hexagram formatting is inlined using
 * pre-fetched data and QUE_META from hexagramLibrary.
 *
 * @module interface/mcp/tools/portfolioTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { sqlInClause } from "../../../../infrastructure/db/sqlHelpers.js";
import { computeConviction, deriveKinhDichScore } from "../../../../domain/services/convictionScorer.js";
import { getImfMacroScoreForConviction } from "../../../../application/services/imfConvictionBridge.js";
import { getSectorPeers, SECTOR_NAME_VI } from "../../../../domain/services/sectorPeers.js";
import { buildPositionLine, buildActionNote } from "../../../../domain/services/decisionNoteSynthesizer.js";
import { listOpenPositions } from "../../../../infrastructure/db/positionStore.js";
import { fetchHosePrices, type MarketPrice } from "../../../../infrastructure/fetchers/hose.js";
import { fetchHnxPrices, fetchUpcomPrices } from "../../../../infrastructure/fetchers/hnx.js";
import { logger } from "../../../../infrastructure/logger.js";
// G5-INVERSE REMEDIATION (P1-F): QUE_META now imported from interface-layer reference file.
// Moved from domain/services/kinhDich/hexagramLibrary.ts → kinhdich/hexagramNames.ts
// (GLUE: static display data only — runtime reads still use clients.ts HTTP)
import { QUE_META } from "../kinhdich/hexagramNames.js";
import type { DomainType } from "../../../../../bctc-schema.js";

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
  symbol: string;
  peak_score: number;
  date: string;
}

interface HexagramBatchRow {
  stock_code: string;
  hexagram_number: number;
  bien_que_number: number;
  trading_signal: string | null;
  confidence: number | null;
  rn: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (no DB access)
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve hexagram name from QUE_META by number (1-64). Returns fallback if not found. */
function getQueName(number: number): string {
  const meta = QUE_META.find((q) => q.id === number);
  return meta ? meta.name : `Que ${number}`;
}

/**
 * Inline hexagram block formatter — replaces appendKinhDich call.
 * Uses pre-fetched hexagram row; no DB access.
 *
 * @returns A "\n---\nKinh Dịch: ..." block or a fallback string.
 */
function formatHexagramBlock(
  row: { hexagram_number: number; bien_que_number: number; trading_signal: string | null; confidence: number | null } | undefined,
): string {
  if (!row) {
    return "\n---\nKinh Dịch: Chưa đủ dữ liệu để tính quẻ.";
  }

  const hexName = getQueName(row.hexagram_number);
  const bienName = getQueName(row.bien_que_number);
  const signal = row.trading_signal ?? "N/A";
  const confStr =
    row.confidence != null ? `${Math.round(row.confidence * 100)}%` : "";

  const lines = [
    `\n---`,
    `Kinh Dịch: ${hexName} (${row.hexagram_number}) — ${signal}`,
    `Biến quẻ: ${bienName} → ${bienName}`,
    ...(confStr ? [`Độ tin cậy: ${confStr}`] : []),
  ];
  return lines.join("\n");
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
          return { content: [{ type: "text" as const, text: "Watchlist trống - thêm cổ phiếu trước." }] };
        }

        const codes = watchlist.map((w) => w.code);

        // ── 1. Fetch LIVE prices grouped by exchange (force: true -> works after hours) ──
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
        const missingCodes = codes.filter((c) => !priceMap.has(c));
        if (missingCodes.length > 0) {
          const placeholders = sqlInClause(missingCodes.length);
          try {
            const dbRows = db
              .query<PriceRow & { updated_at?: string }, string[]>(
                `SELECT code, price, change_pct, volume, updated_at FROM market_prices WHERE code IN (${placeholders})`,
              )
              .all(...missingCodes);
            for (const row of dbRows) {
              priceMap.set(row.code, row);
              priceSource = "mixed";
            }
          } catch { /* market_prices may not exist */ }
        }

        // ── 2. Batch: sector peer prices — single query for ALL peer codes ──
        const sectorAvgMap = new Map<string, number>();
        const domains = new Set(watchlist.map((w) => w.domain as DomainType));

        // Collect all unique peer codes across all domains
        const allPeerCodes = new Set<string>();
        const domainPeerMap = new Map<string, string[]>();
        for (const domain of domains) {
          if (domain === "other") continue;
          const peers = getSectorPeers(domain as DomainType);
          const peerCodes = peers.map((p) => p.code);
          domainPeerMap.set(domain, peerCodes);
          for (const code of peerCodes) allPeerCodes.add(code);
        }

        if (allPeerCodes.size > 0) {
          const peerCodeList = Array.from(allPeerCodes);
          const placeholders = sqlInClause(peerCodeList.length);
          try {
            const peerRows = db
              .query<{ code: string; change_pct: number }, string[]>(
                `SELECT code, change_pct FROM market_prices WHERE code IN (${placeholders})`,
              )
              .all(...peerCodeList);

            const peerPriceMap = new Map<string, number>();
            for (const row of peerRows) {
              if (row.change_pct != null) peerPriceMap.set(row.code, row.change_pct);
            }

            // Compute sector averages from the pre-fetched map
            for (const [domain, peerCodes] of domainPeerMap) {
              const values = peerCodes
                .map((c) => peerPriceMap.get(c))
                .filter((v): v is number => v != null);
              if (values.length > 0) {
                const avg = values.reduce((s, v) => s + v, 0) / values.length;
                sectorAvgMap.set(domain, Math.round(avg * 100) / 100);
              }
            }
          } catch { /* market_prices may not exist */ }
        }

        // ── 3. Build open positions index ──
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

        // ── 4. Batch: open alert counts — single query, group in JS ──
        const alertJsonsPerCode = new Map<string, number>();
        try {
          const alertRows = db
            .query<{ affected_actions_json: string }, []>(
              "SELECT DISTINCT affected_actions_json FROM alerts WHERE resolved_at IS NULL",
            )
            .all();
          // Count how many distinct alert rows reference each code
          for (const code of codes) {
            const count = alertRows.filter((r) =>
              (r.affected_actions_json ?? "").includes(code),
            ).length;
            alertJsonsPerCode.set(code, count);
          }
        } catch { /* alerts table may not exist */ }

        // ── 5. Batch: conviction history — single query for all codes ──
        const convictionTrendMap = new Map<string, number[]>();
        if (codes.length > 0) {
          const placeholders = sqlInClause(codes.length);
          try {
            const histRows = db
              .query<ConvictionHistoryRow, string[]>(
                `SELECT symbol, peak_score, date FROM conviction_history
                 WHERE symbol IN (${placeholders})
                 ORDER BY symbol, date DESC`,
              )
              .all(...codes);

            // Group by symbol (already DESC per symbol), take first 7, then reverse to ASC
            const tempMap = new Map<string, number[]>();
            for (const row of histRows) {
              const existing = tempMap.get(row.symbol) ?? [];
              if (existing.length < 7) {
                existing.push(row.peak_score);
              }
              tempMap.set(row.symbol, existing);
            }
            for (const [sym, arr] of tempMap) {
              convictionTrendMap.set(sym, arr.reverse());
            }
          } catch { /* conviction_history may not exist */ }
        }

        // ── 6. Batch: hexagram readings — single query for all codes ──
        const hexagramMap = new Map<string, HexagramBatchRow>();
        if (codes.length > 0) {
          const placeholders = sqlInClause(codes.length);
          try {
            const hexRows = db
              .query<HexagramBatchRow, string[]>(
                `SELECT stock_code, hexagram_number, bien_que_number, trading_signal, confidence,
                        ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY timestamp DESC) as rn
                 FROM kinhdich_readings
                 WHERE stock_code IN (${placeholders})`,
              )
              .all(...codes);

            for (const row of hexRows) {
              if (row.rn === 1) {
                hexagramMap.set(row.stock_code, row);
              }
            }
          } catch { /* kinhdich_readings may not exist */ }
        }

        // Dimension 7: IMF macro — hoist outside watchlist loop (same value per tool call)
        let portfolioImfScore: number | undefined;
        try { portfolioImfScore = getImfMacroScoreForConviction(db); } catch { /* best-effort */ }

        // ── 7. Build conviction results — ZERO db.query() calls inside this loop ──
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
          hexagramBlock: string;
        }[] = [];

        for (const w of watchlist) {
          const price = priceMap.get(w.code);
          const sectorAvg = sectorAvgMap.get(w.domain) ?? null;

          const input: Parameters<typeof computeConviction>[0] = { code: w.code };
          if (price?.change_pct != null) input.changePct = price.change_pct;
          if (price?.volume != null) input.volume = price.volume;
          if (sectorAvg != null) input.sectorAvgPct = sectorAvg;

          // Dimension 6: Kinh Dich — use pre-fetched hexagram data
          const kdRow = hexagramMap.get(w.code);
          if (kdRow?.trading_signal != null) {
            input.kinhDichScore = deriveKinhDichScore(
              kdRow.trading_signal,
              kdRow.confidence ?? undefined,
            );
          }

          // Dimension 7: IMF macro — inject pre-hoisted score
          if (portfolioImfScore !== undefined) {
            input.imfMacroScore = portfolioImfScore;
          }

          const conviction = computeConviction(input);

          // Use pre-fetched alert count
          const openAlerts = alertJsonsPerCode.get(w.code) ?? 0;

          // Use pre-fetched conviction trend
          const trend = convictionTrendMap.get(w.code) ?? [];

          // Position P&L line and action note
          const pos = positionMap.get(w.code) ?? null;
          const positionLine = buildPositionLine(pos);
          const actionNote = buildActionNote({
            convictionScore: conviction.score,
            pnlPct: pos ? pos.pnlPct : null,
            direction: conviction.direction,
          });

          // Inline hexagram block (replaces appendKinhDich call — no DB hit)
          const hexagramBlock = formatHexagramBlock(kdRow);

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
            hexagramBlock,
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
          const alertStr = r.openAlerts > 0 ? ` | ${r.openAlerts} alert` : "";
          const trendStr = r.trend.length >= 2 ? ` | trend: [${r.trend.map((t) => t.toFixed(2)).join(",")}]` : "";

          const positionBlock = [
            `${r.code} - ${r.level.toUpperCase()} (${r.score.toFixed(2)})`,
            `  ${priceStr} ${chgStr} | ${sectorStr}${alertStr}${trendStr}`,
            `  ${r.summary}`,
            `  ${r.positionLine}`,
            `  ${r.actionNote}`,
          ].join("\n") + r.hexagramBlock;

          lines.push(positionBlock);
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
