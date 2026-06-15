/**
 * Task 1179 — get_ticker_intelligence MCP tool
 *
 * Pure read-and-format aggregator: collapses 6 separate data sources into one
 * Vietnamese-language intelligence brief for a single stock ticker.
 *
 * Best-effort per section: each of the 6 sections is wrapped in its own
 * try/catch. A failure in any section never crashes the whole tool.
 *
 * Layer: interface
 * DDD: imports infrastructure store functions + issues inline SQL
 *
 * @module interface/mcp/tools/tickerIntelligenceTools
 */

import type { Database } from "bun:sqlite";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb } from "../../../../infrastructure/db/index.js";
import { getLatestEvidenceScore } from "../../../../infrastructure/db/evidenceFragmentStore.js";
import { getInsiderTransactionsFiltered } from "../../../../infrastructure/db/insiderStore.js";
import { getResolvedClaims } from "../../../../infrastructure/db/predictionClaimStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers (local — do not import from peer tool files)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a price as an integer with comma separators.
 * @example formatPrice(85000) → "85,000"
 */
function formatPrice(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/**
 * Format a volume using abbreviated M/K suffixes.
 * @example formatVolume(1500000) → "1.50M"
 * @example formatVolume(500000) → "500.0K"
 * @example formatVolume(999) → "999"
 */
function formatVolume(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatter — pure function, exported for unit tests
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a complete intelligence brief from pre-computed section strings.
 *
 * Separator lines use exactly 35 `=` characters on both header and footer.
 *
 * @param code      - Uppercased stock ticker
 * @param sections  - Tuple of 6 section content strings
 * @param timestamp - ISO 8601 UTC timestamp string
 * @returns Formatted plain-text brief with header, 6 sections, and footer
 */
export function formatTickerIntelligence(
  code: string,
  sections: [string, string, string, string, string, string],
  timestamp: string,
): string {
  const [s1, s2, s3, s4, s5, s6] = sections;
  const footer = "==================================="; // exactly 35 =

  return [
    `=== INTELLIGENCE BRIEF: ${code} ===`,
    `Thoi gian: ${timestamp}`,
    "",
    "[1] GIÁ",
    s1,
    "",
    "[2] EVIDENCE SCORE",
    s2,
    "",
    "[3] INSIDER (7 NGÀY)",
    s3,
    "",
    "[4] KHỐI NGOẠI",
    s4,
    "",
    "[5] BCTC AI",
    s5,
    "",
    "[6] DỰ ĐOÁN",
    s6,
    "",
    footer,
  ].join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builders — each returns a formatted string or a no-data string
// ─────────────────────────────────────────────────────────────────────────────

/** Section 1: Latest price from market_prices_history */
function buildSection1(db: Database, ticker: string): string {
  let result = "(không có dữ liệu)";
  try {
    type PriceRow = { price: number; volume: number; fetched_at: string };
    const row = db
      .prepare(
        `SELECT price, volume, fetched_at
         FROM market_prices_history
         WHERE code = ?
         ORDER BY fetched_at DESC
         LIMIT 1`,
      )
      .get(ticker) as PriceRow | null;

    if (!row) return result;

    const date = row.fetched_at.slice(0, 10);
    result = `Giá hiện tại: ${formatPrice(row.price)} VND | KL: ${formatVolume(row.volume)} | Ngày: ${date}`;
  } catch (err) {
    console.error("[buildSection1][ticker]", err);
    return "(lỗi truy vấn)";
  }
  return result;
}

/** Section 2: Evidence score from evidence_scores via store function */
function buildSection2(db: Database, ticker: string): string {
  let result = "(không có dữ liệu)";
  try {
    const score = getLatestEvidenceScore(db, ticker);
    if (!score) return result;

    result =
      `Evidence score (${score.score_date}): ` +
      `Bullish ${score.bullish.toFixed(4)} | ` +
      `Bearish ${score.bearish.toFixed(4)} | ` +
      `Neutral ${score.neutral.toFixed(4)} | ` +
      `${score.fragmentCount} fragments`;
  } catch (err) {
    console.error("[buildSection2][ticker]", err);
    return "(lỗi truy vấn)";
  }
  return result;
}

/** Section 3: Recent insider transactions (7 days) from insiderStore */
function buildSection3(db: Database, ticker: string): string {
  let result = "(không có giao dịch insider trong 7 ngày qua)";
  try {
    const sinceDate = new Date(Date.now() - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const txs = getInsiderTransactionsFiltered(db, {
      codes: [ticker],
      sinceDate,
    });

    if (txs.length === 0) return result;

    const typeMap: Record<string, string> = { buy: "mua", sell: "ban" };
    const display = txs.slice(0, 3);
    const lines = display.map(
      (t) =>
        `Insider (${t.fromDate}): ${t.insiderName} [${t.position}] — ${typeMap[t.type] ?? t.type} ${t.executedVolume.toLocaleString("en-US")} cp`,
    );

    if (txs.length > 3) {
      lines.push(`(+${txs.length - 3} giao dịch khác trong 7 ngày)`);
    }

    result = lines.join("\n");
  } catch (err) {
    console.error("[buildSection3][ticker]", err);
    return "(lỗi truy vấn)";
  }
  return result;
}

/** Section 4: Foreign flow from vnstock_trading_stats (inline SQL) */
function buildSection4(db: Database, ticker: string): string {
  let result = "(không có dữ liệu khối ngoại)";
  try {
    type ForeignRow = {
      foreign_volume: number;
      foreign_room: number;
      current_holding_ratio: number;
      date: string;
    };
    const row = db
      .prepare(
        `SELECT foreign_volume, foreign_room, current_holding_ratio,
                substr(fetched_at, 1, 10) AS date
         FROM vnstock_trading_stats
         WHERE code = ?
         ORDER BY fetched_at DESC
         LIMIT 1`,
      )
      .get(ticker) as ForeignRow | null;

    if (!row || row.foreign_volume === 0) return result;

    const holdingRatio = (row.current_holding_ratio * 100).toFixed(2);
    result =
      `Khối ngoại (${row.date}): ` +
      `KL ${formatVolume(row.foreign_volume)} | ` +
      `Room còn lại: ${formatVolume(row.foreign_room)} | ` +
      `Tỷ lệ sở hữu: ${holdingRatio}%`;
  } catch (err) {
    console.error("[buildSection4][ticker]", err);
    return "(lỗi truy vấn)";
  }
  return result;
}

/** Section 5: BCTC AI outlook from financial_reports (inline SQL + JSON.parse) */
function buildSection5(db: Database, ticker: string): string {
  let result = "(chưa có phân tích BCTC)";
  try {
    type ReportRow = {
      action_code: string;
      sort_key: string;
      period_year: number;
      period_quarter: number;
      ai_analysis: string;
    };
    const row = db
      .prepare(
        `SELECT action_code, sort_key, period_year, period_quarter, ai_analysis
         FROM financial_reports
         WHERE action_code = ?
           AND ai_analysis IS NOT NULL
         ORDER BY sort_key DESC
         LIMIT 1`,
      )
      .get(ticker) as ReportRow | null;

    if (!row) return result;

    try {
      const aiAnalysis = JSON.parse(row.ai_analysis) as {
        outlook?: string;
        summary?: string;
      };

      if (
        typeof aiAnalysis.outlook !== "string" ||
        typeof aiAnalysis.summary !== "string"
      ) {
        return "(lỗi phân tích BCTC)";
      }

      const outlookMap: Record<string, string> = {
        positive: "TICH CUC",
        neutral: "TRUNG TINH",
        negative: "TIEU CUC",
        mixed: "HO HOP",
      };
      const outlookVi = outlookMap[aiAnalysis.outlook] ?? "KHONG RO";

      const summaryRaw = aiAnalysis.summary;
      const summaryTruncated =
        summaryRaw.length > 120
          ? summaryRaw.slice(0, 120) + "..."
          : summaryRaw;

      result = `BCTC (${row.sort_key}): Nhận định ${outlookVi} | ${summaryTruncated}`;
    } catch {
      result = "(lỗi phân tích BCTC)";
    }
  } catch (err) {
    console.error("[buildSection5][ticker]", err);
    return "(lỗi truy vấn)";
  }
  return result;
}

/** Section 6: Prediction calibration accuracy via predictionClaimStore */
function buildSection6(db: Database, ticker: string): string {
  let result = "(chưa có dự đoán đã giải quyết)";
  try {
    const claims = getResolvedClaims(db, ticker, 20);
    const N = claims.length;

    if (N === 0) return result;

    // QA note: resolution_outcome === 1 (integer), not string "correct"
    const correct = claims.filter((c) => c.resolution_outcome === 1).length;
    const pct = ((correct / N) * 100).toFixed(1);

    const brierScores = claims
      .map((c) => c.brier_score)
      .filter((v): v is number => v !== null && v !== undefined);

    let avgBrier: string;
    if (brierScores.length > 0) {
      const sum = brierScores.reduce((acc, v) => acc + v, 0);
      avgBrier = (sum / brierScores.length).toFixed(4);
    } else {
      avgBrier = "N/A";
    }

    result = `Dự đoán (${N} resolved): Chính xác ${correct}/${N} (${pct}%) | Brier TB: ${avgBrier}`;
  } catch (err) {
    console.error("[buildSection6][ticker]", err);
    return "(lỗi truy vấn)";
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler — exported for direct test invocation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate data from 6 sources and return a formatted Vietnamese intelligence brief.
 *
 * Each section is independently error-isolated — no section failure can
 * prevent other sections from rendering.
 *
 * @param code - Stock ticker (uppercased and trimmed inside handler)
 * @param db   - SQLite database connection (injected for testing)
 * @returns Complete 6-section brief string (never throws to caller)
 */
export async function handleGetTickerIntelligence(
  code: string,
  db: Database,
): Promise<string> {
  try {
    const ticker = code.toUpperCase().trim();
    const timestamp = new Date().toISOString();

    const section1 = buildSection1(db, ticker);
    const section2 = buildSection2(db, ticker);
    const section3 = buildSection3(db, ticker);
    const section4 = buildSection4(db, ticker);
    const section5 = buildSection5(db, ticker);
    const section6 = buildSection6(db, ticker);

    return formatTickerIntelligence(
      ticker,
      [section1, section2, section3, section4, section5, section6],
      timestamp,
    );
  } catch (err) {
    console.error("[handleGetTickerIntelligence] Unexpected error:", err);
    return "Lỗi: Không thể lấy thông tin. Vui lòng thử lại.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register get_ticker_intelligence MCP tool on the server.
 *
 * @param server - McpServer instance
 * @param db     - Optional injected Database; defaults to getDb() in production
 */
export function registerTickerIntelligenceTools(
  server: McpServer,
  db?: Database,
): void {
  server.tool(
    "get_ticker_intelligence",
    "Get a complete Vietnamese-language pre-trade intelligence brief for one stock ticker. Aggregates latest price, evidence score, insider activity (7 days), foreign flow, BCTC AI outlook, and prediction calibration into a single formatted response. Source tier: 2 (aggregator — multi-source composite: prices tier-2 + evidence tier-3 + insider tier-1 + prediction tier-3; conservative rule assigns tier 2).",
    {
      code: z
        .string()
        .min(1)
        .describe(
          "Stock ticker symbol, e.g. VCB, FPT, HPG. Case-insensitive — uppercased inside the tool.",
        ),
    },
    async ({ code }) => {
      const resolvedDb = db ?? getDb();
      const text = await handleGetTickerIntelligence(code, resolvedDb);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({
          source_tier: 2 as const,
          text,
          fetchedAt: new Date().toISOString(),
        }, null, 2) }],
      };
    },
  );
}
