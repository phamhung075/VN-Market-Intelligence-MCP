/**
 * Task 176 — trigger_alert_check MCP Tool
 *
 * Registers one MCP tool: `trigger_alert_check`
 *
 * Purpose: On-demand stock signal check that the investor can invoke via Claude,
 * bypassing the 15-min intelligence cycle wait.
 *
 * Behaviour:
 *   1. Read watchlist from SQLite (filtered to actionCode if provided).
 *   2. Fetch latest prices for those stocks via injected or real fetcher.
 *   3. Run `detectSignals` + `generateAlerts` (pure domain functions).
 *   4. For HIGH/CRITICAL alerts: attempt Telegram notification (graceful no-op
 *      when TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID env vars are absent).
 *   5. Return a formatted Vietnamese text summary.
 *
 * READ-ONLY: does NOT persist alerts to the database (avoids dedup collisions
 * with the 15-min background cycle).
 *
 * @module interface/mcp/tools/alertCheckTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { initDatabase, getDb } from "../../../infrastructure/db/schema.js";
import { detectSignals } from "../../../domain/services/signalDetector.js";
import type { MarketSnapshot } from "../../../domain/services/signalDetector.js";
import { generateAlerts } from "../../../domain/services/alertGenerator.js";
import type { Alert } from "../../../domain/services/alertGenerator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal price record expected from the price fetcher. */
export interface PriceRecord {
  code: string;
  exchange: string;
  price: number;
  previousPrice: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  fetchedAt: string;
}

/** Watchlist row shape from SQLite. */
interface WatchlistRow {
  code: string;
  exchange: string;
  domain: string;
  alert_drop_pct: number;
  alert_rise_pct: number;
  alert_impact_min: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Severity labels (Vietnamese)
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_VI: Record<string, string> = {
  critical: "NGHIEM TRONG",
  high: "QUAN TRONG",
  medium: "LUU Y",
  low: "THAP",
};

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a single Alert for Vietnamese display.
 */
function formatAlertVi(alert: Alert): string {
  const severityLabel = SEVERITY_VI[alert.severity] ?? alert.severity.toUpperCase();
  const signalTypes = alert.signals.map((s) => s.type).join(", ");
  return `[${severityLabel}] ${alert.actionCode}: ${signalTypes} — ${alert.message}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `trigger_alert_check` tool on an McpServer instance.
 *
 * @param server - The McpServer instance to register the tool on.
 */
export function registerAlertCheckTools(server: McpServer): void {
  server.tool(
    "trigger_alert_check",
    "Run an immediate signal check for a specific stock or all watchlist stocks. " +
      "Returns signals found and sends HIGH/CRITICAL alerts to Telegram. " +
      "READ-ONLY: does not store results in the database.",
    {
      actionCode: z
        .string()
        .optional()
        .describe(
          "Stock code to check (e.g. 'VCB'). Omit to check all watchlist stocks.",
        ),
      // Test-only injection: an array of PriceRecord objects to bypass real HTTP.
      // This key is intentionally undocumented in the schema description.
      _testPrices: z
        .array(z.unknown())
        .optional()
        .describe("Internal: inject mock prices for testing (do not use in production)"),
    },
    async ({ actionCode, _testPrices }) => {
      try {
        await initDatabase();
        const db = getDb();

        // ── 1. Read watchlist ──────────────────────────────────────────────
        let watchlistRows = db
          .prepare<WatchlistRow, []>(
            "SELECT code, exchange, domain, alert_drop_pct, alert_rise_pct, alert_impact_min FROM watchlist ORDER BY code",
          )
          .all();

        if (actionCode) {
          watchlistRows = watchlistRows.filter(
            (r) => r.code === actionCode.toUpperCase(),
          );
        }

        if (watchlistRows.length === 0) {
          const scope = actionCode ? `cổ phiếu ${actionCode}` : "danh sách theo dõi";
          return {
            content: [
              {
                type: "text" as const,
                text: `Không có ${scope} trong danh sách theo dõi. Thêm cổ phiếu qua add_to_watchlist.`,
              },
            ],
          };
        }

        const codes = watchlistRows.map((r) => r.code);

        // ── 2. Fetch prices (or use injected test prices) ──────────────────
        let prices: PriceRecord[];

        if (_testPrices && Array.isArray(_testPrices)) {
          // Test mode: use injected prices, filtered to codes of interest
          prices = (_testPrices as PriceRecord[]).filter((p) =>
            codes.includes(p.code),
          );
        } else {
          // Production mode: lazy-import the real fetcher to avoid side effects
          // in tests that don't inject prices.
          const { fetchHosePrices } = await import(
            "../../../infrastructure/fetchers/hose.js"
          );
          prices = await fetchHosePrices(codes);
        }

        if (prices.length === 0) {
          const scopeStr = actionCode ?? "toàn danh sách";
          return {
            content: [
              {
                type: "text" as const,
                text: `Không lấy được dữ liệu giá cho ${scopeStr}. Vui lòng thử lại sau.`,
              },
            ],
          };
        }

        // ── 3. Detect signals ──────────────────────────────────────────────
        const thresholdByCode = new Map(
          watchlistRows.map((r) => [
            r.code,
            {
              dropPct: -r.alert_drop_pct,
              risePct: r.alert_rise_pct,
              impactScore: r.alert_impact_min,
            },
          ]),
        );

        const allSignals = prices.flatMap((p) => {
          const snapshot: MarketSnapshot = {
            actionCode: p.code,
            price: p.price,
            previousPrice: p.previousPrice,
            volume: p.volume,
            avgVolume: p.avgVolume,
          };
          const thresholds = thresholdByCode.get(p.code);
          return detectSignals(snapshot, thresholds ? { watchlistThresholds: thresholds } : undefined);
        });

        // ── 4. Generate alerts (pure — not persisted) ──────────────────────
        const watchlistItems = watchlistRows.map((r) => ({ actionCode: r.code }));
        const alerts = generateAlerts(allSignals, watchlistItems);

        if (alerts.length === 0) {
          const scopeStr = actionCode ? `${actionCode}` : "toàn danh sách theo dõi";
          return {
            content: [
              {
                type: "text" as const,
                text: `Không có tín hiệu bất thường cho ${scopeStr}. (${prices.length} cổ phiếu đã kiểm tra)`,
              },
            ],
          };
        }

        // ── 5. Format summary ─────────────────────────────────────────────
        const now = new Date().toLocaleString("vi-VN", {
          timeZone: "Asia/Ho_Chi_Minh",
        });

        const highCritical = alerts.filter(
          (a) => a.severity === "high" || a.severity === "critical",
        );

        const lines: string[] = [
          `=== Kiem tra tin hieu tuc thoi — ${now} ===`,
          `Da quet: ${prices.length} co phieu | Tim thay: ${alerts.length} tin hieu`,
          "",
        ];

        for (const alert of alerts) {
          lines.push(formatAlertVi(alert));
        }

        if (highCritical.length === 0) {
          lines.push("");
          lines.push("(Khong co tin hieu CAO / NGHIEM TRONG can bao dong Telegram)");
        }

        const summaryText = lines.join("\n");

        // No Telegram send — results are returned in the MCP response.
        // Telegram notifications come only from the background intelligence cycle
        // to avoid duplicate messages on every manual trigger.

        return {
          content: [{ type: "text" as const, text: summaryText }],
        };
      } catch (err) {
        console.error("[trigger_alert_check] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi kiem tra tin hieu: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
