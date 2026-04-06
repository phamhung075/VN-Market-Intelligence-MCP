/**
 * Task 285 — Kinh Dich MCP Tools
 *
 * 6 MCP tools exposing the Kinh Dich engine to Claude agents:
 *   - get_kinhdich_reading       — full reading for a watchlist stock
 *   - get_market_hexagram        — VN-Index + macro composite reading
 *   - get_hexagram_history       — timeline of past readings for a stock
 *   - get_transition_probabilities — Markov top-N next hexagrams
 *   - run_hexagram_backtest      — accuracy report for stored readings
 *   - explain_hexagram           — full Vietnamese explanation for hexagram 1-64
 *
 * Score computation is best-effort: each hao dimension tries to read from
 * the local SQLite DB. Any missing data defaults to 0.0 (neutral).
 *
 * Layer: interface/mcp/tools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import { getSectorPeers } from "../../../domain/services/sectorPeers.js";
import type { DomainType } from "../../../../bctc-schema.js";
import { logger } from "../../../infrastructure/logger.js";
import {
  computeReading,
  type MarkovData,
} from "../../../domain/services/kinhDich/kinhDichReading.js";
import { formatReading } from "../../../domain/services/kinhDich/kinhDichFormatter.js";
import { QUE_META, QUE_DATA } from "../../../domain/services/kinhDich/hexagramLibrary.js";
import {
  initHexagramTables,
  storeReading,
  getLatestReading,
  recordTransition,
  getTopTransitions,
  getReadingsForBacktest,
} from "../../../infrastructure/db/hexagramStore.js";
import {
  computeBacktest,
  type BacktestRow,
  type PriceRow,
} from "../../../domain/services/kinhDich/hexagramBacktester.js";

// ─────────────────────────────────────────────────────────────────────────────
// Score computation helpers (best-effort, all wrapped in try/catch)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hao 1 — Sentiment score from recent rag_analyses entries.
 * Counts bullish vs bearish sentiments for the stock code.
 * Returns a value in [-1, +1].
 */
export function computeSentimentScore(code: string): number {
  try {
    const db = getDb();
    const rows = db
      .query<{ sentiment: string }, [string, string]>(
        `SELECT metadata FROM rag_analyses
         WHERE stock_code = ? AND timestamp >= datetime('now', '-7 days')
         ORDER BY timestamp DESC LIMIT 20`,
      )
      .all(code, code);

    // rag_analyses may not have stock_code column in older schemas — try JSON metadata
    if (rows.length === 0) {
      // fallback: search analysis text
      const textRows = db
        .query<{ text: string }, [string]>(
          `SELECT text FROM rag_analyses WHERE text LIKE ? LIMIT 20`,
        )
        .all(`%${code}%`);

      if (textRows.length === 0) return 0.0;

      let bullish = 0;
      let bearish = 0;
      for (const r of textRows) {
        const upper = r.text.toUpperCase();
        if (
          upper.includes("BULLISH") ||
          upper.includes("TANG") ||
          upper.includes("MUA") ||
          upper.includes("TICH CUC")
        ) {
          bullish++;
        } else if (
          upper.includes("BEARISH") ||
          upper.includes("GIAM") ||
          upper.includes("BAN") ||
          upper.includes("TIEU CUC")
        ) {
          bearish++;
        }
      }

      const total = bullish + bearish;
      if (total === 0) return 0.0;
      return (bullish - bearish) / total;
    }

    return 0.0;
  } catch {
    return 0.0;
  }
}

/**
 * Hao 2 — Fundamentals score from vnstock_financials PE vs sector average.
 * Returns a value in [-1, +1]: positive if PE below sector avg (undervalued),
 * negative if PE above (overvalued relative).
 */
export function computeFundamentalsScore(code: string): number {
  try {
    const db = getDb();

    // Check table exists
    const tableCheck = db
      .query<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("vnstock_financials");
    if (!tableCheck) return 0.0;

    // Get target PE
    const targetRow = db
      .query<{ pe: number | null }, [string]>(
        `SELECT pe FROM vnstock_financials WHERE code = ?
         ORDER BY year_report DESC, quarter DESC LIMIT 1`,
      )
      .get(code);

    if (!targetRow?.pe || targetRow.pe <= 0) return 0.0;

    // Get domain for sector average
    const watchlistRow = db
      .query<{ domain: string }, [string]>(
        "SELECT domain FROM watchlist WHERE code = ?",
      )
      .get(code);

    if (!watchlistRow) return 0.0;

    // Average PE for the domain (rough sector proxy)
    const sectorRows = db
      .query<{ pe: number }, [string]>(
        `SELECT f.pe FROM vnstock_financials f
         INNER JOIN watchlist w ON w.code = f.code
         WHERE w.domain = ? AND f.pe > 0
         ORDER BY f.year_report DESC, f.quarter DESC`,
      )
      .all(watchlistRow.domain);

    if (sectorRows.length === 0) return 0.0;

    const avgPE =
      sectorRows.slice(0, 10).reduce((s, r) => s + r.pe, 0) /
      Math.min(sectorRows.length, 10);

    if (avgPE === 0) return 0.0;

    // PE below avg → positive (undervalued = good), above → negative
    const ratio = (avgPE - targetRow.pe) / avgPE;
    return Math.max(-1, Math.min(1, ratio));
  } catch {
    return 0.0;
  }
}

/**
 * Hao 3 — Price score from latest market_prices change_pct.
 * Normalizes to [-1, +1] via a tanh-like scaling (±5% = ±1).
 */
export function computePriceScore(code: string): number {
  try {
    const db = getDb();
    const row = db
      .query<{ change_pct: number | null }, [string]>(
        "SELECT change_pct FROM market_prices WHERE code = ? ORDER BY rowid DESC LIMIT 1",
      )
      .get(code);

    if (!row?.change_pct) return 0.0;
    // Scale: 5% change → score of 1.0
    return Math.max(-1, Math.min(1, row.change_pct / 5.0));
  } catch {
    return 0.0;
  }
}

/**
 * Hao 4 — Foreign flow score from vnstock_trading_stats.
 * Computes net foreign volume ratio: foreign_volume / avg_volume_2w.
 * Returns a value in [-1, +1].
 */
export function computeForeignFlowScore(code: string): number {
  try {
    const db = getDb();

    const tableCheck = db
      .query<{ name: string }, [string]>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      )
      .get("vnstock_trading_stats");
    if (!tableCheck) return 0.0;

    const row = db
      .query<
        { foreign_volume: number | null; avg_volume_2w: number | null },
        [string]
      >(
        `SELECT foreign_volume, avg_volume_2w FROM vnstock_trading_stats
         WHERE code = ? ORDER BY fetched_at DESC LIMIT 1`,
      )
      .get(code);

    if (!row?.foreign_volume || !row?.avg_volume_2w || row.avg_volume_2w === 0) {
      return 0.0;
    }
    return Math.max(-1, Math.min(1, row.foreign_volume / row.avg_volume_2w));
  } catch {
    return 0.0;
  }
}

/**
 * Hao 5 — Sector relative strength.
 * Compares stock change_pct vs average of sector peers from getSectorPeers()
 * (domain service), intersected with codes present in market_prices.
 * Returns a value in [-1, +1].
 */
export function computeSectorScore(code: string): number {
  try {
    const db = getDb();

    // Get domain for this stock
    const watchlistRow = db
      .query<{ domain: string }, [string]>(
        "SELECT domain FROM watchlist WHERE code = ?",
      )
      .get(code);
    if (!watchlistRow) return 0.0;

    // Resolve peer codes from domain service (pure, no I/O)
    const sectorPeerEntries = getSectorPeers(
      watchlistRow.domain as DomainType,
      new Set([code]),
    );
    const peerCodesFromDomain = sectorPeerEntries.map((p) => p.code);

    // Intersect with codes that actually have prices in market_prices
    let peerCodes: string[] = [];
    if (peerCodesFromDomain.length > 0) {
      const placeholders = peerCodesFromDomain.map(() => "?").join(", ");
      const available = db
        .query<{ code: string }, string[]>(
          `SELECT DISTINCT code FROM market_prices
           WHERE code IN (${placeholders})`,
        )
        .all(...peerCodesFromDomain);
      peerCodes = available.map((r) => r.code);
    }

    // Fallback: use all available market_prices codes except the target stock
    if (peerCodes.length === 0) {
      peerCodes = db
        .query<{ code: string }, [string]>(
          "SELECT DISTINCT code FROM market_prices WHERE code != ? LIMIT 20",
        )
        .all(code)
        .map((r) => r.code);
    }

    if (peerCodes.length === 0) return 0.0;

    const placeholders2 = peerCodes.map(() => "?").join(", ");
    const peerPrices = db
      .query<{ change_pct: number | null }, string[]>(
        `SELECT change_pct FROM market_prices WHERE code IN (${placeholders2})`,
      )
      .all(...peerCodes);

    const validChanges = peerPrices
      .map((r) => r.change_pct ?? 0)
      .filter((v) => v !== 0);
    if (validChanges.length === 0) return 0.0;

    const sectorAvg =
      validChanges.reduce((s, v) => s + v, 0) / validChanges.length;

    // My own change
    const myRow = db
      .query<{ change_pct: number | null }, [string]>(
        "SELECT change_pct FROM market_prices WHERE code = ? ORDER BY rowid DESC LIMIT 1",
      )
      .get(code);

    const myChange = myRow?.change_pct ?? 0;
    const relativeStrength = myChange - sectorAvg;
    // Scale: 3% outperformance → 1.0
    return Math.max(-1, Math.min(1, relativeStrength / 3.0));
  } catch {
    return 0.0;
  }
}

/**
 * Hao 6 — Macro score from tracked_indicators (brent_crude_usd, gold_usd_oz, wti_crude_usd).
 * Derives z-score inline from a rolling history window of each indicator.
 * Rising commodity prices = macro stress = negative score for stocks.
 * Returns a value in [-1, +1].
 */
export function computeMacroScore(): number {
  try {
    const db = getDb();
    const indicators = ["brent_crude_usd", "gold_usd_oz", "wti_crude_usd"];
    const placeholders = indicators.map(() => "?").join(", ");

    const rows = db
      .query<
        { indicator: string; value: number },
        string[]
      >(
        `SELECT indicator, value FROM tracked_indicators
         WHERE indicator IN (${placeholders})
         ORDER BY extracted_at DESC LIMIT 80`,
      )
      .all(...indicators);

    if (rows.length === 0) return 0.0;

    // Group by indicator — first value per group is the most recent (ORDER BY extracted_at DESC)
    const byIndicator = new Map<string, number[]>();
    for (const r of rows) {
      const arr = byIndicator.get(r.indicator) ?? [];
      arr.push(r.value);
      byIndicator.set(r.indicator, arr);
    }

    const zScores: number[] = [];
    for (const [, values] of byIndicator) {
      if (values.length < 3) continue;
      const latest = values[0]!;
      const window = values.slice(1);
      const mean = window.reduce((s, v) => s + v, 0) / window.length;
      const std = Math.sqrt(
        window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length,
      );
      if (std === 0) continue;
      zScores.push((latest - mean) / std);
    }

    if (zScores.length === 0) return 0.0;

    const avgZ = zScores.reduce((s, v) => s + v, 0) / zScores.length;
    // High macro stress (positive z = rising commodities) = negative for stocks
    return Math.max(-1, Math.min(1, -avgZ / 2.0));
  } catch {
    return 0.0;
  }
}

/**
 * Compute all 6 hao scores for a stock code.
 * Each score defaults to 0.0 on any error.
 */
export function computeHaoScores(code: string): number[] {
  return [
    computeSentimentScore(code),
    computeFundamentalsScore(code),
    computePriceScore(code),
    computeForeignFlowScore(code),
    computeSectorScore(code),
    computeMacroScore(),
  ];
}

/**
 * Attempt to retrieve Markov data for a stock given its current hexagram.
 */
function getMarkovData(code: string, currentHexagram: number): MarkovData | null {
  try {
    const tops = getTopTransitions(currentHexagram, code, 1);
    if (tops.length === 0) return null;
    const top = tops[0]!;
    if (top.probability === 0) return null;
    const meta = QUE_META.find((q) => q.id === top.toHexagram);
    return {
      nextMostLikely: top.toHexagram,
      nextName: meta?.name ?? `Que ${top.toHexagram}`,
      probability: top.probability,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VN-Index + macro composite scores for market hexagram
// ─────────────────────────────────────────────────────────────────────────────

function computeVnIndexScore(momentumDays: number): number {
  try {
    const db = getDb();
    const rows = db
      .query<{ price: number; updated_at: string }, [number]>(
        `SELECT price, updated_at FROM market_prices_history
         WHERE code = 'VNINDEX'
         ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(momentumDays + 1) as Array<{ price: number; updated_at: string }>;

    if (rows.length < 2) return 0.0;

    const latest = rows[0]!.price;
    const oldest = rows[rows.length - 1]!.price;
    if (oldest === 0) return 0.0;

    const ret = (latest - oldest) / oldest;
    return Math.max(-1, Math.min(1, ret / 0.05));
  } catch {
    return 0.0;
  }
}

/**
 * Derives a z-score for a single indicator from its recent history.
 * Used by get_market_hexagram for USD/VND, oil, gold direction.
 *
 * Sign convention: +z/2.0 (caller interprets the sign for market context).
 * Returns a value in [-1, +1], or 0.0 if fewer than 3 rows exist.
 */
export function computeMacroIndicatorScore(name: string): number {
  try {
    const db = getDb();
    const rows = db
      .query<{ value: number }, [string]>(
        `SELECT value FROM tracked_indicators
         WHERE indicator = ? ORDER BY extracted_at DESC LIMIT 21`,
      )
      .all(name);

    if (rows.length < 3) return 0.0;

    const latest = rows[0]!.value;
    const window = rows.slice(1).map((r) => r.value);
    const mean = window.reduce((s, v) => s + v, 0) / window.length;
    const std = Math.sqrt(
      window.reduce((s, v) => s + (v - mean) ** 2, 0) / window.length,
    );
    if (std === 0) return 0.0;

    const z = (latest - mean) / std;
    return Math.max(-1, Math.min(1, z / 2.0));
  } catch {
    return 0.0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerKinhDichTools(server: McpServer): void {
  // ── 1. get_kinhdich_reading ──────────────────────────────────────────────

  server.tool(
    "get_kinhdich_reading",
    "Compute a full Kinh Dich (I-Ching) reading for a watchlist stock. Encodes 6 market dimensions (sentiment, fundamentals, price, foreign flow, sector, macro) into a 64-hexagram reading with trading signal and Vietnamese interpretation. Stock must be in the watchlist.",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .describe("Stock ticker code (e.g. \"VCB\", \"FPT\")"),
    },
    async ({ code: rawCode }) => {
      const code = rawCode.toUpperCase().trim();
      try {
        await initDatabase();
        initHexagramTables();

        // Verify stock is on watchlist
        const db = getDb();
        const watchlistRow = db
          .query<{ code: string }, [string]>(
            "SELECT code FROM watchlist WHERE code = ?",
          )
          .get(code);

        if (!watchlistRow) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Loi: ${code} khong co trong watchlist. Them co phieu truoc khi doc Kinh Dich.`,
              },
            ],
          };
        }

        // Compute 6 hao scores
        const scores = computeHaoScores(code);

        // Get previous reading for Markov data
        const previousReading = getLatestReading(code);

        // Compute reading (without Markov first, to get current hexagram)
        const prelimReading = computeReading(code, scores, null);
        const currentHexagram = prelimReading.queChiNh.number;

        // Get Markov transition data
        const markovData = getMarkovData(code, currentHexagram);

        // Final reading with Markov
        const reading = computeReading(code, scores, markovData);

        // Store reading
        storeReading({
          stockCode: code,
          hexagramNumber: reading.queChiNh.number,
          hoQueNumber: reading.hoQue.number,
          bienQueNumber: reading.bienQue.number,
          haoStates: JSON.stringify(reading.haos.map((h) => h.state)),
          rawScores: JSON.stringify(scores),
          nguHanhDynamic: reading.nguHanh.dynamic,
          tradingSignal: reading.queChiNh.tradingSignal,
          confidence: reading.queChiNh.confidence,
          actionNote: reading.actionNote,
        });

        // Record transition if we had a previous reading
        if (previousReading) {
          recordTransition(previousReading.hexagramNumber, reading.queChiNh.number, code);
        }

        return {
          content: [{ type: "text" as const, text: formatReading(reading) }],
        };
      } catch (err) {
        logger.error("[get_kinhdich_reading] Error", {
          code,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi doc Kinh Dich cho ${code}: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 2. get_market_hexagram ───────────────────────────────────────────────

  server.tool(
    "get_market_hexagram",
    "Compute a market-wide Kinh Dich hexagram for the VN-Index + macro environment. Uses VN-Index 5d/20d/60d momentum for hao 1-3 and USD/VND, oil, gold sigma deviations for hao 4-6.",
    {},
    async () => {
      try {
        await initDatabase();
        initHexagramTables();

        const scores = [
          computeVnIndexScore(5),   // Hao 1: 5-day momentum
          computeVnIndexScore(20),  // Hao 2: 20-day momentum
          computeVnIndexScore(60),  // Hao 3: 60-day momentum
          computeMacroIndicatorScore("usd_vnd"), // Hao 4: USD/VND
          computeMacroIndicatorScore("oil"),     // Hao 5: oil
          computeMacroIndicatorScore("gold"),    // Hao 6: gold
        ];

        const reading = computeReading("VNINDEX", scores, null);

        // Store market reading
        storeReading({
          stockCode: "VNINDEX",
          hexagramNumber: reading.queChiNh.number,
          hoQueNumber: reading.hoQue.number,
          bienQueNumber: reading.bienQue.number,
          haoStates: JSON.stringify(reading.haos.map((h) => h.state)),
          rawScores: JSON.stringify(scores),
          nguHanhDynamic: reading.nguHanh.dynamic,
          tradingSignal: reading.queChiNh.tradingSignal,
          confidence: reading.queChiNh.confidence,
          actionNote: reading.actionNote,
        });

        return {
          content: [{ type: "text" as const, text: formatReading(reading) }],
        };
      } catch (err) {
        logger.error("[get_market_hexagram] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi tinh que thi truong: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 3. get_hexagram_history ──────────────────────────────────────────────

  server.tool(
    "get_hexagram_history",
    "Get the timeline of Kinh Dich readings for a stock over the past N days (default 30). Shows hexagram changes, trading signals, and confidence levels.",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .describe("Stock ticker code (e.g. \"VCB\")"),
      days: z
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .describe("Number of past days to retrieve (default 30)"),
    },
    async ({ code: rawCode, days = 30 }) => {
      const code = rawCode.toUpperCase().trim();
      try {
        await initDatabase();
        initHexagramTables();

        const readings = getReadingsForBacktest(code, days);

        if (readings.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Chua co lich su que Kinh Dich cho ${code} trong ${days} ngay qua. Chay get_kinhdich_reading truoc.`,
              },
            ],
          };
        }

        const lines: string[] = [];
        lines.push(`=== LICH SU KINH DICH: ${code} (${days} ngay) ===`);
        lines.push(`Tong so lan doc: ${readings.length}`);
        lines.push("");

        for (const r of readings) {
          const meta = QUE_META.find((q) => q.id === r.hexagramNumber);
          const queName = meta?.name ?? `Que ${r.hexagramNumber}`;
          const chinese = meta?.chinese ?? "";
          const ts = r.timestamp.slice(0, 16).replace("T", " ");
          const confPct = Math.round(r.confidence * 100);
          lines.push(
            `${ts} | Que ${r.hexagramNumber} ${queName} ${chinese} | Tin hieu: ${r.tradingSignal} | Do tin cay: ${confPct}%`,
          );
        }

        lines.push("");
        lines.push(
          `Que pho bien nhat: ${getMostFrequentHexagram(readings)} | Cap nhat: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
        );

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[get_hexagram_history] Error", {
          code,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi lay lich su que cho ${code}: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 4. get_transition_probabilities ─────────────────────────────────────

  server.tool(
    "get_transition_probabilities",
    "Get the Markov transition probabilities for a hexagram: which hexagrams are most likely to follow, based on historical observations. Requires prior readings stored in DB.",
    {
      hexagram_number: z
        .number()
        .int()
        .min(1)
        .max(64)
        .describe("Hexagram number 1-64"),
      code: z
        .string()
        .min(1)
        .max(10)
        .optional()
        .describe("Stock code for stock-specific transitions (optional, defaults to all stocks = VNINDEX)"),
    },
    async ({ hexagram_number, code: rawCode }) => {
      const code = rawCode?.toUpperCase().trim() ?? "VNINDEX";
      try {
        await initDatabase();
        initHexagramTables();

        const meta = QUE_META.find((q) => q.id === hexagram_number);
        const fromName = meta?.name ?? `Que ${hexagram_number}`;

        const transitions = getTopTransitions(hexagram_number, code, 10);

        if (transitions.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Chua co du lieu chuyen qua cho Que ${hexagram_number} (${fromName}). Can them lich su doc que.`,
              },
            ],
          };
        }

        const lines: string[] = [];
        lines.push(
          `=== XAC SUAT CHUYEN QUE: Tu Que ${hexagram_number} (${fromName}) ===`,
        );
        lines.push(`Co phieu: ${code}`);
        lines.push("");
        lines.push("Xac suat chuyen sang (top 10):");

        for (const t of transitions) {
          const toMeta = QUE_META.find((q) => q.id === t.toHexagram);
          const toName = toMeta?.name ?? `Que ${t.toHexagram}`;
          const pct = Math.round(t.probability * 100);
          const avgChange =
            t.avgPriceChange !== 0
              ? ` | Thay doi TB: ${t.avgPriceChange >= 0 ? "+" : ""}${(t.avgPriceChange * 100).toFixed(1)}%`
              : "";
          const winRateStr =
            t.winRate > 0
              ? ` | Ty le thang: ${Math.round(t.winRate * 100)}%`
              : "";
          lines.push(
            `  → Que ${t.toHexagram} ${toName}: ${pct}% (${t.count} lan)${avgChange}${winRateStr}`,
          );
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[get_transition_probabilities] Error", {
          hexagram_number,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi lay xac suat chuyen que: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 5. run_hexagram_backtest ─────────────────────────────────────────────

  server.tool(
    "run_hexagram_backtest",
    "Run a backtest of Kinh Dich trading signals against actual price outcomes. Measures how accurately hexagram readings predicted price direction over the past N days.",
    {
      code: z
        .string()
        .min(1)
        .max(10)
        .optional()
        .describe("Stock code to backtest (optional, default VNINDEX)"),
      days: z
        .number()
        .int()
        .min(7)
        .max(365)
        .optional()
        .describe("Number of past days to analyse (default 30)"),
    },
    async ({ code: rawCode, days = 30 }) => {
      const code = rawCode?.toUpperCase().trim() ?? "VNINDEX";
      try {
        await initDatabase();
        initHexagramTables();

        const readings = getReadingsForBacktest(code, days);

        if (readings.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Chua co du lieu backtest cho ${code} trong ${days} ngay. Can them lich su doc que.`,
              },
            ],
          };
        }

        // Fetch price history from market_prices_history (fetched_at column)
        const db = getDb();
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);

        let priceRows: PriceRow[] = [];
        try {
          const rawPriceRows = db
            .query<{ price: number; fetched_at: string }, [string, string]>(
              `SELECT price, fetched_at FROM market_prices_history
               WHERE code = ? AND fetched_at >= ?
               ORDER BY fetched_at ASC`,
            )
            .all(code, since);
          priceRows = rawPriceRows.map((r) => ({
            price: r.price,
            timestamp: r.fetched_at,
          }));
        } catch {
          // Table may not exist — proceed with empty prices (backtest will show 0 returns)
          priceRows = [];
        }

        const backtestReadings: BacktestRow[] = readings.map((r) => ({
          timestamp: r.timestamp,
          hexagramNumber: r.hexagramNumber,
          tradingSignal: r.tradingSignal,
          confidence: r.confidence,
        }));

        const result = computeBacktest(backtestReadings, priceRows);

        const lines: string[] = [];
        lines.push(`=== BACKTEST KINH DICH: ${code} (${days} ngay) ===`);
        lines.push("");
        lines.push(`Tong so lan doc: ${result.totalReadings}`);
        lines.push(`Do chinh xac (BUY/SELL): ${Math.round(result.accuracy * 100)}%`);
        lines.push(
          `Loi nhuan TB 5 phien: ${result.avgReturn5d >= 0 ? "+" : ""}${(result.avgReturn5d * 100).toFixed(2)}%`,
        );

        if (result.bestHexagram) {
          const bestMeta = QUE_META.find(
            (q) => q.id === result.bestHexagram!.number,
          );
          const bestName = bestMeta?.name ?? `Que ${result.bestHexagram.number}`;
          lines.push(
            `Que tot nhat: ${result.bestHexagram.number} ${bestName} (ty le thang: ${Math.round(result.bestHexagram.winRate * 100)}%, ${result.bestHexagram.count} lan)`,
          );
        }

        if (result.worstHexagram) {
          const worstMeta = QUE_META.find(
            (q) => q.id === result.worstHexagram!.number,
          );
          const worstName = worstMeta?.name ?? `Que ${result.worstHexagram.number}`;
          lines.push(
            `Que xau nhat: ${result.worstHexagram.number} ${worstName} (ty le thang: ${Math.round(result.worstHexagram.winRate * 100)}%, ${result.worstHexagram.count} lan)`,
          );
        }

        lines.push("");
        lines.push(
          `Luu y: Backtest chi mang tinh tham khao. Kinh Dich la cong cu ho tro — khong phai cam ket loi nhuan.`,
        );

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[run_hexagram_backtest] Error", {
          code,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi chay backtest Kinh Dich: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 6. explain_hexagram ──────────────────────────────────────────────────

  server.tool(
    "explain_hexagram",
    "Get the full Vietnamese explanation for a hexagram (1-64): name, Chinese character, judgment, image, 6 hao lines, and trading implications.",
    {
      number: z
        .number()
        .int()
        .min(1)
        .max(64)
        .describe("Hexagram number 1-64"),
    },
    async ({ number }) => {
      try {
        const meta = QUE_META.find((q) => q.id === number);
        if (!meta) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Loi: Que ${number} khong ton tai. Que Kinh Dich chi co so tu 1 den 64.`,
              },
            ],
          };
        }

        const data = QUE_DATA[number];
        if (!data) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Loi: Khong co du lieu giai thich cho Que ${number} (${meta.name}).`,
              },
            ],
          };
        }

        const lines: string[] = [];
        lines.push(
          `=== QUE ${number}: ${meta.name} ${meta.chinese} ===`,
        );
        lines.push(`Thuong quan (tren): ${meta.upper} | Ha quan (duoi): ${meta.lower}`);
        lines.push("");

        lines.push(`Y nghia chinh: ${data.coreMeaning}`);
        lines.push("");

        lines.push(`Hao tu (Phan quyet): ${data.judgment.vietnamese}`);
        lines.push(`  ${data.judgment.interpretation}`);
        lines.push("");

        lines.push(`Tuong truyen (Hinh tuong): ${data.image.description}`);
        lines.push(`  Hanh dong: ${data.image.action}`);
        lines.push("");

        lines.push(`Tinh trang que:`);
        lines.push(`  Xu huong: ${data.state.trend}`);
        lines.push(`  Su nghiep: ${data.state.career}`);
        lines.push(`  Canh bao: ${data.state.warning}`);
        lines.push("");

        lines.push("6 Hao (tung duong):");
        for (const line of data.lines) {
          lines.push(
            `  Hao ${line.position} (${line.name}): ${line.vietnamese}`,
          );
          lines.push(`    Ket qua: ${line.outcome} | Hanh dong: ${line.action}`);
          lines.push(`    ${line.interpretation.slice(0, 150)}`);
        }

        lines.push("");

        // Trading summary
        const trend = data.state.trend.toUpperCase();
        let tradingContext = "";
        if (trend.includes("THUAN LOI") || trend.includes("THUẬN LỢI")) {
          tradingContext = "THUAN LOI cho giao dich — xu huong tich cuc";
        } else if (trend.includes("BAT LOI") || trend.includes("BẤT LỢI")) {
          tradingContext = "BAT LOI cho giao dich — can than trong";
        } else {
          tradingContext = "TRUNG TINH — can xem them tin hieu khac";
        }

        lines.push(`Nhan dinh giao dich: ${tradingContext}`);

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[explain_hexagram] Error", {
          number,
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi giai thich Que ${number}: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return the name of the most frequently occurring hexagram in readings.
 */
function getMostFrequentHexagram(
  readings: Array<{ hexagramNumber: number }>,
): string {
  const counts = new Map<number, number>();
  for (const r of readings) {
    counts.set(r.hexagramNumber, (counts.get(r.hexagramNumber) ?? 0) + 1);
  }
  if (counts.size === 0) return "N/A";

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return "N/A";

  const meta = QUE_META.find((q) => q.id === top[0]);
  return `Que ${top[0]} ${meta?.name ?? ""} (${top[1]} lan)`;
}
