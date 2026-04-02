/**
 * Task 239 — get_market_context compound MCP tool (Sprint 037)
 *
 * A single compound tool that replaces the 5-call opening sequence every
 * analysis agent performs at the start of each session:
 *
 *   get_watchlist → get_market_snapshot → get_macro_snapshot
 *     → get_alerts → get_analysis_history
 *
 * Returns a single structured text response with 5 labeled sections,
 * reducing agent startup latency and token overhead.
 *
 * Tool registered:
 *   1. get_market_context — compound context fetch for all analysis agents
 *
 * @module interface/mcp/tools/marketContextTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { getDb, initDatabase } from "../../../infrastructure/db/schema.js";

// ─────────────────────────────────────────────────────────────────────────────
// SQLite row types
// ─────────────────────────────────────────────────────────────────────────────

interface WatchlistWithPrice {
  code: string;
  exchange: string;
  domain: string;
  notes: string | null;
  alert_drop_pct: number;
  alert_rise_pct: number;
  alert_impact_min: number;
  price: number | null;
  change_pct: number | null;
  price_updated: string | null;
}

interface MacroRow {
  code: string;
  price: number | null;
  change_pct: number | null;
  updated_at: string | null;
}

interface AlertRow {
  id: string;
  triggered_at: string;
  severity: string;
  signals_json: string | null;
  affected_actions_json: string | null;
  message: string | null;
}

interface AnalysisRow {
  id: string;
  created_at: string;
  level: string;
  source_title: string | null;
  sentiment: string | null;
  impact_score: number | null;
  impact_direction: string | null;
  summary: string | null;
}

interface AlertCountRow {
  cnt: number;
}

interface LastCycleRow {
  triggered_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Known macro indicator codes (from commodity_prices / yahooFinance fetcher)
// ─────────────────────────────────────────────────────────────────────────────

const MACRO_CODES = [
  "BRENT", "WTI", "GOLD", "SILVER", "COPPER",
  "WHEAT", "COFFEE", "RUBBER",
  "USD_VND", "USD_INDEX",
  "VN_CPI", "VN_GDP",
  "BTC",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse affected_actions_json and extract stock codes.
 */
function parseAffectedCodes(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "code" in item) {
          return String((item as { code: unknown }).code);
        }
        return null;
      })
      .filter((v): v is string => v !== null);
  } catch {
    return [];
  }
}

/**
 * Parse signals_json and extract signal type strings.
 */
function parseSignalTypes(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "type" in item) {
          return String((item as { type: unknown }).type);
        }
        return null;
      })
      .filter((v): v is string => v !== null);
  } catch {
    return [];
  }
}

/**
 * Format a price + change_pct as a readable string.
 * @param price - Price in VND (or USD for commodities)
 * @param changePct - Percentage change (can be null)
 */
function formatPriceChange(price: number | null, changePct: number | null): string {
  if (price == null) return "N/A";
  const priceStr = price.toLocaleString("vi-VN");
  if (changePct == null) return `${priceStr}`;
  const sign = changePct >= 0 ? "+" : "";
  return `${priceStr} (${sign}${changePct.toFixed(2)}%)`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builders
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the WATCHLIST & PRICES section.
 * Joins watchlist with market_prices for the latest price snapshot.
 */
function buildWatchlistSection(db: ReturnType<typeof getDb>): string {
  const lines: string[] = ["=== WATCHLIST & PRICES ==="];

  let rows: WatchlistWithPrice[];
  try {
    rows = db
      .prepare(
        `SELECT w.code, w.exchange, w.domain, w.notes,
                w.alert_drop_pct, w.alert_rise_pct, w.alert_impact_min,
                p.price, p.change_pct, p.updated_at AS price_updated
         FROM watchlist w
         LEFT JOIN market_prices p ON p.code = w.code
         ORDER BY w.domain, w.code`,
      )
      .all() as WatchlistWithPrice[];
  } catch {
    rows = [];
  }

  if (rows.length === 0) {
    lines.push("Watchlist is empty. Use add_to_watchlist to add stocks.");
    return lines.join("\n");
  }

  for (const r of rows) {
    const priceStr = formatPriceChange(r.price ?? null, r.change_pct ?? null);
    const updatedStr = r.price_updated
      ? r.price_updated.slice(0, 16).replace("T", " ")
      : "no price data";
    lines.push(
      `${r.code.padEnd(6)} [${r.exchange}] ${r.domain.padEnd(14)} ${priceStr}  (as of ${updatedStr})`,
    );
  }

  return lines.join("\n");
}

/**
 * Build the MACRO section.
 * Queries market_prices for known macro indicator codes.
 * Also checks for a tracked_indicators table if it exists.
 */
function buildMacroSection(db: ReturnType<typeof getDb>): string {
  const lines: string[] = ["=== MACRO ==="];
  const found: string[] = [];

  // Query known macro codes from market_prices
  try {
    const placeholders = MACRO_CODES.map(() => "?").join(", ");
    const rows = db
      .prepare(
        `SELECT code, price, change_pct, updated_at
         FROM market_prices
         WHERE code IN (${placeholders})
         ORDER BY code`,
      )
      .all(...MACRO_CODES) as MacroRow[];

    for (const row of rows) {
      const priceStr = formatPriceChange(row.price ?? null, row.change_pct ?? null);
      found.push(`${row.code.padEnd(12)} ${priceStr}`);
    }
  } catch {
    // market_prices may not have these codes
  }

  // Also check tracked_indicators table if it exists
  try {
    const tracked = db
      .prepare(
        `SELECT indicator_name AS code, value AS price, NULL AS change_pct, updated_at
         FROM tracked_indicators
         WHERE updated_at >= datetime('now', '-48 hours')
         ORDER BY updated_at DESC
         LIMIT 10`,
      )
      .all() as MacroRow[];

    for (const row of tracked) {
      const alreadyShown = found.some((line) => line.startsWith(row.code));
      if (!alreadyShown) {
        const priceStr = row.price != null ? String(row.price) : "N/A";
        found.push(`${row.code.padEnd(12)} ${priceStr}`);
      }
    }
  } catch {
    // tracked_indicators table doesn't exist in this schema version — skip
  }

  if (found.length === 0) {
    lines.push("No macro data available. Run fetch_macro or wait for the next intelligence cycle.");
  } else {
    lines.push(...found);
  }

  return lines.join("\n");
}

/**
 * Build the OPEN ALERTS section.
 * Returns unresolved alerts (read=0) within the hours_back window,
 * ordered by triggered_at DESC, limited to 20.
 */
function buildAlertsSection(
  db: ReturnType<typeof getDb>,
  since: string,
  hoursBack: number,
): string {
  const lines: string[] = [`=== OPEN ALERTS (${hoursBack}h) ===`];

  let rows: AlertRow[];
  try {
    rows = db
      .prepare(
        `SELECT id, triggered_at, severity, signals_json, affected_actions_json, message
         FROM alerts
         WHERE triggered_at >= ? AND read = 0
         ORDER BY triggered_at DESC
         LIMIT 20`,
      )
      .all(since) as AlertRow[];
  } catch {
    rows = [];
  }

  if (rows.length === 0) {
    lines.push("No open alerts in this window.");
    return lines.join("\n");
  }

  lines.push(`${rows.length} open alert${rows.length !== 1 ? "s" : ""}:`);
  for (const row of rows) {
    const severityLabel = row.severity.toUpperCase();
    const codes = parseAffectedCodes(row.affected_actions_json).join(", ") || "—";
    const signals = parseSignalTypes(row.signals_json).join(", ") || "—";
    const ts = row.triggered_at.slice(0, 16).replace("T", " ");
    lines.push(`  [${severityLabel}] ${ts}  ${codes}  (${signals})`);
    if (row.message) {
      lines.push(`    ${row.message}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build the RECENT ANALYSIS section.
 * Returns rag_analyses within the hours_back window, ordered by
 * impact_score DESC then created_at DESC, limited to 10.
 */
function buildAnalysisSection(
  db: ReturnType<typeof getDb>,
  since: string,
  hoursBack: number,
): string {
  const lines: string[] = [`=== RECENT ANALYSIS (${hoursBack}h) ===`];

  let rows: AnalysisRow[];
  try {
    rows = db
      .prepare(
        `SELECT id, created_at, level, source_title, sentiment,
                impact_score, impact_direction, summary
         FROM rag_analyses
         WHERE created_at >= ?
         ORDER BY impact_score DESC, created_at DESC
         LIMIT 10`,
      )
      .all(since) as AnalysisRow[];
  } catch {
    rows = [];
  }

  if (rows.length === 0) {
    lines.push("No analysis entries in this window.");
    return lines.join("\n");
  }

  rows.forEach((row, idx) => {
    const sentiment = row.sentiment ?? "unknown";
    const score = row.impact_score != null ? row.impact_score.toFixed(1) : "N/A";
    const direction = row.impact_direction ?? "neutral";
    const title = row.source_title ?? "(no title)";
    const ts = row.created_at.slice(0, 16).replace("T", " ");
    const truncatedTitle = title.length > 80 ? title.slice(0, 80) + "…" : title;
    lines.push(
      `${idx + 1}. [${sentiment}] ${truncatedTitle} (score: ${score} ${direction}) — ${ts}`,
    );
    if (row.summary) {
      const truncated = row.summary.length > 100
        ? row.summary.slice(0, 100) + "…"
        : row.summary;
      lines.push(`   ${truncated}`);
    }
  });

  return lines.join("\n");
}

/**
 * Build the SYSTEM STATUS section.
 * Shows: overall status, number of unread/pending alerts, last analysis time.
 */
function buildSystemSection(db: ReturnType<typeof getDb>): string {
  const lines: string[] = ["=== SYSTEM STATUS ==="];

  // Count all unread alerts (not just windowed)
  let pendingCount = 0;
  try {
    const row = db
      .prepare("SELECT COUNT(*) AS cnt FROM alerts WHERE read = 0")
      .get() as AlertCountRow;
    pendingCount = row?.cnt ?? 0;
  } catch {
    pendingCount = 0;
  }

  // Last analysis entry timestamp
  let lastCycleStr = "unknown";
  try {
    const row = db
      .prepare("SELECT triggered_at FROM alerts ORDER BY triggered_at DESC LIMIT 1")
      .get() as LastCycleRow | null;
    if (row?.triggered_at) {
      lastCycleStr = row.triggered_at.slice(0, 16).replace("T", " ");
    }
  } catch {
    // ignore
  }

  // Last RAG analysis
  let lastAnalysisStr = "unknown";
  try {
    const row = db
      .prepare("SELECT created_at FROM rag_analyses ORDER BY created_at DESC LIMIT 1")
      .get() as { created_at: string } | null;
    if (row?.created_at) {
      lastAnalysisStr = row.created_at.slice(0, 16).replace("T", " ");
    }
  } catch {
    // ignore
  }

  const status = "ok";
  lines.push(`${status} | ${pendingCount} alert${pendingCount !== 1 ? "s" : ""} pending | last alert: ${lastCycleStr} | last analysis: ${lastAnalysisStr}`);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the get_market_context compound tool on an McpServer instance.
 *
 * This single tool replaces the 5-call opening sequence every analysis agent
 * uses at session start. All 5 data sources are queried in a single DB
 * transaction pass and assembled into one structured text response.
 *
 * @param server - The McpServer instance to register the tool on.
 */
export function registerMarketContextTools(server: McpServer): void {
  server.tool(
    "get_market_context",
    "One-shot compound context fetch for analysis agents. " +
      "Returns a single response with 5 labeled sections: " +
      "(1) WATCHLIST & PRICES — all watchlist stocks with last known price/change; " +
      "(2) MACRO — latest commodity prices and macro indicators (oil, gold, USD/VND, CPI); " +
      "(3) OPEN ALERTS — unread alerts within the time window; " +
      "(4) RECENT ANALYSIS — latest RAG analysis entries ordered by impact score; " +
      "(5) SYSTEM STATUS — health summary with pending alert count and last cycle time. " +
      "Use this at the start of every agent session instead of calling " +
      "get_watchlist + get_market_snapshot + get_macro_snapshot + get_alerts + get_analysis_history separately.",
    {
      hours_back: z
        .number()
        .int()
        .min(1)
        .max(168)
        .default(24)
        .optional()
        .describe(
          "How many hours back to look for alerts and analysis entries (default: 24, max: 168)",
        ),
    },
    async ({ hours_back: hoursBackRaw }) => {
      const hoursBack = hoursBackRaw ?? 24;

      try {
        await initDatabase();
        const db = getDb();

        const since = new Date(Date.now() - hoursBack * 3_600_000).toISOString();

        const sections: string[] = [
          buildWatchlistSection(db),
          "",
          buildMacroSection(db),
          "",
          buildAlertsSection(db, since, hoursBack),
          "",
          buildAnalysisSection(db, since, hoursBack),
          "",
          buildSystemSection(db),
        ];

        return {
          content: [{ type: "text" as const, text: sections.join("\n") }],
        };
      } catch (err) {
        console.error("[get_market_context] Error:", err);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error assembling market context: ${(err as Error).message}`,
            },
          ],
        };
      }
    },
  );
}
