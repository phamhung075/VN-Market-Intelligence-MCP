/**
 * Task 187 — Earnings Calendar MCP tool
 *
 * Interface layer: registers the `get_earnings_calendar` tool on a McpServer.
 *
 * Tool: get_earnings_calendar
 *   Returns the next BCTC filing deadline and current filing status for each
 *   stock in the user's watchlist.
 *
 * Output format per stock:
 *   <CODE>  Q<N>-<YEAR>  <DEADLINE>  <STATUS>  [<filing date>]
 *
 * STATUS labels (Vietnamese):
 *   DA NOP   → đã nộp — filed
 *   QUA HAN  → quá hạn — overdue
 *   SAP DEN  → sắp đến — imminent (≤ 14 days)
 *   (uoc tinh) → ước tính — estimated deadline (> 14 days)
 *
 * @module interface/mcp/tools/earningsCalendarTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "bun:sqlite";

import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import { logger } from "../../../infrastructure/logger.js";
import {
  getCurrentDeadline,
  classifyFilingStatus,
  type FilingStatusCode,
} from "../../../domain/services/earningsCalendar.js";

// ─────────────────────────────────────────────────────────────────────────────
// Internal DB row types
// ─────────────────────────────────────────────────────────────────────────────

interface WatchlistRow {
  code: string;
  exchange: string;
  domain: string;
}

interface FilingRow {
  action_code: string;
  period_year: number;
  period_quarter: number | null;
  published_at: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Map FilingStatusCode → Vietnamese display label */
function statusLabel(code: FilingStatusCode): string {
  switch (code) {
    case "DA_NOP":  return "DA NOP";
    case "QUA_HAN": return "QUA HAN";
    case "SAP_DEN": return "SAP DEN";
    case "UOC_TINH": return "(uoc tinh)";
  }
}

/** Format a Date as "DD/MM/YYYY" (Vietnamese convention) */
function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Extract "YYYY-MM-DD" from an ISO datetime string */
function isoDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load watchlist stocks from the database.
 */
function loadWatchlist(db: Database): WatchlistRow[] {
  try {
    return db
      .query<WatchlistRow, []>("SELECT code, exchange, domain FROM watchlist ORDER BY code")
      .all();
  } catch (err) {
    logger.warn("[get_earnings_calendar] Could not load watchlist", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * For each stock code in `codes`, fetch all financial_reports rows and return
 * them as a flat array.
 */
function loadFilings(db: Database, codes: string[]): FilingRow[] {
  if (codes.length === 0) return [];
  try {
    const placeholders = codes.map(() => "?").join(", ");
    return db
      .query<FilingRow, string[]>(
        `SELECT action_code, period_year, period_quarter, published_at
           FROM financial_reports
          WHERE action_code IN (${placeholders})
          ORDER BY action_code, period_year, period_quarter`,
      )
      .all(...codes);
  } catch (err) {
    logger.warn("[get_earnings_calendar] Could not load financial_reports", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `get_earnings_calendar` MCP tool.
 *
 * @param server - McpServer instance to register the tool on
 * @param dbOverride - Optional Database instance (used in tests)
 */
export function registerEarningsCalendarTools(
  server: McpServer,
  dbOverride?: Database,
): void {
  server.tool(
    "get_earnings_calendar",
    "Show BCTC (financial report) filing deadlines and statuses for all watchlist stocks. " +
      "For each stock, displays the next quarterly filing deadline and one of: " +
      "DA NOP (filed), QUA HAN (overdue), SAP DEN (due within 14 days), " +
      "or (uoc tinh) (estimated — deadline > 14 days away).",
    {
      /** Test-only override for the reference date (ISO: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ssZ) */
      _testDate: z.string().optional().describe("Test-only: override reference date (ISO format)"),
    },
    async ({ _testDate }) => {
      try {
        // Determine reference date
        const today = _testDate ? new Date(_testDate) : new Date();

        // Resolve database
        if (!dbOverride) {
          await initDatabase();
        }
        const db = dbOverride ?? getDb();

        // Load watchlist
        const watchlist = loadWatchlist(db);

        if (watchlist.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Danh sach theo doi trong\n(Them co phieu vao watchlist de xem lich nop BCTC)",
              },
            ],
          };
        }

        // Load all filings for watchlist stocks
        const codes = watchlist.map((w) => w.code);
        const filings = loadFilings(db, codes);

        // Index filings by "CODE:YEAR:QUARTER"
        const filingIndex = new Map<string, string>();
        for (const f of filings) {
          const q = f.period_quarter ?? 0;
          const key = `${f.action_code}:${f.period_year}:${q}`;
          if (f.published_at) {
            // Keep earliest published_at per quarter (in case of duplicates)
            const existing = filingIndex.get(key);
            if (!existing || f.published_at < existing) {
              filingIndex.set(key, f.published_at);
            }
          }
        }

        // Build calendar lines
        const lines: string[] = [
          "=== LICH NOP BCTC ===",
          `Ngay tham chieu: ${today.toISOString().slice(0, 10)}`,
          "",
          "CO PHIEU  QUY      HAN NOP      TRANG THAI         NGAY NOP",
          "--------  -------  -----------  -----------------  ----------",
        ];

        for (const stock of watchlist) {
          const { code, domain } = stock;

          // Determine the most relevant (current) deadline for this stock
          // Banking/insurance get 45-day deadline per Vietnamese regulation
          const nextDeadline = getCurrentDeadline(today, domain);
          const { quarter, year, deadline } = nextDeadline;

          // Look for an existing filing for this quarter
          const filingKey = `${code}:${year}:${quarter}`;
          const publishedAt = filingIndex.get(filingKey) ?? null;
          const filingDateStr = publishedAt ? isoDateOnly(publishedAt) : null;

          // Classify
          const filingStatus = classifyFilingStatus(today, {
            filingDate: filingDateStr,
            quarter,
            year,
            deadline,
          });

          // Format row
          const quarterLabel = `Q${quarter}-${year}`;
          const deadlineStr = formatDate(deadline);
          const statusStr = statusLabel(filingStatus.status);
          const filingDateDisplay =
            filingStatus.status === "DA_NOP" && filingStatus.filingDate
              ? filingStatus.filingDate
              : "";

          lines.push(
            `${code.padEnd(9)} ${quarterLabel.padEnd(8)} ${deadlineStr.padEnd(12)} ${statusStr.padEnd(18)} ${filingDateDisplay}`,
          );
        }

        lines.push("");
        lines.push(`Tong: ${watchlist.length} co phieu`);
        lines.push("Ghi chu: (uoc tinh) = han nop con xa hon 14 ngay | SAP DEN = con duoi 14 ngay | QUA HAN = da qua han | DA NOP = da co bao cao");

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        logger.error("[get_earnings_calendar] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi lay lich nop BCTC: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
