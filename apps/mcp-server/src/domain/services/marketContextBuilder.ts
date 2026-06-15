/**
 * marketContextBuilder — Task 1563 (Sprint 226)
 *
 * DDD-correct extraction of market context section builders.
 * Pure DB-read functions with no MCP dependency — belongs in domain.
 *
 * Exported:
 *   buildMarketContextText(db, hoursBack) — assembles 4-section context string
 *   buildSystemStatusText(db)             — system status section string
 *
 * Used by:
 *   - src/application/usecases/getCycleBootstrap.ts
 *
 * DDD invariant: this file MUST NOT import from src/infrastructure/.
 * It receives `db: Database` as a parameter (dependency injection).
 * The only non-domain import allowed is `bun:sqlite` (type-only).
 */

import type { Database } from "bun:sqlite";
import { tradingWindowLabel } from "./tradingWindow.js";
import { sqlInClause } from "../utils/sqlHelpers.js";

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

export interface AnalysisRow {
  id: string;
  created_at: string;
  level: string;
  source_title: string | null;
  sentiment: string | null;
  impact_score: number | null;
  impact_direction: string | null;
  summary: string | null;
}

export interface AlertCountRow {
  cnt: number;
}

export interface LastCycleRow {
  triggered_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Known macro indicator codes
// ─────────────────────────────────────────────────────────────────────────────

export const MACRO_CODES = [
  "BRENT", "WTI", "GOLD", "SILVER", "COPPER",
  "WHEAT", "COFFEE", "RUBBER",
  "USD_VND", "USD_INDEX",
  "VN_CPI", "VN_GDP",
  "BTC",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

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

function formatPriceChange(price: number | null, changePct: number | null): string {
  if (price == null) return "N/A";
  const priceStr = price.toLocaleString("vi-VN");
  if (changePct == null) return `${priceStr}`;
  const sign = changePct >= 0 ? "+" : "";
  return `${priceStr} (${sign}${changePct.toFixed(2)}%)`;
}

const PRICE_STALE_THRESHOLD_MS = 24 * 3_600_000;

function isPriceStale(updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  const age = Date.now() - new Date(updatedAt).getTime();
  return age > PRICE_STALE_THRESHOLD_MS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section builders (private)
// ─────────────────────────────────────────────────────────────────────────────

export function buildWatchlistSection(db: Database): string {
  const lines: string[] = [
    "=== WATCHLIST & PRICES ===",
    `Trading window: ${tradingWindowLabel()}`,
  ];

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

  let staleCount = 0;
  for (const r of rows) {
    const stale = isPriceStale(r.price_updated);
    // Task 1850c: suppress change_pct for stale rows — prior-session % is misleading
    const priceStr = formatPriceChange(r.price ?? null, stale ? null : (r.change_pct ?? null));
    const updatedStr = r.price_updated
      ? r.price_updated.slice(0, 16).replace("T", " ")
      : "no price data";
    const staleFlag = stale ? " [STALE]" : "";
    if (staleFlag) staleCount++;
    lines.push(
      `${r.code.padEnd(6)} [${r.exchange}] ${r.domain.padEnd(14)} ${priceStr}  (as of ${updatedStr})${staleFlag}`,
    );
  }
  if (staleCount > 0) {
    lines.push(`⚠ ${staleCount} price(s) are stale (>24h). Do NOT use for intraday signals or daily % calculations.`);
  }

  return lines.join("\n");
}

export function buildMacroSection(db: Database): string {
  const lines: string[] = ["=== MACRO ==="];
  const found: string[] = [];

  try {
    const placeholders = sqlInClause(MACRO_CODES.length);
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

  try {
    const tracked = db
      .prepare(
        `SELECT indicator AS code, value AS price, NULL AS change_pct, extracted_at AS updated_at
         FROM tracked_indicators
         WHERE extracted_at >= datetime('now', '-48 hours')
         GROUP BY indicator
         HAVING extracted_at = MAX(extracted_at)
         ORDER BY indicator
         LIMIT 20`,
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

  try {
    const sbvRow = db
      .prepare(
        `SELECT usd_vnd_official AS rate, fetched_at
         FROM sbv_rates
         ORDER BY fetched_at DESC
         LIMIT 1`,
      )
      .get() as { rate: number | null; fetched_at: string } | undefined;
    if (sbvRow?.rate && sbvRow.rate > 0) {
      found.push(`${"USD_VND".padEnd(12)} ${sbvRow.rate}`);
    }
  } catch {
    // sbv_rates table may not exist in older schemas — skip
  }

  if (found.length === 0) {
    lines.push("No macro data available. Run fetch_macro or wait for the next intelligence cycle.");
  } else {
    lines.push(...found);
  }

  return lines.join("\n");
}

export function buildAlertsSection(db: Database, since: string, hoursBack: number): string {
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

export function buildAnalysisSection(db: Database, since: string, hoursBack: number): string {
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

// ─────────────────────────────────────────────────────────────────────────────
// Public exports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the full market context text (4 sections: watchlist, macro, alerts, analysis).
 * Used by getCycleBootstrap use case.
 */
export function buildMarketContextText(db: Database, hoursBack: number): string {
  const since = new Date(Date.now() - hoursBack * 3_600_000).toISOString();

  const sections: string[] = [
    buildWatchlistSection(db),
    "",
    buildMacroSection(db),
    "",
    buildAlertsSection(db, since, hoursBack),
    "",
    buildAnalysisSection(db, since, hoursBack),
  ];

  return sections.join("\n");
}

/**
 * Build the system status section text.
 * Used by getCycleBootstrap use case.
 */
export function buildSystemStatusText(db: Database): string {
  const lines: string[] = ["=== SYSTEM STATUS ==="];

  let dbError = false;

  let pendingCount = 0;
  try {
    const row = db
      .prepare("SELECT COUNT(*) AS cnt FROM alerts WHERE read = 0")
      .get() as AlertCountRow;
    pendingCount = row?.cnt ?? 0;
  } catch (err) {
    console.error("[buildSystemStatusText] alerts count query failed", err);
    dbError = true;
  }

  let lastCycleStr = "unknown";
  try {
    const row = db
      .prepare("SELECT triggered_at FROM alerts ORDER BY triggered_at DESC LIMIT 1")
      .get() as LastCycleRow | null;
    if (row?.triggered_at) {
      lastCycleStr = row.triggered_at.slice(0, 16).replace("T", " ");
    }
  } catch (err) {
    console.error("[buildSystemStatusText] last cycle query failed", err);
    dbError = true;
  }

  let lastAnalysisStr = "unknown";
  try {
    const row = db
      .prepare("SELECT created_at FROM rag_analyses ORDER BY created_at DESC LIMIT 1")
      .get() as { created_at: string } | null;
    if (row?.created_at) {
      lastAnalysisStr = row.created_at.slice(0, 16).replace("T", " ");
    }
  } catch (err) {
    console.error("[buildSystemStatusText] last analysis query failed", err);
    dbError = true;
  }

  const status = dbError ? "degraded: DB read failed" : "ok";
  const pendingDisplay: string = dbError
    ? "? alerts"
    : `${pendingCount} alert${pendingCount !== 1 ? "s" : ""}`;

  lines.push(
    `${status} | ${pendingDisplay} pending | last alert: ${lastCycleStr} | last analysis: ${lastAnalysisStr}`,
  );

  return lines.join("\n");
}
