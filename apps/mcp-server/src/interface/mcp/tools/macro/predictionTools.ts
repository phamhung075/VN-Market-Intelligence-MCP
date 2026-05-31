/**
 * Task 168 — Prediction Markets MCP Tool
 *
 * Interface layer: registers one MCP tool on a McpServer instance.
 *
 * Tools registered:
 *   1. get_prediction_markets — query prediction markets with optional filters,
 *      joined with recent signals (last 1 hour) and enriched with VN cascade
 *      mapping via mapPredictionToVn().
 *
 * @module interface/mcp/tools/predictionTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { mapPredictionToVn } from "../../../../domain/services/predictionCascadeMapper.js";
import {
  computePredictionAccuracy,
  type PredictionAccuracyRow,
} from "../../../../scheduler/macro/predictionOutcomeJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row types
// ─────────────────────────────────────────────────────────────────────────────

interface PredictionMarketRow {
  id: string;
  question: string;
  end_date: string;
  yes_price: number;
  no_price: number;
  volume_24h: number;
  volume_total: number;
  liquidity: number;
  last_trade_price: number;
  unique_wallets: number;
  tags: string;        // JSON string[]
  fetched_at: string;
  updated_at: string;
  active_signal_types: string | null;   // GROUP_CONCAT result
  all_mapped_stocks: string | null;     // GROUP_CONCAT result
  all_mapped_sectors: string | null;    // GROUP_CONCAT result
}

// ─────────────────────────────────────────────────────────────────────────────
// Output shape helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Deduplicated array from a comma-delimited GROUP_CONCAT string. */
function splitConcat(raw: string | null): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

/** Parse tags JSON; return [] on error. */
function parseTags(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

/**
 * Build the enriched output object for one market row.
 * Calls mapPredictionToVn() to derive VN sector/stock relevance if the
 * GROUP_CONCAT join fields are empty (market has no stored signals yet).
 */
function buildMarketOutput(row: PredictionMarketRow): Record<string, unknown> {
  const activeSignals = splitConcat(row.active_signal_types);
  const tags = parseTags(row.tags);

  // Derive sector/stock mapping from the cascade mapper
  const mappings = mapPredictionToVn(row.question, tags);
  const mappedSectors = [...new Set(mappings.flatMap((m) => m.sectors))];
  const mappedStocks = [...new Set(mappings.flatMap((m) => m.stocks))];

  return {
    id: row.id,
    question: row.question,
    endDate: row.end_date,
    yesPrice: row.yes_price,
    noPrice: row.no_price,
    volume24h: row.volume_24h,
    volumeTotal: row.volume_total,
    liquidity: row.liquidity,
    lastTradePrice: row.last_trade_price,
    uniqueWalletsCount: row.unique_wallets,
    tags,
    fetchedAt: row.fetched_at,
    activeSignals,
    mappedSectors,
    mappedStocks,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Accuracy formatter (exported for testability — task 1411)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format prediction accuracy rows as plain Vietnamese text.
 *
 * @param rows - Empty → no-data message; non-empty → table
 * @param days - Lookback window echoed in header
 */
export function formatPredictionAccuracy(
  rows: PredictionAccuracyRow[],
  days: number,
): string {
  if (rows.length === 0) {
    return (
      `Không có dữ liệu kết quả tín hiệu dự báo trong ${days} ngày qua.\n` +
      `(Việc xác thực kết quả được chạy tự động hàng tuần vào Chủ nhật 08:00 UTC.)`
    );
  }

  const header =
    `Độ chính xác tín hiệu Polymarket (${days} ngày qua)\n` +
    `${"─".repeat(60)}\n`;

  const lines = rows.map((r) => {
    const pctStr = (r.precision * 100).toFixed(1);
    return (
      `Loại: ${r.signalType}\n` +
      `  Tổng số: ${r.total}  |  Xác nhận: ${r.confirmed}  |  Sai: ${r.falsePositive}  |  Trung tính: ${r.neutral}\n` +
      `  Độ chính xác: ${pctStr}%`
    );
  });

  const overall = rows.reduce(
    (acc, r) => { acc.total += r.total; acc.confirmed += r.confirmed; acc.falsePositive += r.falsePositive; return acc; },
    { total: 0, confirmed: 0, falsePositive: 0 },
  );
  const overallDecided = overall.confirmed + overall.falsePositive;
  const overallPrecision =
    overallDecided > 0 ? ((overall.confirmed / overallDecided) * 100).toFixed(1) : "N/A";

  const footer =
    `${"─".repeat(60)}\n` +
    `Tổng hợp: ${overall.total} kết quả | ` +
    `Xác nhận: ${overall.confirmed} | ` +
    `Sai: ${overall.falsePositive} | ` +
    `Độ chính xác tổng: ${overallPrecision}%`;

  return header + lines.join("\n\n") + "\n\n" + footer;
}

/**
 * Register the prediction markets tool on an McpServer instance.
 *
 * @param server - The McpServer instance to register tools on.
 */
export function registerPredictionTools(server: McpServer): void {

  // ── get_prediction_accuracy ──────────────────────────────────────────────
  server.tool(
    "get_prediction_accuracy",
    "Computed from Polymarket prediction signals only (predictionOutcomeJob). " +
      "Measures precision = confirmed/(confirmed+false_positive) for volume_spike/ " +
      "probability_shift signals vs ±2% price moves. Distinct from get_calibration_report " +
      "(Brier/machine accuracy) and get_label_accuracy_report (human-labelled quality). " +
      "Returns retrospective accuracy metrics for Polymarket prediction signals — " +
      "how often volume_spike or probability_shift signals actually predicted VN stock moves. " +
      "Outcomes are validated weekly by comparing signal direction against ±2% price moves in the 48h window.",
    {
      days: z.coerce
        .number()
        .int()
        .min(1)
        .max(365)
        .optional()
        .default(30)
        .describe("Rolling lookback window in days (default: 30, max: 365)"),
    },
    async ({ days: daysRaw }) => {
      const days = daysRaw ?? 30;

      try {
        await initDatabase();
        const db = getDb();

        const rows = computePredictionAccuracy(db, days);

        const text = formatPredictionAccuracy(rows, days);
        return {
          content: [{ type: "text" as const, text }],
        };
      } catch (err) {
        console.error("[get_prediction_accuracy] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi tính độ chính xác: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── get_prediction_markets ───────────────────────────────────────────────
  server.tool(
    "get_prediction_markets",
    "Returns current Polymarket prediction markets relevant to Vietnamese stocks, " +
      "with detected probability shift and volume spike signals. " +
      "Use filter='signals_only' to focus on markets with active anomalies.",
    {
      filter: z
        .enum(["all", "signals_only"])
        .optional()
        .default("all")
        .describe(
          "Filter mode: 'all' returns every stored market; " +
            "'signals_only' returns only markets with signals detected in the last hour.",
        ),
      limit: z.coerce
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .default(20)
        .describe("Maximum number of markets to return (default: 20, max: 50)"),
    },
    async ({ filter: filterRaw, limit: limitRaw }) => {
      const filter = filterRaw ?? "all";
      const limit = limitRaw ?? 20;

      try {
        await initDatabase();
        const db = getDb();

        // ── Query prediction_markets LEFT JOIN prediction_signals (last 1h) ──
        const havingClause =
          filter === "signals_only"
            ? "HAVING active_signal_types IS NOT NULL"
            : "";

        // Report 984: filter out expired markets (NBA/NHL/old Fed from 2022-2023)
        // that have end_date in the past. They have zero volume/liquidity, slow
        // analysis, and incorrectly map sports markets to VN sectors.
        const nowIso = new Date().toISOString();

        // Use ISO 8601 cutoff (with T separator) to match JS Date.toISOString() format.
        // SQLite datetime('now') uses a space separator; strftime with 'T' ensures
        // consistent lexicographic ordering against stored ISO strings.
        const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        // Report 2768-2770: exclude stale markets (fetched_at > 7d old) and
        // t___-mkt-* test fixture IDs (e.g. t163-mkt-001 from schema tests).
        // Staleness tightened from 30d → 7d so fixtures with 2026-04-01 dates
        // (36d old) are excluded even if the ID filter is somehow bypassed.
        const staleCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const rows = db
          .prepare(
            `SELECT pm.*,
                    GROUP_CONCAT(ps.signal_type)   AS active_signal_types,
                    GROUP_CONCAT(ps.mapped_stocks)  AS all_mapped_stocks,
                    GROUP_CONCAT(ps.mapped_sectors) AS all_mapped_sectors
             FROM prediction_markets pm
             LEFT JOIN prediction_signals ps
               ON ps.market_id = pm.id
               AND ps.detected_at >= $cutoff
             WHERE (pm.end_date IS NULL OR pm.end_date = '' OR pm.end_date >= $now)
               AND pm.fetched_at >= $staleCutoff
               AND pm.id NOT LIKE 't___-mkt-%'
             GROUP BY pm.id
             ${havingClause}
             ORDER BY pm.fetched_at DESC
             LIMIT $limit`,
          )
          .all({ $cutoff: cutoff, $now: nowIso, $staleCutoff: staleCutoff, $limit: limit }) as PredictionMarketRow[];

        // Count total signal rows within the last hour (for the signalCount meta-field)
        const signalCountRow = db
          .prepare(
            `SELECT COUNT(*) as cnt
             FROM prediction_signals
             WHERE detected_at >= $cutoff`,
          )
          .get({ $cutoff: cutoff }) as { cnt: number };

        const signalCount = signalCountRow?.cnt ?? 0;

        // Last poll timestamp from the most recent market row.
        // When the row set is empty (e.g. signals_only filter with no fresh
        // signals), still surface MAX(fetched_at) from prediction_markets so
        // users can see the poller is alive — analysis-agent report #686
        // mistook a quiet signal window for a regression because lastPollAt
        // was null even though the fetcher was healthy.
        let lastPollAt: string | null = null;
        if (rows.length > 0) {
          lastPollAt = rows.reduce((latest, r) =>
            r.fetched_at > latest.fetched_at ? r : latest,
          ).fetched_at;
        } else {
          try {
            const fallback = db
              .prepare("SELECT MAX(fetched_at) AS ts FROM prediction_markets")
              .get() as { ts: string | null } | undefined;
            lastPollAt = fallback?.ts ?? null;
          } catch {
            lastPollAt = null;
          }
        }

        const markets = rows.map(buildMarketOutput);

        const output = {
          markets,
          totalRelevantMarkets: markets.length,
          lastPollAt,
          signalCount,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(output, null, 2) }],
        };
      } catch (err) {
        console.error("[get_prediction_markets] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error retrieving prediction markets: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
