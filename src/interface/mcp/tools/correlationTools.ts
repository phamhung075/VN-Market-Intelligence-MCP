/**
 * Task 189 — Correlation Matrix MCP Tool
 *
 * Interface layer: registers the `get_correlation_matrix` tool on a McpServer.
 *
 * The tool:
 *   1. Reads price history from `market_prices_history` (last N days).
 *   2. Computes daily returns for each stock.
 *   3. Runs the Pearson correlation matrix (domain service).
 *   4. Returns Vietnamese formatted table + diversification score.
 *
 * Supports `_testDb` injection for in-memory SQLite in tests, so no network
 * or filesystem access is required during the test suite.
 *
 * @module interface/mcp/tools/correlationTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Database } from "bun:sqlite";

import {
  computeCorrelationMatrix,
  diversificationScore,
  correlationLabel,
  diversificationGrade,
} from "../../../domain/services/correlationCalculator.js";
import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";
import { logger } from "../../../infrastructure/logger.js";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PriceRow {
  code: string;
  price: number;
  fetched_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reads all watchlist codes from the database.
 * Returns empty array if table doesn't exist or is empty.
 */
function getWatchlistCodes(db: Database): string[] {
  try {
    const rows = db
      .query<{ code: string }, []>("SELECT code FROM watchlist")
      .all();
    return rows.map((r) => r.code);
  } catch {
    return [];
  }
}

/**
 * Queries `market_prices_history` for the last `days` calendar days,
 * grouped per stock code, ordered by date ascending.
 *
 * Returns a Map from stock code → ordered array of daily prices (VND).
 * Only one price per day is kept (the most recent record of that day).
 */
function loadPriceHistory(
  db: Database,
  codes: string[],
  days: number,
): Map<string, number[]> {
  if (codes.length === 0) return new Map();

  // Ensure the table exists (it may not in tests with a fresh :memory: DB)
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS market_prices_history (
        code       TEXT NOT NULL,
        price      REAL NOT NULL,
        volume     REAL NOT NULL DEFAULT 0,
        fetched_at TEXT NOT NULL,
        PRIMARY KEY (code, fetched_at)
      )
    `);
  } catch {
    // Table already exists — ignore
  }

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10); // "YYYY-MM-DD"

  // Build parameterised IN clause
  const placeholders = codes.map(() => "?").join(", ");

  let rows: PriceRow[];
  try {
    rows = db
      .query<PriceRow, string[]>(
        `SELECT code, price, fetched_at
         FROM market_prices_history
         WHERE code IN (${placeholders})
           AND fetched_at >= ?
         ORDER BY code ASC, fetched_at ASC`,
      )
      .all(...codes, cutoff);
  } catch {
    return new Map();
  }

  // Group by code → deduplicate to one price per calendar day (last record)
  const grouped = new Map<string, Map<string, number>>();
  const rawByCode = new Map<string, number[]>();
  for (const row of rows) {
    const day = row.fetched_at.slice(0, 10);
    if (!grouped.has(row.code)) grouped.set(row.code, new Map());
    grouped.get(row.code)!.set(day, row.price); // last record for that day wins
    if (!rawByCode.has(row.code)) rawByCode.set(row.code, []);
    rawByCode.get(row.code)!.push(row.price);
  }

  // Convert to ordered price arrays.
  // Preferred path: one sample per calendar day (for proper daily returns).
  // Fallback path (task 308): when only intraday data exists for a single day
  // (first day of deployment, or tight time window), fall back to the raw
  // intraday series downsampled to ≤30 evenly-spaced points. Without this,
  // get_correlation_matrix returns empty every time the watchlist has <2
  // calendar days of history — producing the '0 stocks analysed' complaint.
  const result = new Map<string, number[]>();
  for (const [code, dayMap] of grouped) {
    const daily = Array.from(dayMap.values());
    if (daily.length >= 2) {
      result.set(code, daily);
      continue;
    }
    const raw = rawByCode.get(code) ?? [];
    if (raw.length >= 10) {
      // Downsample to at most 30 points preserving order
      const stride = Math.max(1, Math.floor(raw.length / 30));
      const sampled: number[] = [];
      for (let i = 0; i < raw.length; i += stride) {
        const v = raw[i];
        if (v !== undefined) sampled.push(v);
      }
      if (sampled.length >= 2) result.set(code, sampled);
    }
  }

  return result;
}

/**
 * Converts a price series to simple daily returns:
 * rᵢ = (pᵢ - pᵢ₋₁) / pᵢ₋₁
 *
 * Returns array of length (prices.length - 1).
 */
function toReturns(prices: number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const curr = prices[i] ?? 0;
    const prev = prices[i - 1] ?? 0;
    if (prev === 0) {
      returns.push(0);
    } else {
      returns.push((curr - prev) / prev);
    }
  }
  return returns;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Pads a string to a fixed width (left-aligned).
 */
function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/**
 * Builds the Vietnamese formatted correlation table.
 *
 * Output example:
 *   Ma 1  | Ma 2  | Tuong quan | Muc do
 *   VCB   | FPT   | 0.32       | Thap
 *   VCB   | HPG   | 0.78       | Cao (!)
 *   FPT   | HPG   | 0.15       | Rat thap
 *
 *   Diem da dang hoa: 0.58 / 1.00 (Trung binh)
 */
function formatOutput(
  correlations: { pair: [string, string]; r: number }[],
  score: number,
  days: number,
  stockCount: number,
): string {
  const lines: string[] = [];

  lines.push(`=== Ma tran tuong quan (${days} ngay gan nhat) ===`);
  lines.push(`Co phieu phan tich: ${stockCount}  |  Cap tuong quan: ${correlations.length}`);
  lines.push("");

  if (correlations.length === 0) {
    lines.push(
      "Khong du du lieu lich su gia de tinh tuong quan.",
      "Vui long cho he thong thu thap du lieu (toi thieu 2 ngay x 2 co phieu).",
    );
  } else {
    // Table header
    const hdr = [
      pad("Ma 1", 6),
      pad("Ma 2", 6),
      pad("Tuong quan", 12),
      "Muc do",
    ].join(" | ");
    lines.push(hdr);
    lines.push("-".repeat(hdr.length));

    // Sort by |r| descending so strongest correlations appear first
    const sorted = [...correlations].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

    for (const { pair, r } of sorted) {
      const { label, warn } = correlationLabel(r);
      const rStr = r.toFixed(2).padStart(6);
      const warnStr = warn ? " (!)" : "";
      lines.push(
        [
          pad(pair[0], 6),
          pad(pair[1], 6),
          pad(`${rStr}`, 12),
          `${label}${warnStr}`,
        ].join(" | "),
      );
    }

    lines.push("");
    const grade = diversificationGrade(score);
    lines.push(
      `Diem da dang hoa: ${score.toFixed(2)} / 1.00 (${grade})`,
    );

    // Interpretation note
    if (score >= 0.8) {
      lines.push("-> Danh muc da dang hoa tot. Rui ro tap trung thap.");
    } else if (score >= 0.6) {
      lines.push("-> Danh muc da dang hoa trung binh.");
    } else if (score >= 0.4) {
      lines.push("-> Danh muc it da dang hoa. Xem xet them co phieu cac nganh khac.");
    } else {
      lines.push("-> Danh muc tap trung cao, cac co phieu bien dong cung chieu!");
    }
  }

  lines.push("");
  lines.push(`Cap nhat: ${new Date().toISOString()}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

/**
 * Registers the `get_correlation_matrix` MCP tool on the given server.
 *
 * @param server - The McpServer instance to register on.
 */
export function registerCorrelationTools(server: McpServer): void {
  server.tool(
    "get_correlation_matrix",
    "Tinh ma tran tuong quan Pearson cho tat ca cap co phieu trong watchlist. " +
      "Su dung lich su gia tich luy trong SQLite (market_prices_history). " +
      "Tra ve bang tuong quan co phan loai muc do (rat thap / thap / trung binh / cao / rat cao) " +
      "va diem da dang hoa danh muc (0-1). " +
      "Compute Pearson correlation matrix for all watchlist stock pairs using price history.",
    {
      days: z
        .number()
        .int()
        .min(5)
        .max(365)
        .default(30)
        .describe(
          "Number of calendar days of price history to use (default: 30, min: 5, max: 365).",
        ),
      codes: z
        .array(z.string().min(1).max(10))
        .optional()
        .describe(
          "Optional list of stock codes to analyse. If omitted, all watchlist codes are used.",
        ),
      // Test-only injection: path to an in-memory or alternative DB
      _testDb: z.string().optional().describe("Internal: test DB path override"),
    },
    async (args) => {
      const { days: daysRaw, codes: codesArg, _testDb } = args as {
        days?: number;
        codes?: string[];
        _testDb?: string;
      };

      const days = daysRaw ?? 30;

      try {
        // ── Resolve database ────────────────────────────────────────────────
        let db: Database;
        if (_testDb !== undefined) {
          // Test mode: open a fresh in-memory DB (no persistent data)
          db = new Database(_testDb);
        } else {
          await initDatabase();
          db = getDb();
        }

        // ── Resolve stock codes ──────────────────────────────────────────────
        const rawCodes =
          codesArg && codesArg.length > 0
            ? codesArg.map((c) => c.toUpperCase())
            : getWatchlistCodes(db);

        if (rawCodes.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: [
                  "=== Ma tran tuong quan ===",
                  "",
                  "Watchlist trong (khong co co phieu). ",
                  "Vui long them co phieu vao watchlist truoc (add_watchlist_stock).",
                ].join("\n"),
              },
            ],
          };
        }

        // ── Load price history ───────────────────────────────────────────────
        const priceHistory = loadPriceHistory(db, rawCodes, days);

        // Convert to return series — only keep stocks with ≥2 data points
        const returnSeries = new Map<string, number[]>();
        for (const [code, prices] of priceHistory) {
          const returns = toReturns(prices);
          if (returns.length >= 2) {
            returnSeries.set(code, returns);
          }
        }

        // ── Compute correlations ─────────────────────────────────────────────
        const correlations = computeCorrelationMatrix(returnSeries);
        const score = diversificationScore(correlations);

        // ── Format output ────────────────────────────────────────────────────
        const text = formatOutput(
          correlations,
          score,
          days,
          returnSeries.size,
        );

        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        logger.error("[get_correlation_matrix] Error", {
          error: err instanceof Error ? err.message : String(err),
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Loi khi tinh ma tran tuong quan: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
