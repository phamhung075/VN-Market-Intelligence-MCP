/**
 * Task 082 — Watchlist MCP Tools
 *
 * Interface layer: registers four MCP tools on a McpServer instance.
 *
 * Tools registered:
 *   1. add_to_watchlist       — inserts (or upserts) a stock into the watchlist
 *   2. remove_from_watchlist  — deletes a stock from the watchlist
 *   3. get_watchlist          — returns all watchlist rows formatted for display
 *   4. update_thresholds      — updates alert threshold columns for a stock
 *
 * Alert thresholds are stored as discrete REAL columns in the watchlist table
 * (alert_drop_pct, alert_rise_pct, alert_impact_min) rather than a JSON blob,
 * which ensures they survive a SQLite re-open and are queryable.
 *
 * @module interface/mcp/tools/watchlist
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { getSectorPeers, SECTOR_NAME_VI } from "../../../../domain/services/sectorPeers.js";
import { getCompanyName } from "../../../../domain/services/stockAliases.js";
import { tradingWindowLabel } from "../../../../domain/services/tradingWindow.js";
import type { DomainType } from "../../../../../bctc-schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

/** Valid Vietnamese stock exchange identifiers */
const ExchangeEnum = z.enum(["HOSE", "HNX", "UPCOM"]);

/** Business sector / industry type */
const DomainTypeEnum = z.enum([
  "oil_gas",
  "banking",
  "real_estate",
  "steel",
  "aviation",
  "retail",
  "tech",
  "utilities",
  "agriculture",
  "insurance",
  "securities",
  "pharma",
  "pharmaceutical",
  "logistics",
  "gold_mining",
  "automotive",
  "construction",
  "energy",
  "other",
]);

/**
 * Alert threshold input schema.
 * dropPct  — negative number, e.g. -3 means "alert if price drops 3%"
 * risePct  — positive number, e.g. 5 means "alert if price rises 5%"
 * impactScore — AI impact score minimum (0–10)
 */
const ThresholdsSchema = z.object({
  dropPct: z
    .number()
    .min(-100)
    .max(0)
    .optional()
    .describe("Alert when price drops below this % (e.g. -3)"),
  risePct: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe("Alert when price rises above this % (e.g. 5)"),
  impactScore: z
    .number()
    .min(0)
    .max(10)
    .optional()
    .describe("Minimum AI impact score to trigger alert (0–10)"),
});

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row type
// ─────────────────────────────────────────────────────────────────────────────

interface WatchlistRow {
  code: string;
  exchange: string;
  domain: string;
  notes: string | null;
  added_at: string;
  alert_drop_pct: number;
  alert_rise_pct: number;
  alert_impact_min: number;
  alert_report_new: number;
  price?: number | null;
  change_pct?: number | null;
  price_updated?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper — exported for testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips Unicode diacritics to produce plain ASCII-compatible text.
 * Used for suggestion messages (plain text, no Markdown, Telegram-safe).
 */
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Builds the peer suggestion text appended to an `add_to_watchlist` response.
 *
 * Returns an empty string when:
 *   - `domain` is "other" or unrecognised (no peers)
 *   - All peers for the sector are already in the watchlist
 *
 * @param addedCode    - The ticker just added (excluded from suggestions)
 * @param domain       - The DomainType of the added stock
 * @param watchlistCodes - Set of codes already in the watchlist (excluding addedCode)
 * @returns Suggestion block as a plain-text string, or "" if nothing to suggest
 */
export function buildPeerSuggestionText(
  addedCode: string,
  domain: DomainType,
  watchlistCodes: Set<string>,
): string {
  if (!domain || domain === "other") return "";

  const exclude = new Set([addedCode.toUpperCase(), ...watchlistCodes]);
  const peers = getSectorPeers(domain, exclude, 5);

  if (peers.length === 0) return "";

  const sectorName = stripDiacritics(SECTOR_NAME_VI[domain] ?? domain);
  const peerLines = peers.map((p) => {
    const name = getCompanyName(p.code) ?? p.code;
    return `  ${p.code} (${name})`;
  });

  return (
    `\nGoi y: cung nganh ${sectorName}, ban co the them:\n` +
    peerLines.join("\n") + "\n" +
    `Dung add_to_watchlist de them.`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the four watchlist management tools on an McpServer instance.
 *
 * All tools call `initDatabase()` lazily before the first DB access so the
 * module can be imported without side effects.
 *
 * @param server - The McpServer instance to register tools on.
 */
export function registerWatchlistTools(server: McpServer): void {

  // ── 1. add_to_watchlist ──────────────────────────────────────────────────
  server.tool(
    "add_to_watchlist",
    "Add a Vietnamese stock to the investment watchlist with optional alert thresholds. " +
      "If the stock is already present it will be updated (upsert).",
    {
      actionCode: z
        .string()
        .min(2)
        .max(10)
        .toUpperCase()
        .describe("Stock ticker code (e.g. VCB, HPG, GAS)"),
      exchange: ExchangeEnum.describe("Vietnamese stock exchange"),
      domain: DomainTypeEnum.optional().describe("Business sector / industry"),
      notes: z
        .string()
        .max(500)
        .optional()
        .describe("Personal notes about this position"),
      thresholds: ThresholdsSchema.optional().describe(
        "Custom alert thresholds — defaults used if omitted",
      ),
    },
    async ({ actionCode, exchange, domain, notes, thresholds }) => {
      try {
        await initDatabase();
        const db = getDb();
        const now = new Date().toISOString();

        const dropPct = thresholds?.dropPct ?? -3;
        const risePct = thresholds?.risePct ?? 5;
        // metric-mask-allow: genuine user-configurable alert threshold default ("Custom alert thresholds — defaults used if omitted" per schema above), not a fabricated stand-in metric.
        const impactScore = thresholds?.impactScore ?? 7;

        db.prepare(
          `INSERT INTO watchlist
             (code, exchange, domain, notes, added_at,
              alert_drop_pct, alert_rise_pct, alert_impact_min, alert_report_new)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(code) DO UPDATE SET
             exchange         = excluded.exchange,
             domain           = excluded.domain,
             notes            = excluded.notes,
             alert_drop_pct   = excluded.alert_drop_pct,
             alert_rise_pct   = excluded.alert_rise_pct,
             alert_impact_min = excluded.alert_impact_min,
             alert_report_new = excluded.alert_report_new`,
        ).run(
          actionCode,
          exchange,
          domain ?? "other",
          notes ?? null,
          now,
          dropPct,
          risePct,
          impactScore,
          1,
        );

        // Fetch current watchlist codes for peer suggestion (excluding just-added stock)
        const existingRows = db
          .prepare("SELECT code FROM watchlist WHERE code != ?")
          .all(actionCode) as { code: string }[];
        const existingCodes = new Set(existingRows.map((r) => r.code));

        const suggestion = buildPeerSuggestionText(
          actionCode,
          (domain ?? "other") as DomainType,
          existingCodes,
        );

        return {
          content: [
            {
              type: "text" as const,
              text:
                `Đã thêm ${actionCode} (${exchange}) vào danh sách theo dõi.\n` +
                `Cảnh báo: giảm ${dropPct}% | tăng +${risePct}% | impact >= ${impactScore}/10` +
                suggestion,
            },
          ],
        };
      } catch (err) {
        console.error("[add_to_watchlist] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 2. remove_from_watchlist ────────────────────────────────────────────
  server.tool(
    "remove_from_watchlist",
    "Remove a stock from the watchlist by its ticker code.",
    {
      actionCode: z
        .string()
        .min(2)
        .max(10)
        .toUpperCase()
        .describe("Stock ticker code to remove"),
    },
    async ({ actionCode }) => {
      try {
        await initDatabase();
        const db = getDb();
        const result = db
          .prepare("DELETE FROM watchlist WHERE code = ?")
          .run(actionCode);

        return {
          content: [
            {
              type: "text" as const,
              text:
                result.changes > 0
                  ? `${actionCode} removed from watchlist.`
                  : `${actionCode} was not found in the watchlist.`,
            },
          ],
        };
      } catch (err) {
        console.error("[remove_from_watchlist] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 3. get_watchlist ─────────────────────────────────────────────────────
  server.tool(
    "get_watchlist",
    "Display all stocks in the watchlist with current alert thresholds and last known price.",
    {},
    async () => {
      try {
        await initDatabase();
        const db = getDb();

        const rows = db
          .prepare(
            `SELECT w.*, p.price, p.change_pct, p.updated_at AS price_updated
             FROM watchlist w
             LEFT JOIN market_prices p ON p.code = w.code
             ORDER BY w.domain, w.code`,
          )
          .all() as WatchlistRow[];

        if (rows.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Watchlist is empty. Use add_to_watchlist to add stocks.",
              },
            ],
          };
        }

        // Vietnamese domain names for clarity
        const domainVi: Record<string, string> = {
          banking: "Ngân hàng", tech: "Công nghệ", real_estate: "BĐS",
          steel: "Thép", oil_gas: "Dầu khí", aviation: "Hàng không",
          retail: "Bán lẻ", securities: "Chứng khoán", utilities: "Điện",
          agriculture: "Nông nghiệp", insurance: "Bảo hiểm", pharma: "Dược",
          logistics: "Logistics", gold_mining: "Vàng", automotive: "Ô tô & Cơ khí",
          other: "Khác",
        };

        const lines: string[] = [
          `Watchlist — ${rows.length} cổ phiếu`,
          `Trading window: ${tradingWindowLabel()}`,
          "",
          ...rows.map((r) => {
            const priceStr =
              r.price != null
                ? `${r.price.toLocaleString("vi-VN")} VND` +
                  (r.change_pct != null
                    ? ` (${r.change_pct >= 0 ? "+" : ""}${r.change_pct.toFixed(2)}%)`
                    : "")
                : "N/A";
            const domainName = domainVi[r.domain] ?? r.domain;
            const companyNote = (r as unknown as { company_name?: string }).company_name ? ` — ${(r as unknown as { company_name?: string }).company_name}` : "";

            return (
              `  ${r.code.padEnd(6)} [${r.exchange}] ${domainName}${companyNote}\n` +
              `         Giá: ${priceStr}\n` +
              `         Ngưỡng: giảm ${r.alert_drop_pct}% | tăng +${r.alert_rise_pct}% | impact >= ${r.alert_impact_min}/10` +
              (r.notes ? `\n         Ghi chú: ${r.notes}` : "")
            );
          }),
        ];

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        console.error("[get_watchlist] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );

  // ── 4. update_thresholds ─────────────────────────────────────────────────
  server.tool(
    "update_thresholds",
    "Update the alert thresholds for a specific stock in the watchlist. " +
      "Only the supplied threshold fields are changed; omitted fields keep their current values.",
    {
      actionCode: z
        .string()
        .min(2)
        .max(10)
        .toUpperCase()
        .describe("Stock ticker code to update"),
      thresholds: ThresholdsSchema.describe("New threshold values to apply"),
    },
    async ({ actionCode, thresholds }) => {
      try {
        await initDatabase();
        const db = getDb();

        // Build a partial UPDATE using only the supplied fields
        const setClauses: string[] = [];
        const params: (number | string)[] = [];

        if (thresholds.dropPct !== undefined) {
          setClauses.push("alert_drop_pct = ?");
          params.push(thresholds.dropPct);
        }
        if (thresholds.risePct !== undefined) {
          setClauses.push("alert_rise_pct = ?");
          params.push(thresholds.risePct);
        }
        if (thresholds.impactScore !== undefined) {
          setClauses.push("alert_impact_min = ?");
          params.push(thresholds.impactScore);
        }

        if (setClauses.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No threshold fields provided — nothing to update.",
              },
            ],
          };
        }

        params.push(actionCode);
        const result = db
          .prepare(
            `UPDATE watchlist SET ${setClauses.join(", ")} WHERE code = ?`,
          )
          .run(...params);

        const parts: string[] = [];
        if (thresholds.dropPct !== undefined)
          parts.push(`drop ${thresholds.dropPct}%`);
        if (thresholds.risePct !== undefined)
          parts.push(`rise +${thresholds.risePct}%`);
        if (thresholds.impactScore !== undefined)
          parts.push(`impact >= ${thresholds.impactScore}/10`);

        return {
          content: [
            {
              type: "text" as const,
              text:
                result.changes > 0
                  ? `${actionCode} thresholds updated: ${parts.join(" | ")}`
                  : `${actionCode} not found in watchlist.`,
            },
          ],
        };
      } catch (err) {
        console.error("[update_thresholds] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
