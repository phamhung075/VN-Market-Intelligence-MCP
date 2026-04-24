/**
 * Task 217 — compare_stocks MCP Tool
 *
 * Side-by-side comparison of 2-5 Vietnamese stocks.
 *
 * Data sources (all local SQLite — no network):
 *   - market_prices       — price, change_pct
 *   - financial_reports   — P/E, ROE, net_revenue (latest sort_key per stock)
 *   - alerts              — alert count for last 7 days
 *   - conviction_history  — latest conviction score (optional table)
 *
 * Output: plain-text Vietnamese table, no Markdown, no emojis.
 *
 * @module interface/mcp/tools/compare
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, initDatabase } from "../../../../infrastructure/db/schema.js";
import { logger } from "../../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal row shapes
// ─────────────────────────────────────────────────────────────────────────────

interface PriceRow {
  code: string;
  price: number | null;
  change_pct: number | null;
}

interface FinancialRow {
  action_code: string;
  pe: number | null;
  roe: number | null;
  net_revenue: number | null;
  prev_net_revenue: number | null;
}

interface AlertCountRow {
  code: string;
  cnt: number;
}

interface ConvictionRow {
  action_code: string;
  score: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data access helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch current prices for a list of stock codes.
 * Returns a map: code → PriceRow (missing codes are absent from map).
 */
function fetchPrices(codes: string[]): Map<string, PriceRow> {
  const db = getDb();
  const placeholders = codes.map(() => "?").join(", ");
  const rows = db
    .query<PriceRow, string[]>(
      `SELECT code, price, change_pct FROM market_prices WHERE code IN (${placeholders})`,
    )
    .all(...codes);

  const map = new Map<string, PriceRow>();
  for (const row of rows) map.set(row.code, row);
  return map;
}

/**
 * Fetch latest financial report metrics for each code.
 *
 * "Latest" is determined by the MAX(sort_key) per stock. Also fetches the
 * net_revenue from the immediately prior period for YoY delta calculation.
 *
 * Returns a map: code → FinancialRow.
 */
function fetchFinancials(codes: string[]): Map<string, FinancialRow> {
  const db = getDb();
  const placeholders = codes.map(() => "?").join(", ");

  // Get latest pe, roe, net_revenue per stock
  const latestRows = db
    .query<
      { action_code: string; pe: number | null; roe: number | null; net_revenue: number | null; sort_key: string },
      string[]
    >(
      `SELECT action_code, pe, roe, net_revenue, sort_key
       FROM financial_reports
       WHERE action_code IN (${placeholders})
         AND sort_key = (
           SELECT MAX(f2.sort_key)
           FROM financial_reports f2
           WHERE f2.action_code = financial_reports.action_code
         )`,
    )
    .all(...codes);

  const map = new Map<string, FinancialRow>();
  for (const row of latestRows) {
    map.set(row.action_code, {
      action_code: row.action_code,
      pe: row.pe,
      roe: row.roe,
      net_revenue: row.net_revenue,
      prev_net_revenue: null,
    });
  }

  // For each stock that has a latest report, fetch the immediately prior
  // period's net_revenue for YoY calculation
  for (const row of latestRows) {
    const prevRow = db
      .query<{ net_revenue: number | null }, [string, string]>(
        `SELECT net_revenue
         FROM financial_reports
         WHERE action_code = ?
           AND sort_key < ?
         ORDER BY sort_key DESC
         LIMIT 1`,
      )
      .get(row.action_code, row.sort_key);

    if (prevRow) {
      const entry = map.get(row.action_code);
      if (entry) entry.prev_net_revenue = prevRow.net_revenue;
    }
  }

  return map;
}

/**
 * Count alerts per stock in the last 7 days.
 * Alerts store the affected stock code in `affected_actions_json` as a JSON array
 * of objects `{ code: string }`.
 *
 * Returns a map: code → count.
 */
function fetchAlertCounts(codes: string[]): Map<string, number> {
  const db = getDb();
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // We fetch all recent alerts and count by parsing affected_actions_json
  const rows = db
    .query<{ id: string; affected_actions_json: string | null }, [string]>(
      `SELECT id, affected_actions_json
       FROM alerts
       WHERE triggered_at >= ?`,
    )
    .all(cutoff);

  const counts = new Map<string, number>(codes.map((c) => [c, 0]));
  const codeSet = new Set(codes);

  for (const row of rows) {
    if (!row.affected_actions_json) continue;
    let actions: Array<{ code?: string }>;
    try {
      actions = JSON.parse(row.affected_actions_json) as Array<{ code?: string }>;
    } catch {
      continue;
    }
    for (const action of actions) {
      if (action.code && codeSet.has(action.code)) {
        counts.set(action.code, (counts.get(action.code) ?? 0) + 1);
      }
    }
  }

  return counts;
}

/**
 * Fetch latest conviction score per stock from `conviction_history` if it exists.
 * Returns a map: code → score. Missing codes have no entry.
 * If the table does not exist, returns an empty map (graceful degradation).
 */
function fetchConviction(codes: string[]): Map<string, number> {
  const db = getDb();
  const map = new Map<string, number>();

  // Check if table exists
  const tableCheck = db
    .query<{ name: string }, [string]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    )
    .get("conviction_history");

  if (!tableCheck) return map;

  const placeholders = codes.map(() => "?").join(", ");
  try {
    const rows = db
      .query<ConvictionRow, string[]>(
        `SELECT action_code, score
         FROM conviction_history
         WHERE action_code IN (${placeholders})
           AND scored_at = (
             SELECT MAX(ch2.scored_at)
             FROM conviction_history ch2
             WHERE ch2.action_code = conviction_history.action_code
           )`,
      )
      .all(...codes);

    for (const row of rows) map.set(row.action_code, row.score);
  } catch (err) {
    logger.warn("[compare_stocks] conviction_history query failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

const COL_WIDTH = 10;
const LABEL_WIDTH = 14;

/** Left-pad a string to a fixed width, truncating if too long. */
function col(value: string, width: number = COL_WIDTH): string {
  const s = value.length > width ? value.slice(0, width) : value;
  return s.padEnd(width);
}

/** Format a price number with thousands separator (no decimals for VND). */
function fmtPrice(v: number | null | undefined): string {
  if (v == null) return "N/A";
  return Math.round(v).toLocaleString("en-US");
}

/** Format a change percentage with sign. */
function fmtChangePct(v: number | null | undefined): string {
  if (v == null) return "N/A";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

/** Format a ratio value to 1 decimal. */
function fmtRatio(v: number | null | undefined): string {
  if (v == null) return "N/A";
  return v.toFixed(1);
}

/** Format ROE as percentage with 1 decimal. */
function fmtRoe(v: number | null | undefined): string {
  if (v == null) return "N/A";
  return `${v.toFixed(1)}%`;
}

/** Format YoY revenue change. Returns N/A if either value is missing. */
function fmtRevenueYoy(
  current: number | null | undefined,
  previous: number | null | undefined,
): string {
  if (current == null || previous == null || previous === 0) return "N/A";
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

/** Build a single row of the comparison table. */
function buildRow(
  label: string,
  values: string[],
): string {
  const labelCell = label.padEnd(LABEL_WIDTH);
  const valueCells = values.map((v) => col(v)).join(" | ");
  return `${labelCell} | ${valueCells}`;
}

/** Build the separator line matching the table width. */
function buildSeparator(colCount: number): string {
  const width = LABEL_WIDTH + 3 + colCount * (COL_WIDTH + 3) - 3;
  return "-".repeat(width);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the compare_stocks MCP tool on the given server instance.
 *
 * @param server - McpServer instance to register the tool on.
 */
export function registerCompareTools(server: McpServer): void {
  server.tool(
    "compare_stocks",
    "Compare 2-5 stocks side by side: price, P/E, ROE, revenue delta YoY, alert count (last 7 days), and conviction score.",
    {
      codes: z
        .array(z.string().min(1).max(10))
        .min(2)
        .max(5)
        .describe("Stock codes to compare (2-5 tickers, e.g. [\"VCB\", \"FPT\", \"HPG\"])"),
    },
    async ({ codes: rawCodes }) => {
      // Validate count (Zod handles this, but be explicit for clear error messages)
      if (rawCodes.length < 2) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Lỗi: Cần ít nhất 2 mã cổ phiếu để so sánh (at least 2 codes required).",
            },
          ],
        };
      }
      if (rawCodes.length > 5) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Lỗi: Tối đa 5 mã cổ phiếu mỗi lần so sánh (at most 5 codes per comparison).",
            },
          ],
        };
      }

      // Normalise to uppercase
      const codes = rawCodes.map((c) => c.toUpperCase());

      try {
        await initDatabase();

        // Fetch all data in parallel
        const [prices, financials, alertCounts, conviction] = await Promise.all([
          Promise.resolve(fetchPrices(codes)),
          Promise.resolve(fetchFinancials(codes)),
          Promise.resolve(fetchAlertCounts(codes)),
          Promise.resolve(fetchConviction(codes)),
        ]);

        // ── Build output table ────────────────────────────────────────────────
        const lines: string[] = [];

        lines.push(`So sánh cổ phiếu (${codes.length} mã)`);
        lines.push("");

        const sep = buildSeparator(codes.length);

        // Header row
        lines.push(buildRow("Chỉ tiêu", codes));
        lines.push(sep);

        // Gia (price)
        const priceVals = codes.map((c) => fmtPrice(prices.get(c)?.price));
        lines.push(buildRow("Giá", priceVals));

        // Thay doi (change %)
        const changeVals = codes.map((c) =>
          fmtChangePct(prices.get(c)?.change_pct),
        );
        lines.push(buildRow("Thay đổi", changeVals));

        lines.push(sep);

        // P/E
        const peVals = codes.map((c) => fmtRatio(financials.get(c)?.pe));
        lines.push(buildRow("P/E", peVals));

        // ROE
        const roeVals = codes.map((c) => fmtRoe(financials.get(c)?.roe));
        lines.push(buildRow("ROE", roeVals));

        // DT YoY (revenue year-over-year change)
        const yoyVals = codes.map((c) => {
          const f = financials.get(c);
          return fmtRevenueYoy(f?.net_revenue, f?.prev_net_revenue);
        });
        lines.push(buildRow("DT YoY", yoyVals));

        lines.push(sep);

        // Canh bao (alert count last 7 days)
        const alertVals = codes.map((c) =>
          String(alertCounts.get(c) ?? 0),
        );
        lines.push(buildRow("Cảnh báo (7d)", alertVals));

        // Xac tin (conviction score)
        const convictionVals = codes.map((c) => {
          const s = conviction.get(c);
          return s != null ? s.toFixed(1) : "N/A";
        });
        lines.push(buildRow("Xác tín", convictionVals));

        lines.push("");
        lines.push(`Cập nhật: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`);

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[compare_stocks] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Lỗi khi so sánh cổ phiếu: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
